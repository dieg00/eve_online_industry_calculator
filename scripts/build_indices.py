"""Genera ``data/indices.json`` desde ESI ``/industry/systems/``.

Índices de coste de instalación por sistema y actividad, más las constantes
verificadas de la fórmula (SCC surcharge, tax NPC, alpha clone).

    python scripts/build_indices.py --out data/indices.json

Sin auth. La GitHub Action lo corre a diario.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone

import requests

ESI = "https://esi.evetech.net/latest"
SYSTEMS_URL = f"{ESI}/industry/systems/?datasource=tranquility"
UA = "eveindustry-calc/0.1 (github data action)"

# Mapea el nombre de actividad de ESI -> clave corta de indices.json.
ACTIVITY_MAP = {
    "manufacturing": "manufacturing",
    "reaction": "reaction",
    "invention": "invention",
    "copying": "copying",
    "researching_material_efficiency": "research_me",
    "researching_time_efficiency": "research_te",
}

# Componentes fijos de la fórmula (como fracción del EIV). Verificado ago-2026:
#   installCost = EIV * ( SCI*bonos + facility_tax + scc_surcharge + alpha_clone_tax )
# Fuentes: Viridian expansion notes (2023); nosygamer 2024-02 (SCC 1.5% -> 4%);
#          marketsforisk 2025-03 (confirma 4% / 0.25% / 0.25%).
CONSTANTS = {
    "sccSurcharge": 0.04,          # manufacturing/reaction/invention (research ME/TE bajó a 2% en jul-2025)
    "facilityTaxDefault": 0.0025,  # estación NPC; estructura la fija el dueño
    "alphaCloneTax": 0.0,          # 0.0025 solo si el personaje es Alpha; por defecto Omega
}


def fetch_json(url: str) -> object:
    resp = requests.get(url, headers={"User-Agent": UA}, timeout=60)
    resp.raise_for_status()
    return resp.json()


def build(out_path: str) -> None:
    raw = fetch_json(SYSTEMS_URL)
    systems: dict[str, dict[str, float]] = {}
    for row in raw:
        sid = str(row["solar_system_id"])
        entry: dict[str, float] = {}
        for ci in row.get("cost_indices", []):
            key = ACTIVITY_MAP.get(ci["activity"])
            if key:
                entry[key] = float(ci["cost_index"])
        systems[sid] = entry

    doc = {
        "meta": {
            "source": "esi:/industry/systems/",
            "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "systemCount": len(systems),
        },
        "systems": systems,
        "constants": CONSTANTS,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"))
    print(f"{out_path}: {len(systems)} sistemas")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="data/indices.json")
    args = ap.parse_args(argv)
    try:
        build(args.out)
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
