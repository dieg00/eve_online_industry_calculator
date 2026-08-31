"""Test de regresión de la Providence (plan §9). Contrato del motor.

Providence (nave typeID 20183, blueprint 20184), ME 10 en el casco y en los 9
componentes, sin rigs de estructura, expandiendo únicamente los 9 componentes del
casco y tratando sus inputs como hoja (expansión forzada, sin make-or-buy).

Las cifras esperadas están en ``tests/fixtures/providence_me10.json``, derivadas a
mano por el autor del brief desde las páginas de blueprint y verificadas contra el
SDE de fuzzwork (md5 en el ``meta`` del fixture).
"""

import json
from pathlib import Path

import pytest

from eveindustry.engine.expand import expand_forced
from eveindustry.model.dataset import dataset_from_docs

FIXTURE = Path(__file__).parent / "fixtures" / "providence_me10.json"

MINERAL_NAMES = {
    "Tritanium", "Pyerite", "Mexallon", "Isogen", "Nocxium", "Zydrine", "Megacyte",
}


@pytest.fixture(scope="module")
def fx() -> dict:
    return json.loads(FIXTURE.read_text("utf-8"))


@pytest.fixture(scope="module")
def result(fx):
    ds = dataset_from_docs(fx, fx)
    root = ds.normalize_to_product(fx["meta"]["rootBlueprint"])
    assert root == fx["meta"]["rootProduct"] == 20183
    bp = ds.blueprint_for_product(root)
    build_set = {mat_id for mat_id, _ in bp.materials}
    assert len(build_set) == 9
    return ds, expand_forced(
        ds, root, build_set=build_set, default_me=float(fx["meta"]["defaultME"])
    )


def test_no_warnings(result):
    _ds, res = result
    assert res.warnings == []


def test_intermediate_component_runs(result, fx):
    ds, res = result
    expected = fx["expected"]["components"]
    got = {
        str(pid): node.total_runs
        for pid, node in res.built.items()
        if pid != res.root_product_id
    }
    assert got == {pid: c["runs"] for pid, c in expected.items()}


def test_intermediate_component_demand_matches_me10_units(result, fx):
    """La demanda de cada componente = base del casco reducido por ME10 (1 run)."""
    _ds, res = result
    expected = fx["expected"]["components"]
    got = {
        str(pid): node.demand
        for pid, node in res.built.items()
        if pid != res.root_product_id
    }
    assert got == {pid: c["me10_units"] for pid, c in expected.items()}


def _split_leaves(ds, res):
    minerals, non_minerals = {}, {}
    for tid, qty in res.leaves.items():
        name = ds.type_name(tid)
        (minerals if name in MINERAL_NAMES else non_minerals)[name] = qty
    return minerals, non_minerals


def test_mineral_totals(result, fx):
    ds, res = result
    minerals, _ = _split_leaves(ds, res)
    assert minerals == fx["expected"]["minerals"]


def test_non_mineral_totals(result, fx):
    ds, res = result
    _, non_minerals = _split_leaves(ds, res)
    assert non_minerals == fx["expected"]["nonMinerals"]


def test_no_unexpected_leaves(result, fx):
    ds, res = result
    minerals, non_minerals = _split_leaves(ds, res)
    all_expected = set(fx["expected"]["minerals"]) | set(fx["expected"]["nonMinerals"])
    assert set(minerals) | set(non_minerals) == all_expected
