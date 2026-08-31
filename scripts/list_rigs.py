"""Genera ``data/rigs.json`` (catálogo de rigs de ME de industria) desde el SDE.

    python scripts/list_rigs.py --sde sde.sqlite --out data/rigs.json

Qué hace:
- Saca del SDE todos los rigs Standup de **Material Efficiency** de industria
  (excluye los Upwell "Outpost Rig" legacy y los de 0% de bonus).
- ``meBonus`` sale de ``dgmTypeAttributes`` (``attributeEngRigMatBonus``): T1 2%,
  T2 2.4% (los "Thukker"/faction van al 2%).
- ``activity`` = "reaction" si el nombre lleva "Reactor", si no "manufacturing".
- ``groups`` / ``categories`` (qué blueprints afecta cada rig) **NO están en
  dogma**: se mapean aquí por familia con queries curadas sobre el SDE.
  Las familias por clase de nave (small/medium/large) usan una clasificación
  **heurística** de grupos de nave — verificar contra CCP / EVE Ref si el número
  tiene que ser exacto.

Mantiene ``structures`` y ``secMultiplier`` del rigs.json existente si están.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

# --- clasificación de grupos de nave (heurística) -------------------------- #
SHIP_SIZE_GROUPS = {
    "small": [237, 25, 324, 831, 830, 893, 1283, 1527, 834, 31, 1022, 1972,
              420, 541, 1534, 1305, 29],
    "medium": [26, 358, 894, 832, 833, 906, 963, 419, 1201, 540, 28, 1202, 380,
               463, 543, 4902, 941, 1972],
    "large": [27, 900, 898],
    "capital": [485, 4594, 547, 659, 30, 1538, 883, 513, 902, 5120, 4487, 4488],
}
ALL_SHIP_GROUPS = sorted(
    {g for gs in SHIP_SIZE_GROUPS.values() for g in gs}
)

COMPONENT_GROUPS = {
    "advanced": [334, 536, 964, 880, 913],   # Construction/Structure/Hybrid Tech/Sleeper/Adv Cap
    "capital": [873],                          # Capital Construction Components
}
REACTOR_GROUPS = {
    "composite": [429, 428, 4096],   # Composite / Intermediate / Molecular-Forged
    "hybrid": [974],                  # Hybrid Polymers
    "biochemical": [712],             # Biochemical Material
}

# familia (regex sobre el nombre) -> (activity, {"groups":[...], "categories":[...]})
FAMILIES: list[tuple[re.Pattern, str, dict]] = [
    (re.compile(r"Capital Ship"), "manufacturing", {"groups": SHIP_SIZE_GROUPS["capital"]}),
    (re.compile(r"\bBasic Small Ship\b"), "manufacturing", {"groups": SHIP_SIZE_GROUPS["small"]}),
    (re.compile(r"\bAdvanced Small Ship\b"), "manufacturing", {"groups": SHIP_SIZE_GROUPS["small"]}),
    (re.compile(r"\bBasic Medium Ship\b"), "manufacturing", {"groups": SHIP_SIZE_GROUPS["medium"]}),
    (re.compile(r"\bAdvanced Medium Ship\b"), "manufacturing", {"groups": SHIP_SIZE_GROUPS["medium"]}),
    (re.compile(r"\bBasic Large Ship\b"), "manufacturing", {"groups": SHIP_SIZE_GROUPS["large"]}),
    (re.compile(r"\bAdvanced Large Ship\b"), "manufacturing", {"groups": SHIP_SIZE_GROUPS["large"]}),
    (re.compile(r"\bShip Manufacturing Efficiency"), "manufacturing", {"groups": ALL_SHIP_GROUPS}),  # XL
    (re.compile(r"Basic Capital Component"), "manufacturing", {"groups": COMPONENT_GROUPS["capital"]}),
    (re.compile(r"Advanced Component"), "manufacturing", {"groups": COMPONENT_GROUPS["advanced"]}),
    (re.compile(r"Structure and Component"), "manufacturing",
     {"groups": COMPONENT_GROUPS["advanced"] + COMPONENT_GROUPS["capital"], "categories": [65, 66]}),  # XL
    (re.compile(r"\bStructure Manufacturing"), "manufacturing", {"categories": [65, 66]}),
    (re.compile(r"Ammunition"), "manufacturing", {"categories": [8]}),
    (re.compile(r"Equipment and Consumable"), "manufacturing", {"categories": [7, 8]}),  # XL
    (re.compile(r"\bEquipment Manufacturing"), "manufacturing", {"categories": [7]}),
    (re.compile(r"Drone and Fighter"), "manufacturing", {"categories": [18, 87]}),
    (re.compile(r"Composite Reactor"), "reaction", {"groups": REACTOR_GROUPS["composite"]}),
    (re.compile(r"Hybrid Reactor"), "reaction", {"groups": REACTOR_GROUPS["hybrid"]}),
    (re.compile(r"Biochemical Reactor"), "reaction", {"groups": REACTOR_GROUPS["biochemical"]}),
    (re.compile(r"Reactor Efficiency"), "reaction",
     {"groups": REACTOR_GROUPS["composite"] + REACTOR_GROUPS["hybrid"] + REACTOR_GROUPS["biochemical"]}),
]


def classify(name: str) -> tuple[str, dict] | None:
    for pat, activity, scope in FAMILIES:
        if pat.search(name):
            return activity, scope
    return None


def load_me_rigs(conn: sqlite3.Connection) -> dict[str, dict]:
    rows = conn.execute(
        """
        SELECT t.typeID, t.typeName,
               MAX(CASE WHEN a.attributeName IN ('attributeEngRigMatBonus', 'RefRigMatBonus')
                        THEN v.valueFloat END) AS me
        FROM invTypes t
        JOIN invGroups g ON g.groupID=t.groupID
        JOIN invCategories c ON c.categoryID=g.categoryID
        LEFT JOIN dgmTypeAttributes v ON v.typeID=t.typeID
        LEFT JOIN dgmAttributeTypes a ON a.attributeID=v.attributeID
        WHERE c.categoryName='Structure Module' AND t.published=1
          AND t.typeName LIKE 'Standup%'
        GROUP BY t.typeID
        HAVING me IS NOT NULL AND me <> 0
        ORDER BY t.typeName
        """
    ).fetchall()

    out: dict[str, dict] = {}
    skipped: list[str] = []
    for type_id, name, me in rows:
        hit = classify(name)
        if hit is None:
            skipped.append(name)
            continue
        activity, scope = hit
        out[str(type_id)] = {
            "n": name,
            "activity": activity,
            "meBonus": round(abs(me) / 100.0, 4),
            "groups": scope.get("groups", []),
            "categories": scope.get("categories", []),
        }
    if skipped:
        print(f"  sin familia (ignorados): {len(skipped)}")
        for s in skipped:
            print(f"    - {s}")
    return out


DEFAULT_STRUCTURES = {
    "35825": {"n": "Raitaru", "roleBonus": {"manufacturing": 0.01, "reaction": 0.0}},
    "35826": {"n": "Azbel",   "roleBonus": {"manufacturing": 0.01, "reaction": 0.0}},
    "35827": {"n": "Sotiyo",  "roleBonus": {"manufacturing": 0.01, "reaction": 0.0}},
    "35835": {"n": "Athanor", "roleBonus": {"manufacturing": 0.0, "reaction": 0.0}},
    "35836": {"n": "Tatara",  "roleBonus": {"manufacturing": 0.0, "reaction": 0.0}},
}
DEFAULT_SEC = {"highsec": 1.0, "lowsec": 1.9, "nullsec": 2.1}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sde", default="sde.sqlite")
    ap.add_argument("--out", default="data/rigs.json")
    args = ap.parse_args(argv)

    conn = sqlite3.connect(f"file:{args.sde}?mode=ro", uri=True)
    try:
        rigs = load_me_rigs(conn)
    finally:
        conn.close()

    out_path = Path(args.out)
    prev = {}
    if out_path.is_file():
        prev = json.loads(out_path.read_text("utf-8"))

    doc = {
        "meta": {
            "note": "Generado por scripts/list_rigs.py desde el SDE. meBonus de "
                    "dogma (attributeEngRigMatBonus). El mapeo groups/categories "
                    "por familia NO esta en dogma; las familias por clase de nave "
                    "(small/medium/large) usan una clasificacion HEURISTICA de "
                    "grupos de nave — verificar contra CCP/EVE Ref si hace falta "
                    "exactitud. secMultiplier global (los rigs de ME usan 1/1.9/2.1).",
            "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "rigCount": len(rigs),
        },
        "structures": prev.get("structures", DEFAULT_STRUCTURES),
        "rigs": rigs,
        "secMultiplier": prev.get("secMultiplier", DEFAULT_SEC),
    }
    out_path.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{out_path}: {len(rigs)} rigs de ME")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
