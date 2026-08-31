"""Coste esperado de invención por unidad T2 y optimizador de decryptor (plan §7).

    coste_por_unidad_T2(decryptor) =
        (coste_por_intento / P) / (runs_T2 · producesPerRun)   +  coste_fabricación_por_unidad(ME_efectivo)

Se elige el decryptor (o "sin decryptor") que minimiza ese total. El coste de
fabricación entra por un callback para no acoplar este módulo al resolvedor.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from eveindustry.invention.decryptors import DECRYPTORS, Decryptor
from eveindustry.invention.probability import invention_probability
from eveindustry.model.types import INVENTED_BASE_ME, INVENTED_BASE_TE, InventionData
from eveindustry.prices.base import PriceKind, PriceProvider, resolve_price

ME_MIN, ME_MAX = 0, 10
TE_MIN, TE_MAX = 0, 20


@dataclass
class InventionParams:
    encryption_level: int = 5
    science1_level: int = 5
    science2_level: int = 5
    datacore_price_kind: PriceKind = PriceKind.SELL
    decryptor_price_kind: PriceKind = PriceKind.SELL
    t1_bpc_cost_per_run: float = 0.0            # coste de 1 run de BPC T1 (0 si te lo copias)
    invention_job_cost_per_attempt: float = 0.0  # coste de instalación del trabajo de invención
    t2_produces_per_run: int = 1               # unidades T2 por run del BPC (casi siempre 1)
    allowed_decryptors: tuple[int | None, ...] | None = None  # None = todos


@dataclass(frozen=True)
class InventionOutcome:
    decryptor: Decryptor
    probability: float
    attempts_per_success: float
    cost_per_attempt: float
    cost_per_success: float
    runs_per_success: int
    t2_units_per_success: int
    invention_cost_per_unit: float
    effective_me: int
    effective_te: int
    manufacturing_unit_cost: float | None = None
    total_unit_cost: float | None = None


def _clamp(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


def datacore_cost(
    inv: InventionData, prices: PriceProvider, params: InventionParams
) -> tuple[float, list[int]]:
    """``(coste de datacores por intento, [typeIDs sin precio])``."""
    total = 0.0
    missing: list[int] = []
    for core_id, qty in inv.datacores:
        price = resolve_price(prices, core_id, params.datacore_price_kind)
        if price is None:
            missing.append(core_id)
        else:
            total += price * qty
    return total, missing


def invention_outcome(
    inv: InventionData,
    decryptor: Decryptor,
    prices: PriceProvider,
    params: InventionParams | None = None,
    manufacturing_unit_cost: float | None = None,
) -> InventionOutcome:
    params = params or InventionParams()

    p = invention_probability(
        inv.base_probability,
        params.encryption_level,
        params.science1_level,
        params.science2_level,
        decryptor.probability_multiplier,
    )
    attempts = float("inf") if p <= 0 else 1.0 / p

    dc_cost, _missing = datacore_cost(inv, prices, params)
    decr_cost = 0.0
    if decryptor.type_id is not None:
        decr_cost = (
            resolve_price(prices, decryptor.type_id, params.decryptor_price_kind) or 0.0
        )

    cost_per_attempt = (
        dc_cost
        + decr_cost
        + params.invention_job_cost_per_attempt
        + params.t1_bpc_cost_per_run
    )
    cost_per_success = cost_per_attempt * attempts

    runs_per_success = max(1, inv.base_runs + decryptor.run_modifier)
    t2_units = runs_per_success * max(1, params.t2_produces_per_run)
    inv_cost_per_unit = (
        float("inf") if t2_units == 0 else cost_per_success / t2_units
    )

    eff_me = _clamp(INVENTED_BASE_ME + decryptor.me_modifier, ME_MIN, ME_MAX)
    eff_te = _clamp(INVENTED_BASE_TE + decryptor.te_modifier, TE_MIN, TE_MAX)

    total = None
    if manufacturing_unit_cost is not None:
        total = inv_cost_per_unit + manufacturing_unit_cost

    return InventionOutcome(
        decryptor=decryptor,
        probability=p,
        attempts_per_success=attempts,
        cost_per_attempt=cost_per_attempt,
        cost_per_success=cost_per_success,
        runs_per_success=runs_per_success,
        t2_units_per_success=t2_units,
        invention_cost_per_unit=inv_cost_per_unit,
        effective_me=eff_me,
        effective_te=eff_te,
        manufacturing_unit_cost=manufacturing_unit_cost,
        total_unit_cost=total,
    )


def rank_decryptors(
    inv: InventionData,
    prices: PriceProvider,
    params: InventionParams | None = None,
    manufacturing_unit_cost: Callable[[int], float] | float | None = None,
    decryptors: tuple[Decryptor, ...] = DECRYPTORS,
) -> list[InventionOutcome]:
    """Evalúa cada decryptor y devuelve los ``InventionOutcome`` ordenados por
    ``total_unit_cost`` (o por ``invention_cost_per_unit`` si no hay coste de
    fabricación), de mejor a peor.

    ``manufacturing_unit_cost`` puede ser:
    - un callable ``ME_efectivo -> coste_fabricación_por_unidad`` (lo normal:
      distintos decryptors dan distinto ME y por tanto distinto coste de material),
    - un float fijo, o
    - ``None`` (solo se compara el coste de invención).
    """
    params = params or InventionParams()
    allowed = params.allowed_decryptors
    outcomes: list[InventionOutcome] = []
    for d in decryptors:
        if allowed is not None and d.type_id not in allowed:
            continue
        muc: float | None
        if callable(manufacturing_unit_cost):
            eff_me = _clamp(INVENTED_BASE_ME + d.me_modifier, ME_MIN, ME_MAX)
            muc = manufacturing_unit_cost(eff_me)
        else:
            muc = manufacturing_unit_cost
        outcomes.append(invention_outcome(inv, d, prices, params, muc))

    def key(o: InventionOutcome) -> float:
        return o.total_unit_cost if o.total_unit_cost is not None else o.invention_cost_per_unit

    outcomes.sort(key=key)
    return outcomes
