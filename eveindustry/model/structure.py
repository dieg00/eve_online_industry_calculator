"""Configuración de estructura + rigs + seguridad -> factor de material por trabajo.

El `structure_factor` que consume ``engine.me`` es un multiplicador <= 1.0:

    factor = (1 - roleBonusEstructura) * (1 - Σ rigMeBonus_aplicable * secMultiplier)

- El role bonus de la estructura (p. ej. 1% de un Engineering Complex) aplica a
  toda la actividad.
- Un rig solo aplica si el grupo o la categoría del PRODUCTO está en su lista de
  afectados (curada en ``rigs.json``; ver nota de ese fichero).
- El bonus del rig se multiplica por el modificador de seguridad del sistema
  (highsec 1.0, lowsec 1.9, null/WH 2.1).

Estación NPC sin rigs -> factor exactamente 1.0 (caso del test de regresión).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from eveindustry.model.types import ACTIVITY_NAME

SEC_HIGH = "highsec"
SEC_LOW = "lowsec"
SEC_NULL = "nullsec"  # incluye wormhole


@dataclass(frozen=True)
class Rig:
    type_id: int
    name: str
    activity: str                 # "manufacturing" | "reaction"
    me_bonus: float               # fracción positiva, p. ej. 0.02 = -2% material
    groups: frozenset[int] = frozenset()
    categories: frozenset[int] = frozenset()

    def applies_to(self, activity: str, group_id: int, category_id: int) -> bool:
        if self.activity != activity:
            return False
        return group_id in self.groups or category_id in self.categories


@dataclass(frozen=True)
class RigCatalog:
    rigs: dict[int, Rig]
    structure_role_bonus: dict[int, dict[str, float]]  # structureTypeID -> {activity: fracción}
    sec_multiplier: dict[str, float]

    @classmethod
    def from_doc(cls, doc: dict) -> RigCatalog:
        rigs = {
            int(tid): Rig(
                type_id=int(tid),
                name=r["n"],
                activity=r["activity"],
                me_bonus=float(r["meBonus"]),
                groups=frozenset(int(g) for g in r.get("groups", [])),
                categories=frozenset(int(c) for c in r.get("categories", [])),
            )
            for tid, r in doc.get("rigs", {}).items()
        }
        role = {
            int(tid): {k: float(v) for k, v in s.get("roleBonus", {}).items()}
            for tid, s in doc.get("structures", {}).items()
        }
        sec = {k: float(v) for k, v in doc.get("secMultiplier", {}).items()}
        sec.setdefault(SEC_HIGH, 1.0)
        sec.setdefault(SEC_LOW, 1.9)
        sec.setdefault(SEC_NULL, 2.1)
        return cls(rigs=rigs, structure_role_bonus=role, sec_multiplier=sec)

    @classmethod
    def from_file(cls, path: str | Path) -> RigCatalog:
        return cls.from_doc(json.loads(Path(path).read_text("utf-8")))

    @classmethod
    def empty(cls) -> RigCatalog:
        return cls(rigs={}, structure_role_bonus={}, sec_multiplier={
            SEC_HIGH: 1.0, SEC_LOW: 1.9, SEC_NULL: 2.1,
        })


@dataclass(frozen=True)
class StructureConfig:
    """Dónde y cómo se instala un trabajo. Global, con override por typeID aparte."""

    structure_type_id: int | None = None      # None = estación NPC
    rig_type_ids: tuple[int, ...] = ()
    security: str = SEC_HIGH
    facility_tax: float = 0.0025               # override del default de constantes

    def material_factor(
        self,
        catalog: RigCatalog,
        activity_id: int,
        product_group_id: int,
        product_category_id: int,
    ) -> float:
        activity = ACTIVITY_NAME.get(activity_id, str(activity_id))

        role = 0.0
        if self.structure_type_id is not None:
            role = catalog.structure_role_bonus.get(self.structure_type_id, {}).get(
                activity, 0.0
            )

        sec_mult = catalog.sec_multiplier.get(self.security, 1.0)
        rig_reduction = 0.0
        for rig_id in self.rig_type_ids:
            rig = catalog.rigs.get(rig_id)
            if rig and rig.applies_to(activity, product_group_id, product_category_id):
                rig_reduction += rig.me_bonus * sec_mult

        factor = (1.0 - role) * (1.0 - rig_reduction)
        return factor


NPC_STATION = StructureConfig()
