"""Catálogo de ore y su reprocesado a minerales.

Espeja el patrón de ``model/structure.py`` / ``RigCatalog``: dato plano cargado
de ``data/ores.json``, sin lógica de negocio (esa vive en ``engine/mining.py``).

``minerals`` son las cantidades por **lote** de ``portion`` unidades al 100 % de
rendimiento — vienen de ``invTypeMaterials``, que es la tabla de **reprocesado**
(NO la de fabricación; ver el aviso en ``sde/trim.py``).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Ore:
    type_id: int
    name: str
    family_id: int
    family_name: str
    grade: int                                  # 0=0-Grade, 1=base, 2=II, 3=III, 4=IV
    volume: float                               # m³ por unidad
    portion: int                                # unidades por lote de reprocesado
    minerals: tuple[tuple[int, int], ...]       # (mineralTypeID, cantidad por lote)
    compressed_type_id: int | None = None
    compressed_volume: float | None = None

    @property
    def compression_ratio(self) -> float:
        """Cuántas veces menos volumen ocupa comprimido (1.0 si no se puede)."""
        if not self.compressed_volume:
            return 1.0
        return self.volume / self.compressed_volume

    def mineral_ids(self) -> frozenset[int]:
        return frozenset(m for m, _ in self.minerals)


@dataclass(frozen=True)
class OreCatalog:
    ores: dict[int, Ore]
    families: dict[int, str]                     # familyID -> nombre
    grades_by_family: dict[int, dict[int, int]]  # familyID -> {grade: oreTypeID}
    sec_presets: dict[str, tuple[int, ...]]      # banda -> familyIDs (orientativo)

    @classmethod
    def from_doc(cls, doc: dict) -> OreCatalog:
        ores: dict[int, Ore] = {}
        for tid, o in doc.get("ores", {}).items():
            ores[int(tid)] = Ore(
                type_id=int(tid),
                name=o["n"],
                family_id=int(o["fam"]),
                family_name=o["famName"],
                grade=int(o.get("grade", 1)),
                volume=float(o["v"]),
                portion=int(o["portion"]),
                minerals=tuple((int(m), int(q)) for m, q in o.get("m", [])),
                compressed_type_id=(int(o["comp"]) if o.get("comp") else None),
                compressed_volume=(float(o["compV"]) if o.get("compV") else None),
            )
        families = {int(fid): f["n"] for fid, f in doc.get("families", {}).items()}
        grades = {
            int(fid): {int(g): int(t) for g, t in f.get("grades", {}).items()}
            for fid, f in doc.get("families", {}).items()
        }
        presets = {
            band: tuple(int(x) for x in ids)
            for band, ids in doc.get("secPresets", {}).items()
        }
        return cls(ores=ores, families=families, grades_by_family=grades,
                   sec_presets=presets)

    @classmethod
    def from_file(cls, path: str | Path) -> OreCatalog:
        return cls.from_doc(json.loads(Path(path).read_text("utf-8")))

    @classmethod
    def empty(cls) -> OreCatalog:
        return cls(ores={}, families={}, grades_by_family={}, sec_presets={})

    def pick(self, family_ids: tuple[int, ...], grade: int) -> list[Ore]:
        """Los ores de esas familias en el grado pedido (o el más cercano por
        debajo, y si no hay, el más bajo disponible)."""
        out: list[Ore] = []
        for fid in family_ids:
            grades = self.grades_by_family.get(fid)
            if not grades:
                continue
            available = sorted(grades)
            chosen = max((g for g in available if g <= grade), default=available[0])
            ore = self.ores.get(grades[chosen])
            if ore is not None:
                out.append(ore)
        return out

    def mineable_minerals(self, ores: list[Ore]) -> frozenset[int]:
        """Minerales que ese conjunto de ores puede producir."""
        out: set[int] = set()
        for o in ores:
            out |= o.mineral_ids()
        return frozenset(out)
