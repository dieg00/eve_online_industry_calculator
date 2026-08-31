"""Entrada pública del motor: ``resolve(...) -> ResolveResult``.

Toma un typeID (producto o blueprint), los supuestos y un ``PriceProvider``, y
devuelve el coste real, el margen contra mercado y el árbol de decisiones.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace

from eveindustry.engine.makeorbuy import (
    MakeOrBuyResult,
    buy_price,
    pass1,
    resolve_make_or_buy,
)
from eveindustry.engine.policy import NodePolicy
from eveindustry.invention.cost import InventionOutcome, InventionParams, rank_decryptors
from eveindustry.model.assumptions import Assumptions
from eveindustry.model.dataset import Dataset
from eveindustry.prices.base import PriceProvider, resolve_price


@dataclass
class NodeResult:
    type_id: int
    name: str
    decision: str                     # "build" | "buy"
    policy_source: str                # "type" | "category" | "activity" | "default" | "no-blueprint"
    marginal_unit_cost: float         # pasada 1
    # solo si se construye:
    blueprint_type_id: int | None = None
    demand: int = 0
    jobs: list[int] = field(default_factory=list)
    produced: int = 0
    install_cost: float = 0.0
    real_unit_cost: float | None = None
    children: dict[int, int] = field(default_factory=dict)   # child_type_id -> qty consumida
    flipped_to_buy: bool = False
    # invención (solo si assumptions.invention y el item es T2 invencionable):
    invention_decryptor: str | None = None
    invention_probability: float | None = None
    invention_cost_per_unit: float | None = None
    effective_me: int | None = None


@dataclass
class ResolveResult:
    root_type_id: int
    root_name: str
    root_demand: int

    total_cost: float
    unit_cost: float
    total_install_cost: float
    total_material_cost: float
    total_invention_cost: float

    revenue: float | None             # ingreso neto tras comisiones (por root_demand unidades)
    margin: float | None
    margin_pct: float | None

    root_should_buy: bool             # la pasada 1 dice que sale más barato comprar el root entero
    root_buy_price: float | None

    nodes: dict[int, NodeResult] = field(default_factory=dict)
    leaves: dict[int, int] = field(default_factory=dict)          # comprado/raw -> qty
    leaf_cost: dict[int, float] = field(default_factory=dict)     # comprado/raw -> coste total
    flips: list[int] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    fixpoint_iterations: int = 1


def resolve(
    dataset: Dataset,
    type_id: int,
    assumptions: Assumptions,
    prices: PriceProvider,
) -> ResolveResult:
    root_id = dataset.normalize_to_product(type_id)

    # --- capa de invención (opcional): elegir decryptor por item T2 ---
    inv_outcomes: dict[int, InventionOutcome] = {}
    unit_surcharge: dict[int, float] = {}
    effective_assumptions = assumptions
    if assumptions.invention is not None:
        baseline = pass1(dataset, assumptions, prices, root_id)
        inv_outcomes, me_override, unit_surcharge = _plan_invention(
            dataset, assumptions.invention, prices, baseline.unit_build_cost
        )
        if me_override:
            effective_assumptions = replace(
                assumptions, me_map={**assumptions.me_map, **me_override}
            )

    mob: MakeOrBuyResult = resolve_make_or_buy(
        dataset, effective_assumptions, prices, root_id, unit_surcharge or None
    )
    assumptions = effective_assumptions
    p1, p2 = mob.pass1, mob.pass2

    warnings = list(dict.fromkeys(p1.warnings + p2.warnings))  # dedup preservando orden

    # --- coste ---
    total_install = sum(n.install_cost for n in p2.built.values())
    leaf_cost: dict[int, float] = {}
    total_leaf = 0.0
    for t, qty in p2.leaves.items():
        price = buy_price(prices, assumptions, t)
        if price is None:
            warnings.append(f"sin precio de compra para hoja {t}; contada como 0")
            price = 0.0
        c = price * qty
        leaf_cost[t] = c
        total_leaf += c

    total_invention = sum(
        node.produced * unit_surcharge.get(t, 0.0) for t, node in p2.built.items()
    )
    total_cost = total_install + total_leaf + total_invention

    root_node = p2.built.get(root_id)
    produced = root_node.produced if root_node else assumptions.root_demand
    unit_cost = total_cost / produced if produced else total_cost

    # --- ingreso / margen ---
    market_out = resolve_price(prices, root_id, assumptions.valuation.output_price_kind)
    revenue = margin = margin_pct = None
    if market_out is not None:
        revenue = market_out * assumptions.valuation.output_retention * assumptions.root_demand
        margin = revenue - total_cost
        margin_pct = (margin / total_cost) if total_cost else None

    root_buy = buy_price(prices, assumptions, root_id)
    root_should_buy = p1.decision.get(root_id) is NodePolicy.BUY

    # --- árbol de nodos ---
    flip_set = set(mob.flips)
    nodes: dict[int, NodeResult] = {}
    all_ids = set(p1.decision) | set(p2.built)
    for t in all_ids:
        info = dataset.types.get(t)
        built = p2.built.get(t)
        decided = mob.decision.get(t, p1.decision.get(t, NodePolicy.BUY))
        outcome = inv_outcomes.get(t)
        nodes[t] = NodeResult(
            type_id=t,
            name=dataset.type_name(t),
            decision="build" if built is not None else decided.value,
            policy_source=p1.policy_source.get(t, "default"),
            marginal_unit_cost=p1.unit_cost.get(t, float("nan")),
            blueprint_type_id=built.blueprint_type_id if built else None,
            demand=built.demand if built else 0,
            jobs=list(built.jobs) if built else [],
            produced=built.produced if built else 0,
            install_cost=built.install_cost if built else 0.0,
            real_unit_cost=built.real_unit_cost if built else None,
            children=dict(built.child_consumption) if built else {},
            flipped_to_buy=t in flip_set,
            invention_decryptor=outcome.decryptor.name if outcome else None,
            invention_probability=outcome.probability if outcome else None,
            invention_cost_per_unit=outcome.invention_cost_per_unit if outcome else None,
            effective_me=outcome.effective_me if outcome else None,
        )

    return ResolveResult(
        root_type_id=root_id,
        root_name=dataset.type_name(root_id),
        root_demand=assumptions.root_demand,
        total_cost=total_cost,
        unit_cost=unit_cost,
        total_install_cost=total_install,
        total_material_cost=total_leaf,
        total_invention_cost=total_invention,
        revenue=revenue,
        margin=margin,
        margin_pct=margin_pct,
        root_should_buy=root_should_buy,
        root_buy_price=root_buy,
        nodes=nodes,
        leaves=dict(p2.leaves),
        leaf_cost=leaf_cost,
        flips=list(mob.flips),
        warnings=warnings,
        fixpoint_iterations=mob.iterations,
    )


def _plan_invention(
    dataset: Dataset,
    params: InventionParams,
    prices: PriceProvider,
    baseline_unit_build_cost: dict[int, float],
) -> tuple[dict[int, InventionOutcome], dict[int, int], dict[int, float]]:
    """Elige el mejor decryptor para cada item T2 alcanzable.

    Aproximación v1: el coste de fabricación que ve el optimizador es el coste
    unitario marginal de una pasada 1 baseline (ME por defecto); no se re-evalúa
    la cadena por cada ME candidato. Devuelve
    ``(outcome por productTypeID, ME efectivo por blueprintTypeID, surcharge por productTypeID)``.
    """
    outcomes: dict[int, InventionOutcome] = {}
    me_override: dict[int, int] = {}
    surcharge: dict[int, float] = {}

    for product_id, marginal_cost in baseline_unit_build_cost.items():
        bp = dataset.blueprint_for_product(product_id)
        if bp is None or bp.invention is None:
            continue
        p = replace(params, t2_produces_per_run=bp.produces_per_run)
        ranked = rank_decryptors(
            bp.invention, prices, p, manufacturing_unit_cost=marginal_cost
        )
        if not ranked:
            continue
        best = ranked[0]
        outcomes[product_id] = best
        surcharge[product_id] = best.invention_cost_per_unit
        me_override[bp.blueprint_type_id] = best.effective_me

    return outcomes, me_override, surcharge
