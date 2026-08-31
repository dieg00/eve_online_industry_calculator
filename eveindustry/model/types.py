"""Dataclasses del dominio.

Se mantienen deliberadamente planas y sin logica: el motor (``eveindustry.engine``)
opera sobre estas estructuras y sobre dicts/listas primitivas para que portarlo
(o correrlo en Pyodide) sea trivial.
"""

from __future__ import annotations

from dataclasses import dataclass

# activityID del SDE (tabla ramActivities)
ACTIVITY_MANUFACTURING = 1
ACTIVITY_REACTION = 11
ACTIVITY_INVENTION = 8

ACTIVITY_NAME = {
    ACTIVITY_MANUFACTURING: "manufacturing",
    ACTIVITY_REACTION: "reaction",
    ACTIVITY_INVENTION: "invention",
}

# Skills "<Raza> Encryption Methods" (+ Sleeper/Triglavian/Upwell). El resto de
# skills de una actividad de invención son los dos de ciencia (datacores).
ENCRYPTION_SKILL_IDS: frozenset[int] = frozenset(
    {23087, 21790, 23121, 21791, 3408, 52308, 55025}
)

# Un blueprint invencionado empieza en ME 2 / TE 4 (antes de decryptor).
INVENTED_BASE_ME = 2
INVENTED_BASE_TE = 4


@dataclass(frozen=True)
class TypeInfo:
    """Una entrada de ``types.json``. Solo identidad y clasificacion."""

    type_id: int
    name: str
    group_id: int
    category_id: int
    volume: float = 0.0


@dataclass(frozen=True)
class InventionData:
    """Datos de invención de un item T2, colgados de su blueprint T2 (plan §7).

    Se llenan desde el blueprint T1: ``industryActivityProbabilities`` (P base),
    ``industryActivityProducts`` act. 8 (runs del BPC T2), ``industryActivityMaterials``
    act. 8 (datacores), ``industryActivitySkills`` act. 8 (encriptación + ciencias).
    """

    t1_blueprint_type_id: int
    base_probability: float
    base_runs: int                       # runs del BPC T2 al inventar, sin decryptor
    datacores: tuple[tuple[int, int], ...]  # (typeID, cantidad por intento)
    encryption_skill_id: int | None
    science_skill_ids: tuple[int, ...]


@dataclass(frozen=True)
class Blueprint:
    """Una entrada de ``blueprints.json`` para una unica actividad (1 o 11).

    ``materials`` son las cantidades BASE (ME 0), por run, tal cual salen de
    ``industryActivityMaterials``. La reduccion por ME se aplica en el motor,
    por trabajo, nunca aqui.

    ``produces_per_run`` viene de ``industryActivityProducts.quantity`` (el
    "portion size" real). NO se usa ``invTypes.portionSize`` (es reprocesado).
    """

    blueprint_type_id: int
    activity_id: int
    product_type_id: int
    produces_per_run: int
    max_production_limit: int
    materials: tuple[tuple[int, int], ...]  # (material_type_id, base_qty_por_run)
    base_time: int = 0  # segundos por run; solo para TE/tiempo, jamas para coste de material
    invention: InventionData | None = None  # solo en blueprints T2 invencionables

    @property
    def activity_name(self) -> str:
        return ACTIVITY_NAME.get(self.activity_id, str(self.activity_id))
