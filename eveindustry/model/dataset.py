"""Carga de los JSON recortados (``blueprints.json`` / ``types.json``) a índices
en memoria. Espeja lo que hará el cliente: parsear una vez, consultar muchas.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from eveindustry.model.types import Blueprint, InventionData, TypeInfo

__all__ = ["Dataset", "load_dataset", "dataset_from_docs"]


@dataclass
class Dataset:
    """Todo lo que el motor necesita del SDE, ya indexado."""

    types: dict[int, TypeInfo]
    blueprints: dict[int, Blueprint]          # keyed by blueprintTypeID
    blueprint_by_product: dict[int, int]      # productTypeID -> blueprintTypeID
    sde_version: str = "unknown"

    def blueprint_for_product(self, product_type_id: int) -> Blueprint | None:
        bp_id = self.blueprint_by_product.get(product_type_id)
        return self.blueprints.get(bp_id) if bp_id is not None else None

    def type_name(self, type_id: int) -> str:
        info = self.types.get(type_id)
        return info.name if info else f"typeID {type_id}"

    def is_buildable(self, product_type_id: int) -> bool:
        return product_type_id in self.blueprint_by_product

    def normalize_to_product(self, type_id: int) -> int:
        """Acepta un typeID de producto o de blueprint y devuelve el de producto.

        El brief usa "Providence (typeID 20184)" pero 20184 es el *blueprint*;
        el producto (la nave) es 20183. El input canónico del motor es el producto.
        """
        bp = self.blueprints.get(type_id)
        return bp.product_type_id if bp is not None else type_id


def load_dataset(data_dir: str | Path) -> Dataset:
    data_dir = Path(data_dir)
    blueprints_doc = json.loads((data_dir / "blueprints.json").read_text("utf-8"))
    types_doc = json.loads((data_dir / "types.json").read_text("utf-8"))
    return dataset_from_docs(blueprints_doc, types_doc)


def dataset_from_docs(blueprints_doc: dict, types_doc: dict) -> Dataset:
    """Construye el ``Dataset`` desde documentos ya parseados.

    ``blueprints_doc`` necesita ``blueprints`` y ``productIndex``; ``types_doc``
    necesita ``types``. Un fixture combinado puede pasar el mismo dict a ambos.
    """
    types: dict[int, TypeInfo] = {}
    for tid_str, t in types_doc["types"].items():
        tid = int(tid_str)
        types[tid] = TypeInfo(
            type_id=tid,
            name=t["n"],
            group_id=t["g"],
            category_id=t["c"],
            volume=t.get("v", 0.0),
        )

    blueprints: dict[int, Blueprint] = {}
    for bp_id_str, bp in blueprints_doc["blueprints"].items():
        bp_id = int(bp_id_str)
        inv_raw = bp.get("inv")
        invention = None
        if inv_raw is not None:
            invention = InventionData(
                t1_blueprint_type_id=int(inv_raw["t1bp"]),
                base_probability=float(inv_raw["pbase"]),
                base_runs=int(inv_raw["runs"]),
                datacores=tuple((int(c), int(q)) for c, q in inv_raw["dc"]),
                encryption_skill_id=(
                    int(inv_raw["enc"]) if inv_raw.get("enc") is not None else None
                ),
                science_skill_ids=tuple(int(s) for s in inv_raw.get("sci", [])),
            )
        blueprints[bp_id] = Blueprint(
            blueprint_type_id=bp_id,
            activity_id=bp["a"],
            product_type_id=bp["p"],
            produces_per_run=bp["pr"],
            max_production_limit=bp["ml"],
            materials=tuple((int(m), int(q)) for m, q in bp["m"]),
            base_time=bp.get("t", 0),
            invention=invention,
        )

    blueprint_by_product = {
        int(pid): int(bpid) for pid, bpid in blueprints_doc["productIndex"].items()
    }

    return Dataset(
        types=types,
        blueprints=blueprints,
        blueprint_by_product=blueprint_by_product,
        sde_version=blueprints_doc.get("meta", {}).get("sdeVersion", "unknown"),
    )
