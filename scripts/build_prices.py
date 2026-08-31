"""Genera ``data/prices.json``: adjusted/average de ESI + buy/sell de Jita.

- ``adjusted_price`` / ``average_price``: ESI ``/markets/prices/`` (universo).
- ``buy`` / ``sell``: agregados de The Forge (Jita) vía la API de fuzzwork
  (``market.fuzzwork.co.uk/aggregates/``). ``buy`` = mejor compra, ``sell`` =
  mejor venta; se guarda también el percentil 5% (``bp``/``sp``), más robusto.

Solo se piden precios de los typeIDs que aparecen en ``data/types.json`` (los que
el motor puede necesitar) más una lista extra fija (decryptors).

    python scripts/build_prices.py --types data/types.json --out data/prices.json

Sin auth. La GitHub Action lo corre a diario.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone

import requests

ESI_PRICES = "https://esi.evetech.net/latest/markets/prices/?datasource=tranquility"
FUZZWORK_AGGREGATES = "https://market.fuzzwork.co.uk/aggregates/"
UA = "eveindustry-calc/0.1 (github data action)"

THE_FORGE_REGION = 10000002
JITA_44_STATION = 60003760

# typeIDs que el motor puede necesitar pero que no salen como material/producto
# de manufacturing (así que no están en types.json): los 8 decryptors.
EXTRA_TYPE_IDS: tuple[int, ...] = (34201, 34202, 34203, 34204, 34205, 34206, 34207, 34208)

CHUNK = 1000  # typeIDs por llamada a fuzzwork


def fetch_json(url: str) -> object:
    resp = requests.get(url, headers={"User-Agent": UA}, timeout=120)
    resp.raise_for_status()
    return resp.json()


def load_type_ids(types_path: str) -> list[int]:
    with open(types_path, encoding="utf-8") as f:
        doc = json.load(f)
    ids = {int(t) for t in doc.get("types", {})}
    ids.update(EXTRA_TYPE_IDS)
    return sorted(ids)


def fetch_esi_prices() -> dict[int, dict]:
    out: dict[int, dict] = {}
    for row in fetch_json(ESI_PRICES):
        out[int(row["type_id"])] = {
            "adj": row.get("adjusted_price"),
            "avg": row.get("average_price"),
        }
    return out


def fetch_jita_aggregates(type_ids: list[int], *, station: bool) -> dict[int, dict]:
    out: dict[int, dict] = {}
    loc = f"station={JITA_44_STATION}" if station else f"region={THE_FORGE_REGION}"
    for start in range(0, len(type_ids), CHUNK):
        batch = type_ids[start : start + CHUNK]
        url = f"{FUZZWORK_AGGREGATES}?{loc}&types={','.join(map(str, batch))}"
        data = fetch_json(url)
        for tid_str, row in data.items():
            buy, sell = row.get("buy", {}), row.get("sell", {})
            out[int(tid_str)] = {
                "b": _f(buy.get("max")),
                "s": _f(sell.get("min")),
                "bp": _f(buy.get("percentile")),
                "sp": _f(sell.get("percentile")),
            }
        time.sleep(0.2)
    return out


def _f(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def build(types_path: str, out_path: str, *, station: bool) -> None:
    type_ids = load_type_ids(types_path)
    esi = fetch_esi_prices()
    jita = fetch_jita_aggregates(type_ids, station=station)

    prices: dict[str, dict] = {}
    for tid in type_ids:
        e = esi.get(tid, {})
        j = jita.get(tid, {})
        row = {
            "b": j.get("b"),
            "s": j.get("s"),
            "adj": e.get("adj"),
            "avg": e.get("avg"),
        }
        if j.get("bp") is not None:
            row["bp"] = j["bp"]
        if j.get("sp") is not None:
            row["sp"] = j["sp"]
        if any(v is not None for v in row.values()):
            prices[str(tid)] = row

    doc = {
        "meta": {
            "source": "esi:/markets/prices/ + fuzzwork:aggregates",
            "region": THE_FORGE_REGION,
            "hub": "Jita IV-4" if station else "The Forge",
            "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "typeCount": len(prices),
        },
        "prices": prices,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"))
    print(f"{out_path}: {len(prices)} typeIDs con precio (de {len(type_ids)} pedidos)")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--types", default="data/types.json")
    ap.add_argument("--out", default="data/prices.json")
    ap.add_argument(
        "--station",
        action="store_true",
        help="usar solo la estación de Jita 4-4 en vez de toda The Forge",
    )
    args = ap.parse_args(argv)
    try:
        build(args.types, args.out, station=args.station)
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
