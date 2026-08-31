"""Resolvedor make-or-buy: el núcleo (plan §4).

Dos pasadas + punto fijo:

- **Pasada 1** (``pass1``): coste unitario *marginal* por nodo, bottom-up,
  memoizado por typeID. Ignora el suelo ``max(runs,…)`` y el troceo por
  ``maxProductionLimit`` (límite de lote grande). Decide build/buy en cada nodo
  ``auto``. Es la decisión económica.
- **Pasada 2** (``pass2``): despiece EXACTO, top-down en orden topológico sobre el
  subgrafo de construidos. Acumula demanda (suma antes de trocear) y calcula
  trabajos, materiales por trabajo y coste de instalación una sola vez por nodo.
- **Punto fijo** (``resolve_make_or_buy``): si el coste unitario REAL de un nodo
  ``auto`` sale por encima de su precio de compra (el lote real era pequeño y el
  suelo mordió), se cambia a comprar y se repite la pasada 2. Monótono.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from eveindustry.engine.graph import build_subgraph, topological_order
from eveindustry.engine.jobcost import job_install_cost
from eveindustry.engine.me import job_material_totals, runs_for_demand
from eveindustry.engine.policy import NodePolicy, PolicyConfig, PolicyDecision
from eveindustry.model.assumptions import Assumptions
from eveindustry.model.dataset import Dataset
from eveindustry.model.types import ACTIVITY_MANUFACTURING
from eveindustry.prices.base import PriceProvider, resolve_price


# --------------------------------------------------------------------------- #
# helpers                                                                     #
# --------------------------------------------------------------------------- #
def structure_factor(dataset: Dataset, assumptions: Assumptions, blueprint) -> float:
    cfg = assumptions.structure_for(blueprint.product_type_id)
    info = dataset.types.get(blueprint.product_type_id)
    group = info.group_id if info else 0
    category = info.category_id if info else 0
    return cfg.material_factor(
        assumptions.rig_catalog, blueprint.activity_id, group, category
    )


def facility_tax(assumptions: Assumptions, product_type_id: int) -> float:
    return assumptions.structure_for(product_type_id).facility_tax


def buy_price(prices: PriceProvider, assumptions: Assumptions, type_id: int) -> float | None:
    return resolve_price(prices, type_id, assumptions.valuation.input_price_kind)


def install_rate(assumptions: Assumptions, activity_id: int, product_type_id: int) -> float:
    return (
        assumptions.indices.for_activity(activity_id)
        + facility_tax(assumptions, product_type_id)
        + assumptions.constants.scc_surcharge
        + assumptions.constants.alpha_clone_tax
    )


# --------------------------------------------------------------------------- #
# pasada 1: decisión                                                          #
# --------------------------------------------------------------------------- #
@dataclass
class Pass1Result:
    unit_cost: dict[int, float] = field(default_factory=dict)
    decision: dict[int, NodePolicy] = field(default_factory=dict)   # BUILD | BUY
    policy_source: dict[int, str] = field(default_factory=dict)
    unit_build_cost: dict[int, float] = field(default_factory=dict)
    auto_nodes: set[int] = field(default_factory=set)               # dónde la política efectiva fue AUTO
    warnings: list[str] = field(default_factory=list)


def pass1(
    dataset: Dataset,
    assumptions: Assumptions,
    prices: PriceProvider,
    root_id: int,
    unit_surcharge: dict[int, float] | None = None,
) -> Pass1Result:
    policy: PolicyConfig = assumptions.policy or PolicyConfig()
    surcharge = unit_surcharge or {}
    res = Pass1Result()
    visiting: set[int] = set()

    def buy_or_inf(type_id: int, warn: bool) -> float:
        price = buy_price(prices, assumptions, type_id)
        if price is None:
            if warn:
                res.warnings.append(f"sin precio de compra para {type_id}; coste = inf")
            return math.inf
        return price

    def unit_cost(type_id: int, depth: int) -> float:
        if type_id in res.unit_cost:
            return res.unit_cost[type_id]
        if type_id in visiting:
            res.warnings.append(f"ciclo en {type_id}; tratado como compra en pasada 1")
            return buy_or_inf(type_id, warn=True)
        if depth > assumptions.max_depth:
            res.warnings.append(f"profundidad > {assumptions.max_depth} en {type_id}; hoja")
            return buy_or_inf(type_id, warn=True)

        bp = dataset.blueprint_for_product(type_id)
        info = dataset.types.get(type_id)
        category = info.category_id if info else None
        activity = bp.activity_name if bp else None
        decision = policy.resolve(
            type_id,
            category_id=category,
            activity_name=activity,
            has_blueprint=bp is not None,
        )

        # "vertical de minerales": construir si hay blueprint de manufacturing;
        # comprar reacciones y todo lo que no tiene blueprint (minerales, PI, gas).
        if decision.policy is NodePolicy.MINERALS:
            keep = bp is not None and bp.activity_id == ACTIVITY_MANUFACTURING
            decision = PolicyDecision(
                NodePolicy.BUILD if keep else NodePolicy.BUY,
                "minerals-build" if keep else "minerals-buy",
            )

        if decision.policy is NodePolicy.AUTO:
            res.auto_nodes.add(type_id)

        # rama comprar pura
        if bp is None or decision.policy is NodePolicy.BUY:
            price = buy_or_inf(type_id, warn=True)
            res.unit_cost[type_id] = price
            res.decision[type_id] = NodePolicy.BUY
            res.policy_source[type_id] = decision.source
            return price

        # construir: recursión
        visiting.add(type_id)
        me = assumptions.me_for(bp.blueprint_type_id)
        sf = structure_factor(dataset, assumptions, bp)

        eiv_per_unit = 0.0
        for mat_id, base_qty in bp.materials:
            adj = prices.adjusted(mat_id)
            if adj is None:
                res.warnings.append(
                    f"sin adjusted_price para {mat_id} (EIV de {type_id} infravalorado)"
                )
            else:
                eiv_per_unit += adj * base_qty
        eiv_per_unit /= bp.produces_per_run
        install_per_unit = eiv_per_unit * install_rate(
            assumptions, bp.activity_id, type_id
        )

        material_per_unit = 0.0
        for mat_id, base_qty in bp.materials:
            ratio = base_qty * (1.0 - me / 100.0) * sf / bp.produces_per_run
            material_per_unit += unit_cost(mat_id, depth + 1) * max(0.0, ratio)

        build_unit = install_per_unit + material_per_unit + surcharge.get(type_id, 0.0)
        visiting.discard(type_id)
        res.unit_build_cost[type_id] = build_unit
        res.policy_source[type_id] = decision.source

        if decision.policy is NodePolicy.BUILD:
            res.unit_cost[type_id] = build_unit
            res.decision[type_id] = NodePolicy.BUILD
            return build_unit

        # AUTO
        buy = buy_price(prices, assumptions, type_id)
        if buy is None or build_unit < buy:
            res.unit_cost[type_id] = build_unit
            res.decision[type_id] = NodePolicy.BUILD
        else:
            res.unit_cost[type_id] = buy
            res.decision[type_id] = NodePolicy.BUY
        return res.unit_cost[type_id]

    unit_cost(root_id, 0)
    return res


# --------------------------------------------------------------------------- #
# pasada 2: despiece exacto                                                   #
# --------------------------------------------------------------------------- #
@dataclass
class BuiltNode:
    product_type_id: int
    blueprint_type_id: int
    demand: int
    produces_per_run: int
    jobs: list[int]
    me: float
    structure_factor: float
    install_cost: float = 0.0
    child_consumption: dict[int, int] = field(default_factory=dict)  # child_id -> qty total
    real_unit_cost: float | None = None

    @property
    def total_runs(self) -> int:
        return sum(self.jobs)

    @property
    def produced(self) -> int:
        return self.total_runs * self.produces_per_run


@dataclass
class Pass2Result:
    built: dict[int, BuiltNode] = field(default_factory=dict)
    leaves: dict[int, int] = field(default_factory=dict)      # comprado/raw -> qty
    order: list[int] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def pass2(
    dataset: Dataset,
    assumptions: Assumptions,
    prices: PriceProvider,
    root_id: int,
    decision: dict[int, NodePolicy],
) -> Pass2Result:
    build_set = {t for t, d in decision.items() if d is NodePolicy.BUILD}
    built_ids = build_set | {root_id}
    children, _parents = build_subgraph(dataset, root_id, build_set)
    order, in_cycle = topological_order(built_ids, children)

    res = Pass2Result(order=order)
    for t in in_cycle:
        res.warnings.append(f"{t} en ciclo del subgrafo de build; tratado como hoja")

    demand: dict[int, int] = {t: 0 for t in order}
    demand[root_id] = demand.get(root_id, 0) + assumptions.root_demand

    for t in order:
        bp = dataset.blueprint_for_product(t)
        if bp is None or demand.get(t, 0) <= 0:
            continue
        me = assumptions.me_for(bp.blueprint_type_id)
        sf = structure_factor(dataset, assumptions, bp)
        jobs = runs_for_demand(demand[t], bp.produces_per_run, bp.max_production_limit)

        node = BuiltNode(
            product_type_id=t,
            blueprint_type_id=bp.blueprint_type_id,
            demand=demand[t],
            produces_per_run=bp.produces_per_run,
            jobs=jobs,
            me=me,
            structure_factor=sf,
        )
        totals = job_material_totals(bp.materials, jobs, me, sf)
        node.child_consumption = dict(totals)

        for runs in jobs:
            jc = job_install_cost(
                bp.materials,
                runs,
                bp.activity_id,
                prices,
                assumptions.indices,
                assumptions.constants,
                facility_tax=facility_tax(assumptions, t),
            )
            node.install_cost += jc.total
            for mid in jc.missing_prices:
                res.warnings.append(
                    f"sin adjusted_price para {mid} (EIV de {t} infravalorado)"
                )

        res.built[t] = node
        for child_id, qty in totals.items():
            if child_id in demand:                     # otro nodo construido
                demand[child_id] += qty
            else:                                      # hoja: se compra / raw
                res.leaves[child_id] = res.leaves.get(child_id, 0) + qty

    return res


def compute_real_unit_costs(
    assumptions: Assumptions,
    prices: PriceProvider,
    p2: Pass2Result,
    unit_surcharge: dict[int, float] | None = None,
) -> None:
    """Coste unitario REAL de cada nodo construido, bottom-up (orden topo inverso).

    ``unit_surcharge[t]`` es un coste extra por unidad de producto (p. ej. la
    invención amortizada). Entra tanto en el coste del nodo como en el de sus
    padres a través de ``child_node.real_unit_cost``.
    """
    surcharge = unit_surcharge or {}
    for t in reversed(p2.order):
        node = p2.built.get(t)
        if node is None:
            continue
        child_cost = 0.0
        for child_id, qty in node.child_consumption.items():
            child_node = p2.built.get(child_id)
            if child_node is not None and child_node.real_unit_cost is not None:
                child_cost += child_node.real_unit_cost * qty
            else:
                child_cost += (buy_price(prices, assumptions, child_id) or 0.0) * qty
        # Coste por unidad DEMANDADA, no por unidad producida. Cuando un trabajo
        # sobreproduce (reacciones que hacen 10.000/run para una demanda de 17),
        # el excedente no tiene valor: su coste se carga a quien lo pidió. Así el
        # punto fijo compara peras con peras y descarta construir a demanda ínfima.
        denom = node.demand or node.produced or 1
        node.real_unit_cost = (child_cost + node.install_cost) / denom + surcharge.get(
            t, 0.0
        )


# --------------------------------------------------------------------------- #
# punto fijo                                                                  #
# --------------------------------------------------------------------------- #
@dataclass
class MakeOrBuyResult:
    pass1: Pass1Result
    pass2: Pass2Result
    decision: dict[int, NodePolicy]
    flips: list[int]                 # nodos auto que el punto fijo pasó a comprar
    iterations: int


def resolve_make_or_buy(
    dataset: Dataset,
    assumptions: Assumptions,
    prices: PriceProvider,
    root_id: int,
    unit_surcharge: dict[int, float] | None = None,
) -> MakeOrBuyResult:
    p1 = pass1(dataset, assumptions, prices, root_id, unit_surcharge)
    decision = dict(p1.decision)
    flips: list[int] = []

    p2 = pass2(dataset, assumptions, prices, root_id, decision)
    compute_real_unit_costs(assumptions, prices, p2, unit_surcharge)

    iterations = 1
    for _ in range(assumptions.max_fixpoint_iterations):
        changed = False
        for t, node in list(p2.built.items()):
            if t == root_id or t not in p1.auto_nodes:
                continue
            buy = buy_price(prices, assumptions, t)
            if (
                buy is not None
                and node.real_unit_cost is not None
                and node.real_unit_cost > buy * (1.0 + 1e-9)
            ):
                decision[t] = NodePolicy.BUY
                flips.append(t)
                changed = True
        if not changed:
            break
        p2 = pass2(dataset, assumptions, prices, root_id, decision)
        compute_real_unit_costs(assumptions, prices, p2, unit_surcharge)
        iterations += 1

    return MakeOrBuyResult(
        pass1=p1, pass2=p2, decision=decision, flips=flips, iterations=iterations
    )
