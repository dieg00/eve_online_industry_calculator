"""Tests de los scripts de datos (scripts/build_indices.py, build_prices.py).

No hacen llamadas de red: se sustituye ``fetch_json``.
"""

import importlib.util
import json
import sys
from pathlib import Path

import pytest

pytest.importorskip("requests")

ROOT = Path(__file__).parents[1]


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


build_indices = _load("build_indices")
build_prices = _load("build_prices")


# --- build_indices --------------------------------------------------------------
def test_build_indices_shape(tmp_path, monkeypatch):
    fake = [
        {
            "solar_system_id": 30000142,
            "cost_indices": [
                {"activity": "manufacturing", "cost_index": 0.17},
                {"activity": "reaction", "cost_index": 0.004},
                {"activity": "invention", "cost_index": 0.001},
                {"activity": "researching_time_efficiency", "cost_index": 0.002},
            ],
        }
    ]
    monkeypatch.setattr(build_indices, "fetch_json", lambda url: fake)
    out = tmp_path / "out" / "indices.json"  # el directorio no existe todavía
    build_indices.build(str(out))
    doc = json.loads(out.read_text())

    assert doc["systems"]["30000142"] == {
        "manufacturing": 0.17,
        "reaction": 0.004,
        "invention": 0.001,
        "research_te": 0.002,
    }
    assert doc["constants"]["sccSurcharge"] == 0.04
    assert doc["constants"]["facilityTaxDefault"] == 0.0025
    assert doc["meta"]["systemCount"] == 1


# --- build_prices -------------------------------------------------------------
def test_f_filters_nonpositive_and_bad():
    assert build_prices._f("3.5") == 3.5
    assert build_prices._f(None) is None
    assert build_prices._f("0") is None
    assert build_prices._f("-1") is None
    assert build_prices._f("abc") is None


def test_load_type_ids_merges_extra(tmp_path):
    p = tmp_path / "types.json"
    p.write_text(json.dumps({"types": {"34": {}, "35": {}}}))
    ids = build_prices.load_type_ids(str(p))
    assert 34 in ids and 35 in ids
    assert set(build_prices.EXTRA_TYPE_IDS).issubset(ids)  # decryptors
    assert ids == sorted(ids)


def test_build_prices_merges_sources_and_drops_empty(tmp_path, monkeypatch):
    types = tmp_path / "types.json"
    types.write_text(json.dumps({"types": {"34": {}, "35": {}, "999": {}}}))

    def fake_fetch(url: str):
        if "markets/prices" in url:
            return [
                {"type_id": 34, "adjusted_price": 4.9, "average_price": 4.8},
                {"type_id": 35, "adjusted_price": 200.0, "average_price": 199.0},
            ]
        # fuzzwork aggregates
        return {
            "34": {"buy": {"max": "4.5", "percentile": "4.4"},
                   "sell": {"min": "5.1", "percentile": "5.2"}},
            "35": {"buy": {"max": "0"}, "sell": {"min": "210"}},
            "999": {"buy": {"max": "0"}, "sell": {"min": "0"}},
        }

    monkeypatch.setattr(build_prices, "fetch_json", fake_fetch)
    monkeypatch.setattr(build_prices.time, "sleep", lambda *_: None)

    out = tmp_path / "prices.json"
    build_prices.build(str(types), str(out), station=False)
    doc = json.loads(out.read_text())

    assert doc["prices"]["34"] == {"b": 4.5, "s": 5.1, "adj": 4.9, "avg": 4.8,
                                   "bp": 4.4, "sp": 5.2}
    # 35: buy.max = 0 -> None ; sell.min = 210
    assert doc["prices"]["35"]["b"] is None
    assert doc["prices"]["35"]["s"] == 210.0
    # 999: sin ESI y sin buy/sell válidos -> se omite
    assert "999" not in doc["prices"]
