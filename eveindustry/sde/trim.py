"""Recorte del SDE a los JSON que consume el motor.

Produce:

- ``blueprints.json``  todos los blueprints de actividad 1 y 11, con sus
  materiales base (ME 0), ``produces_per_run`` y ``max_production_limit``, más un
  ``productIndex`` (productTypeID -> blueprintTypeID).
- ``types.json``       nombre / grupo / categoría / volumen de cada typeID que
  aparezca como producto o material (incluye hojas: minerales, gas, moon goo...).

Uso:

    python -m eveindustry.sde.trim --sde sde.sqlite --out data/

El formato es el del plan §3a (claves cortas para achicar el bundle):

    blueprints[bpID] = {"a","p","pr","ml","m":[[matID,qty],...],"t"}
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from eveindustry.sde.load import (
    iter_buildable_blueprints,
    iter_invention,
    load_solar_systems,
    load_type_info,
    open_sde,
    sde_version,
)

SCHEMA_VERSION = 1


def build_dataset(sde_path: str | Path) -> tuple[dict, dict, list[str]]:
    """Devuelve ``(blueprints_doc, types_doc, warnings)``."""
    warnings: list[str] = []
    conn = open_sde(sde_path)
    try:
        version = sde_version(conn) or "unknown"

        blueprints: dict[str, dict] = {}
        product_index: dict[str, int] = {}
        referenced: set[int] = set()
        producers: dict[int, list[int]] = defaultdict(list)

        for bp in iter_buildable_blueprints(conn):
            bp_id = bp["blueprint_type_id"]
            product_id = bp["product_type_id"]
            materials = bp["materials"]

            producers[product_id].append(bp_id)
            blueprints[str(bp_id)] = {
                "a": bp["activity_id"],
                "p": product_id,
                "pr": bp["produces_per_run"],
                "ml": bp["max_production_limit"],
                "m": [[mat_id, qty] for mat_id, qty in materials],
                "t": bp["base_time"],
            }
            product_index[str(product_id)] = bp_id

            referenced.add(bp_id)
            referenced.add(product_id)
            referenced.update(mat_id for mat_id, _ in materials)

        for product_id, bp_ids in producers.items():
            if len(bp_ids) > 1:
                warnings.append(
                    f"producto {product_id} lo hacen {len(bp_ids)} blueprints "
                    f"{bp_ids}; productIndex se queda con {product_index[str(product_id)]}"
                )

        # invención: cuelga el bloque "inv" del blueprint T2 (activityID 1)
        n_inv = 0
        for inv in iter_invention(conn):
            t2_bp = str(inv["t2_blueprint_type_id"])
            if t2_bp not in blueprints:
                continue  # el T2 bp no fabrica nada en nuestro set; se ignora
            blueprints[t2_bp]["inv"] = {
                "t1bp": inv["t1_blueprint_type_id"],
                "pbase": inv["base_probability"],
                "runs": inv["base_runs"],
                "dc": [[c, q] for c, q in inv["datacores"]],
                "enc": inv["encryption_skill_id"],
                "sci": list(inv["science_skill_ids"]),
            }
            referenced.update(c for c, _ in inv["datacores"])
            n_inv += 1

        type_info = load_type_info(conn, referenced)
        missing = referenced - type_info.keys()
        if missing:
            warnings.append(
                f"{len(missing)} typeIDs referenciados sin fila en invTypes "
                f"(p. ej. {sorted(missing)[:10]})"
            )

        now = datetime.now(timezone.utc).isoformat(timespec="seconds")

        blueprints_doc = {
            "meta": {"sdeVersion": version, "schema": SCHEMA_VERSION, "builtAt": now},
            "blueprints": blueprints,
            "productIndex": product_index,
        }
        types_doc = {
            "meta": {"sdeVersion": version, "schema": SCHEMA_VERSION, "builtAt": now},
            "types": {
                str(tid): {
                    "n": info["name"],
                    "g": info["group_id"],
                    "c": info["category_id"],
                    "v": info["volume"],
                }
                for tid, info in sorted(type_info.items())
            },
        }
        systems_doc = {
            "meta": {"sdeVersion": version, "schema": SCHEMA_VERSION, "builtAt": now},
            "systems": {
                str(sid): [s["name"], s["security"]]
                for sid, s in sorted(load_solar_systems(conn).items())
            },
        }
        return blueprints_doc, types_doc, systems_doc, warnings
    finally:
        conn.close()


def write_dataset(sde_path: str | Path, out_dir: str | Path) -> list[str]:
    blueprints_doc, types_doc, systems_doc, warnings = build_dataset(sde_path)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for name, doc in (
        ("blueprints.json", blueprints_doc),
        ("types.json", types_doc),
        ("systems.json", systems_doc),
    ):
        (out / name).write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")

    n_bp = len(blueprints_doc["blueprints"])
    n_types = len(types_doc["types"])
    n_inv = sum(1 for b in blueprints_doc["blueprints"].values() if "inv" in b)
    print(f"blueprints.json: {n_bp} blueprints ({n_inv} con invención), "
          f"{len(blueprints_doc['productIndex'])} productos")
    print(f"types.json:      {n_types} tipos")
    print(f"systems.json:    {len(systems_doc['systems'])} sistemas")
    for w in warnings:
        print(f"  aviso: {w}")
    return warnings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Recorta el SDE a JSON para el motor")
    parser.add_argument("--sde", required=True, help="ruta al SDE en SQLite (fuzzwork)")
    parser.add_argument("--out", default="data", help="directorio de salida (def: data/)")
    args = parser.parse_args(argv)
    write_dataset(args.sde, args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
