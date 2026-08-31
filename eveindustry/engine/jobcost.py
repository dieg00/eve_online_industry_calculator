"""EIV y coste de instalación de un trabajo (plan §6, la trampa nº 3 del brief).

El coste de instalación es un porcentaje del **valor estimado** del item y se
acumula en CADA nivel del árbol. Ignorarlo sobrestima el margen.

    EIV(trabajo) = Σ  adjusted_price(material) · cantidad_BASE · runs
                   (materiales inmediatos del blueprint, cantidades a ME 0,
                    precio ESI adjusted_price; NO market, NO cantidades con ME)

    installCost(trabajo) = EIV · ( índice_de_coste_del_sistema[actividad]
                                 + facility_tax
                                 + scc_surcharge )

Cada componente que construyes paga su propio ``installCost``; el resolvedor los
suma hacia arriba.
"""

from __future__ import annotations

from dataclasses import dataclass

from eveindustry.model.costconfig import CostConstants, CostIndices
from eveindustry.prices.base import PriceProvider

__all__ = [
    "CostConstants",
    "CostIndices",
    "JobCost",
    "estimated_item_value",
    "job_install_cost",
]


@dataclass(frozen=True)
class JobCost:
    eiv: float
    index_component: float       # EIV · índice del sistema
    facility_tax_component: float
    scc_component: float
    alpha_clone_component: float = 0.0
    missing_prices: tuple[int, ...] = ()  # materiales sin adjusted_price (EIV infravalorado)

    @property
    def total(self) -> float:
        return (
            self.index_component
            + self.facility_tax_component
            + self.scc_component
            + self.alpha_clone_component
        )


def estimated_item_value(
    base_materials: list[tuple[int, int]] | tuple[tuple[int, int], ...],
    runs: int,
    prices: PriceProvider,
) -> tuple[float, list[int]]:
    """``(EIV, [typeIDs sin adjusted_price])``.

    Cantidades BASE (ME 0) y ``adjusted_price``. No aplica ME ni factor de
    estructura: eso es a propósito, así lo calcula EVE.
    """
    total = 0.0
    missing: list[int] = []
    for material_type_id, base_qty in base_materials:
        adj = prices.adjusted(material_type_id)
        if adj is None:
            missing.append(material_type_id)
            continue
        total += adj * base_qty * runs
    return total, missing


def job_install_cost(
    base_materials: list[tuple[int, int]] | tuple[tuple[int, int], ...],
    runs: int,
    activity_id: int,
    prices: PriceProvider,
    indices: CostIndices,
    constants: CostConstants,
    *,
    facility_tax: float | None = None,
) -> JobCost:
    """Coste de instalación de UN trabajo de ``runs`` runs.

    ``facility_tax`` permite pasar el de la ``StructureConfig``; si es ``None`` se
    usa el de ``constants``.
    """
    eiv, missing = estimated_item_value(base_materials, runs, prices)
    tax = constants.facility_tax if facility_tax is None else facility_tax
    return JobCost(
        eiv=eiv,
        index_component=eiv * indices.for_activity(activity_id),
        facility_tax_component=eiv * tax,
        scc_component=eiv * constants.scc_surcharge,
        alpha_clone_component=eiv * constants.alpha_clone_tax,
        missing_prices=tuple(missing),
    )
