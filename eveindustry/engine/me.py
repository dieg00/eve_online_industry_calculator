"""Fórmula de eficiencia de material (ME) y modelado de lotes.

Tres piezas, todas puras:

1. ``material_quantity_per_job``  -> unidades de UN material que consume UN trabajo.
2. ``runs_for_demand``            -> reparte una demanda de producto en trabajos (en runs).
3. ``job_material_totals``        -> suma materiales sobre una lista de trabajos.

Reglas del juego que hay que respetar al pie (ver plan §4):

- El ME se aplica POR TRABAJO, no por unidad. Un lote de 36 consume menos que 36
  lotes de 1, porque el redondeo ocurre una vez por trabajo.
- La secuencia es: multiplicar, ``round(_, 2)``, ``ceil``, y luego suelo en
  ``runs`` con ``max(runs, _)``. Ese suelo es lo que hace que las cantidades
  pequeñas nunca bajen (base 5, ME 10, 1 run -> ceil(4.5) = 5, sin ahorro).
- El ``round(_, 2)`` va antes del ``ceil`` y absorbe el ruido de coma flotante.
- TE (time efficiency) NO entra aquí. Solo afecta al tiempo del trabajo.
- Para el EIV (coste de instalación) se usan las cantidades BASE sin ME ni
  estructura; eso vive en ``engine.jobcost``, no aquí.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence

__all__ = [
    "material_quantity_per_job",
    "runs_for_demand",
    "job_material_totals",
]


def material_quantity_per_job(
    base_qty: int,
    runs: int,
    me: float,
    structure_factor: float = 1.0,
) -> int:
    """Unidades de un material consumidas por UN trabajo de ``runs`` runs.

    Parameters
    ----------
    base_qty:
        Cantidad base por run a ME 0 (de ``industryActivityMaterials``).
    runs:
        Número de runs del trabajo (>= 1).
    me:
        Material efficiency del blueprint, en puntos porcentuales (0..10 típico).
    structure_factor:
        Multiplicador combinado de estructura + rigs, <= 1.0. Es
        ``(1 - roleBonusEstructura) * (1 - rigBonus * secMultiplier)``.
        1.0 = estación NPC sin rigs (caso del test de regresión).

    Returns
    -------
    int
        Unidades para ese trabajo. Nunca menor que ``runs``.
    """
    if runs < 1:
        raise ValueError(f"runs debe ser >= 1, no {runs}")
    if base_qty < 0:
        raise ValueError(f"base_qty no puede ser negativa: {base_qty}")

    raw = runs * base_qty * (1.0 - me / 100.0) * structure_factor
    return max(runs, math.ceil(round(raw, 2)))


def runs_for_demand(
    demand: int,
    produces_per_run: int,
    max_production_limit: int | None = None,
) -> list[int]:
    """Reparte una demanda de ``demand`` unidades de producto en trabajos.

    Devuelve una lista de tamaños de trabajo en *runs*. Política: minimizar el
    número de trabajos sujeto a ``max_production_limit``.

    - ``runs_totales = ceil(demand / produces_per_run)``  (trampa del portion size:
      un blueprint que hace 3 por run necesita ``ceil(unidades / 3)`` runs).
    - Si no hay tope o cabe en un trabajo -> un solo trabajo.
    - Si no cabe -> N trabajos de ``max_production_limit`` + uno con el resto.

    Cada trabajo redondea sus materiales de forma independiente, así que trocear
    cambia el total de material (no el coste de instalación total, que escala con
    el EIV ∝ runs).
    """
    if produces_per_run < 1:
        raise ValueError(f"produces_per_run debe ser >= 1, no {produces_per_run}")
    if demand <= 0:
        return []

    total_runs = math.ceil(demand / produces_per_run)

    if not max_production_limit or total_runs <= max_production_limit:
        return [total_runs]

    full, remainder = divmod(total_runs, max_production_limit)
    jobs = [max_production_limit] * full
    if remainder:
        jobs.append(remainder)
    return jobs


def job_material_totals(
    base_materials: Sequence[tuple[int, int]],
    jobs: Iterable[int],
    me: float,
    structure_factor: float = 1.0,
) -> dict[int, int]:
    """Suma el consumo de cada material sobre todos los trabajos de un blueprint.

    Parameters
    ----------
    base_materials:
        Secuencia de ``(material_type_id, base_qty_por_run)`` a ME 0.
    jobs:
        Tamaños de trabajo en runs (lo que devuelve ``runs_for_demand``).
    me, structure_factor:
        Igual que en ``material_quantity_per_job``.

    Returns
    -------
    dict[int, int]
        ``{material_type_id: cantidad_total}``. El redondeo se aplica por trabajo
        y luego se acumula, no al revés.
    """
    totals: dict[int, int] = {}
    for runs in jobs:
        for material_type_id, base_qty in base_materials:
            qty = material_quantity_per_job(base_qty, runs, me, structure_factor)
            totals[material_type_id] = totals.get(material_type_id, 0) + qty
    return totals
