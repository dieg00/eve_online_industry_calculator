"""Configuración de coste de instalación: índices por sistema y constantes.

Vive en ``model`` (no en ``engine``) porque es dato de entrada, no lógica, y así
``model.assumptions`` no depende de ``engine`` (evita un import circular).
"""

from __future__ import annotations

from dataclasses import dataclass

from eveindustry.model.types import ACTIVITY_NAME


@dataclass(frozen=True)
class CostIndices:
    """Índices de coste de instalación por actividad, de ESI /industry/systems/."""

    manufacturing: float = 0.0
    reaction: float = 0.0
    invention: float = 0.0
    copying: float = 0.0

    def for_activity(self, activity_id: int) -> float:
        return {
            "manufacturing": self.manufacturing,
            "reaction": self.reaction,
            "invention": self.invention,
            "copying": self.copying,
        }.get(ACTIVITY_NAME.get(activity_id, ""), 0.0)

    @classmethod
    def from_system_doc(cls, system_row: dict) -> "CostIndices":
        return cls(
            manufacturing=float(system_row.get("manufacturing", 0.0)),
            reaction=float(system_row.get("reaction", 0.0)),
            invention=float(system_row.get("invention", 0.0)),
            copying=float(system_row.get("copying", 0.0)),
        )


@dataclass(frozen=True)
class CostConstants:
    """Componentes fijos del coste de instalación, como % del EIV.

    Fórmula (Viridian 2023 + subidas posteriores; verificado ago-2026):

        installCost = EIV · ( SCI·bonos + facility_tax + scc_surcharge + alpha_clone_tax )

    - ``scc_surcharge``   4.0% desde el 1-feb-2024 (era 1.5%). Para *research* de
      ME/TE bajó a 2% en jul-2025, pero manufacturing / reaction / invention
      siguen al 4%.
    - ``facility_tax``    0.25% en estación NPC; en estructura lo fija el dueño
      (se puede sobrescribir por nodo vía ``StructureConfig.facility_tax``).
    - ``alpha_clone_tax`` 0.25% solo si el personaje es Alpha. Por defecto 0
      (se asume Omega).

    Fuentes: eveonline.com/news/view/viridian-expansion-notes ;
    nosygamer.blogspot.com/2024/02/another-increase-to-scc-surcharge.html ;
    marketsforisk.blogspot.com/2025/03/manufacturing-taxes-system-index.html
    """

    scc_surcharge: float = 0.04
    facility_tax: float = 0.0025
    alpha_clone_tax: float = 0.0

    @classmethod
    def from_doc(cls, doc: dict) -> "CostConstants":
        c = doc.get("constants", {})
        return cls(
            scc_surcharge=float(c.get("sccSurcharge", 0.04)),
            facility_tax=float(c.get("facilityTaxDefault", 0.0025)),
            alpha_clone_tax=float(c.get("alphaCloneTax", 0.0)),
        )
