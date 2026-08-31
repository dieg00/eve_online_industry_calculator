"""Supuestos de un cálculo: ME, estructura, precios/valoración, política.

Es el objeto que serializa el estado de la URL (un enlace = un cálculo).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from eveindustry.invention.cost import InventionParams
from eveindustry.model.costconfig import CostConstants, CostIndices
from eveindustry.model.structure import NPC_STATION, RigCatalog, StructureConfig
from eveindustry.prices.base import PriceKind


@dataclass(frozen=True)
class Valuation:
    """Cómo se traducen precios de mercado a coste e ingreso (plan §6)."""

    input_price_kind: PriceKind = PriceKind.SELL   # comprar un componente = Jita sell
    output_price_kind: PriceKind = PriceKind.BUY   # ingreso del producto final = Jita buy
    broker_fee: float = 0.03                       # sobre el ingreso del producto final
    sales_tax: float = 0.045                       # sobre el ingreso del producto final
    freight_per_m3: float = 0.0                    # v1 = 0 (hook presente)

    @property
    def output_retention(self) -> float:
        """Fracción del precio de venta que te queda tras comisiones."""
        return max(0.0, 1.0 - self.broker_fee - self.sales_tax)


@dataclass
class Assumptions:
    me_map: dict[int, float] = field(default_factory=dict)   # blueprintTypeID -> ME
    default_me: float = 0.0

    structure: StructureConfig = NPC_STATION
    structure_overrides: dict[int, StructureConfig] = field(default_factory=dict)  # por productTypeID
    rig_catalog: RigCatalog = field(default_factory=RigCatalog.empty)

    indices: CostIndices = field(default_factory=CostIndices)
    constants: CostConstants = field(default_factory=CostConstants)

    valuation: Valuation = field(default_factory=Valuation)

    # None = sin capa de invención (comportamiento por defecto). Si se pasa,
    # resolve() elige el mejor decryptor por item T2 y lo integra en el coste.
    invention: InventionParams | None = None

    # policy se define en engine.policy para no crear un import circular con model;
    # aquí va como Any y resolve() lo valida.
    policy: object | None = None

    root_demand: int = 1
    max_depth: int = 32
    max_fixpoint_iterations: int = 8

    def me_for(self, blueprint_type_id: int) -> float:
        return self.me_map.get(blueprint_type_id, self.default_me)

    def structure_for(self, product_type_id: int) -> StructureConfig:
        return self.structure_overrides.get(product_type_id, self.structure)
