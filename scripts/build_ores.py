"""Genera ``data/ores.json``: ore de asteroide -> minerales por reprocesado.

    python scripts/build_ores.py --sde sde.sqlite --out data/ores.json

Qué hace:
- Coge de la categoría "Asteroid" (25) todo ore publicado cuyo **reprocesado**
  (``invTypeMaterials``) produzca al menos un **mineral** (grupo 18). Ese filtro
  descarta solo el ore de luna (da moon goo) y el hielo (da isótopos) sin
  necesidad de mantener listas de grupos a mano.
- Empareja cada variante con su versión **comprimida** (mismo grupo y grado,
  nombre "Compressed <X>"). Las "Batch Compressed" son legacy y se ignoran.
- ``grade`` sale de dogma (``asteroidMetaLevel``): 0=0-Grade, 1=base, 2=II,
  3=III, 4=IV. Los grados altos dan más mineral por lote.
- La familia es el ``groupID`` (Veldspar, Scordite, ...) — más fiable que
  ``oreBasicType``, que en las IV-Grade se apunta a sí mismo.

``secPresets`` es una lista ORIENTATIVA por banda de seguridad: desde el rework de
ores la distribución real es por región, así que solo sirve de punto de partida
para el selector; el usuario marca sus ores a mano.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

MINERAL_GROUP = 18

# Punto de partida por banda de seguridad (orientativo, ver docstring).
SEC_PRESETS = {
    "highsec": ["Veldspar", "Scordite", "Pyroxeres", "Plagioclase", "Omber", "Kernite"],
    "lowsec": ["Veldspar", "Scordite", "Pyroxeres", "Plagioclase", "Omber", "Kernite",
               "Jaspet", "Hemorphite", "Hedbergite", "Gneiss", "Dark Ochre"],
    "nullsec": ["Veldspar", "Scordite", "Pyroxeres", "Plagioclase", "Omber", "Kernite",
                "Jaspet", "Hemorphite", "Hedbergite", "Gneiss", "Dark Ochre",
                "Arkonor", "Bistot", "Crokite", "Spodumain", "Mercoxit"],
}


def build(sde_path: str) -> dict:
    conn = sqlite3.connect(f"file:{sde_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT t.typeID, t.typeName, t.groupID, g.groupName, t.volume, t.portionSize,
                   MAX(CASE WHEN a.attributeName='asteroidMetaLevel' THEN v.valueFloat END) AS grade
            FROM invTypes t
            JOIN invGroups g ON g.groupID = t.groupID
            LEFT JOIN dgmTypeAttributes v ON v.typeID = t.typeID
            LEFT JOIN dgmAttributeTypes a ON a.attributeID = v.attributeID
            WHERE g.categoryID = 25 AND t.published = 1 AND t.portionSize > 1
            GROUP BY t.typeID
            """
        ).fetchall()

        mats: dict[int, list[tuple[int, int]]] = {}
        for r in conn.execute(
            """
            SELECT m.typeID, m.materialTypeID, m.quantity
            FROM invTypeMaterials m
            JOIN invTypes mt ON mt.typeID = m.materialTypeID
            WHERE mt.groupID = ?
            ORDER BY m.typeID, m.materialTypeID
            """,
            (MINERAL_GROUP,),
        ):
            mats.setdefault(r["typeID"], []).append((r["materialTypeID"], r["quantity"]))
    finally:
        conn.close()

    raw: dict[str, dict] = {}
    compressed_by_name: dict[str, dict] = {}
    for r in rows:
        name = r["typeName"]
        if name.startswith("Batch Compressed"):
            continue
        rec = dict(r)
        if name.startswith("Compressed "):
            compressed_by_name[name[len("Compressed "):]] = rec
        else:
            raw[name] = rec

    ores: dict[str, dict] = {}
    families: dict[str, dict] = {}
    for name, r in sorted(raw.items()):
        minerals = mats.get(r["typeID"])
        if not minerals:
            continue  # ore de luna / hielo: no da minerales
        comp = compressed_by_name.get(name)
        grade = int(r["grade"]) if r["grade"] is not None else 1
        ores[str(r["typeID"])] = {
            "n": name,
            "fam": r["groupID"],
            "famName": r["groupName"],
            "grade": grade,
            "v": r["volume"],
            "portion": r["portionSize"],
            "comp": comp["typeID"] if comp else None,
            "compV": comp["volume"] if comp else None,
            "m": [[m, q] for m, q in minerals],
        }
        fam = families.setdefault(
            str(r["groupID"]), {"n": r["groupName"], "grades": {}}
        )
        fam["grades"][str(grade)] = r["typeID"]

    by_fam_name = {f["n"]: fid for fid, f in families.items()}
    presets = {
        band: sorted(int(by_fam_name[n]) for n in names if n in by_fam_name)
        for band, names in SEC_PRESETS.items()
    }

    return {
        "meta": {
            "note": "Generado por scripts/build_ores.py desde el SDE. 'm' son los "
                    "minerales por lote de 'portion' unidades al 100% de rendimiento "
                    "(invTypeMaterials = tabla de reprocesado). secPresets es "
                    "ORIENTATIVO: la distribucion real de ore es por region desde el "
                    "rework, no por banda de seguridad.",
            "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "oreCount": len(ores),
            "familyCount": len(families),
        },
        "ores": ores,
        "families": families,
        "secPresets": presets,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sde", default="sde.sqlite")
    ap.add_argument("--out", default="data/ores.json")
    args = ap.parse_args(argv)

    doc = build(args.sde)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{args.out}: {doc['meta']['oreCount']} variantes de ore, "
          f"{doc['meta']['familyCount']} familias")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
