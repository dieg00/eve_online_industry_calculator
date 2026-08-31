"""Tests de la capa de invención (probabilidad, coste esperado, optimizador)."""

import math
from pathlib import Path

import pytest

from eveindustry.invention.cost import (
    InventionParams,
    invention_outcome,
    rank_decryptors,
)
from eveindustry.invention.decryptors import DECRYPTORS, NO_DECRYPTOR
from eveindustry.invention.probability import invention_probability, skill_multiplier
from eveindustry.model.dataset import load_dataset
from eveindustry.model.types import InventionData

DATA = Path(__file__).parents[1] / "data"


class DictPrices:
    def __init__(self, sell):
        self._s = sell

    def sell(self, tid):
        return self._s.get(tid)

    buy = adjusted = average = lambda self, tid: None  # noqa: E731


# --- probabilidad -----------------------------------------------------------
def test_skill_multiplier_all_five_is_1_5():
    assert skill_multiplier(5, 5, 5) == pytest.approx(1.5)


def test_probability_dc_all_v_no_decryptor():
    # Damage Control II: base 0.34, all V, sin decryptor -> 0.34 * 1.5 = 0.51
    assert invention_probability(0.34) == pytest.approx(0.51)


def test_probability_with_accelerant():
    assert invention_probability(0.34, decryptor_multiplier=1.2) == pytest.approx(0.612)


def test_probability_capped_at_one():
    assert invention_probability(0.9, 5, 5, 5, decryptor_multiplier=1.9) == 1.0


def test_probability_zero_skills():
    assert invention_probability(0.34, 0, 0, 0) == pytest.approx(0.34)


# --- coste esperado por unidad -------------------------------------------------
DC = InventionData(
    t1_blueprint_type_id=2047,
    base_probability=0.34,
    base_runs=10,
    datacores=((20415, 2), (20416, 2)),
    encryption_skill_id=23121,
    science_skill_ids=(11529, 11442),
)
PRICES = DictPrices({20415: 100_000.0, 20416: 100_000.0, 34201: 500_000.0})


def test_invention_outcome_no_decryptor_math():
    o = invention_outcome(DC, NO_DECRYPTOR, PRICES, InventionParams())
    assert o.probability == pytest.approx(0.51)
    assert o.attempts_per_success == pytest.approx(1 / 0.51)
    # datacores: (2+2) * 100k = 400k por intento
    assert o.cost_per_attempt == pytest.approx(400_000.0)
    assert o.cost_per_success == pytest.approx(400_000.0 / 0.51)
    assert o.runs_per_success == 10
    assert o.t2_units_per_success == 10
    assert o.invention_cost_per_unit == pytest.approx(400_000.0 / 0.51 / 10)
    assert o.effective_me == 2  # base 2, sin modificador


def test_accelerant_changes_me_runs_and_adds_decryptor_cost():
    o = invention_outcome(DC, DECRYPTORS[1], PRICES, InventionParams())  # Accelerant
    assert o.decryptor.name.startswith("Accelerant")
    assert o.probability == pytest.approx(0.612)
    assert o.runs_per_success == 11          # 10 + 1
    assert o.effective_me == 4               # 2 + 2
    assert o.cost_per_attempt == pytest.approx(400_000.0 + 500_000.0)


def test_effective_me_clamped_to_zero():
    o = invention_outcome(DC, DECRYPTORS[3], PRICES, InventionParams())  # Augmentation, me -2
    assert o.effective_me == 0  # 2 - 2, no negativo


def test_zero_probability_gives_infinite_cost():
    o = invention_outcome(DC, NO_DECRYPTOR, PRICES, InventionParams(
        encryption_level=0, science1_level=0, science2_level=0,
    ))
    # base 0.34 * 1.0 = 0.34, sigue > 0 -> finito
    assert math.isfinite(o.invention_cost_per_unit)


# --- optimizador ------------------------------------------------------------
def test_rank_picks_lowest_total_unit_cost_with_me_dependent_manufacturing():
    # coste de fabricación decreciente con ME: 1_000_000 - 20_000 * ME
    def manufacturing(eff_me: int) -> float:
        return 1_000_000.0 - 20_000.0 * eff_me

    ranked = rank_decryptors(DC, PRICES, InventionParams(), manufacturing)
    assert ranked[0].total_unit_cost == min(o.total_unit_cost for o in ranked)
    assert ranked == sorted(ranked, key=lambda o: o.total_unit_cost)
    # todos los decryptors + "sin decryptor" evaluados
    assert len(ranked) == len(DECRYPTORS)


def test_allowed_decryptors_filter():
    params = InventionParams(allowed_decryptors=(None, 34201))
    ranked = rank_decryptors(DC, PRICES, params, 0.0)
    ids = {o.decryptor.type_id for o in ranked}
    assert ids == {None, 34201}


# --- datos reales ---------------------------------------------------------------
@pytest.mark.skipif(
    not (DATA / "blueprints.json").exists(),
    reason="data/blueprints.json no generado (correr sde.trim)",
)
def test_real_dataset_has_invention_for_damage_control_ii():
    ds = load_dataset(DATA)
    bp = ds.blueprint_for_product(2048)  # Damage Control II
    assert bp is not None and bp.invention is not None
    inv = bp.invention
    assert inv.base_probability == pytest.approx(0.34)
    assert inv.base_runs == 10
    assert dict(inv.datacores) == {20415: 2, 20416: 2}
    assert inv.encryption_skill_id == 23121  # Gallente Encryption Methods
    assert set(inv.science_skill_ids) == {11529, 11442}


# --- integración en resolve() ------------------------------------------------
def test_resolve_with_invention_applies_decryptor_me_and_surcharge():
    from eveindustry.engine.resolve import resolve
    from eveindustry.model.assumptions import Assumptions
    from eveindustry.model.dataset import dataset_from_docs

    T2, T2BP, M, DCX = 500, 501, 22, 23
    bp_doc = {
        "blueprints": {
            str(T2BP): {
                "a": 1, "p": T2, "pr": 1, "ml": 1000,
                "m": [[M, 10]], "t": 0,
                "inv": {
                    "t1bp": 499, "pbase": 0.5, "runs": 10,
                    "dc": [[DCX, 2]], "enc": 23121, "sci": [11529, 11442],
                },
            }
        },
        "productIndex": {str(T2): T2BP},
    }
    types = {str(t): {"n": n, "g": 1, "c": 1, "v": 0.0}
             for t, n in {T2: "T2Item", M: "Mineral", DCX: "Datacore"}.items()}
    ds = dataset_from_docs(bp_doc, {"types": types})

    class P:
        def sell(self, tid):
            return {T2: 10_000_000.0, M: 100.0, DCX: 50_000.0}.get(tid)
        def buy(self, tid):
            return {T2: 9_000_000.0}.get(tid)
        adjusted = average = lambda self, tid: None  # noqa: E731

    base = resolve(ds, T2, Assumptions(default_me=0.0), P())
    with_inv = resolve(ds, T2, Assumptions(default_me=0.0, invention=InventionParams()), P())

    assert base.total_invention_cost == 0.0
    assert with_inv.total_invention_cost > 0.0

    node = with_inv.nodes[T2]
    assert node.invention_decryptor is not None
    assert node.effective_me is not None and node.effective_me >= 0
    # el coste de material baja (ME efectivo del BPC) pero se suma la invención
    assert with_inv.nodes[T2].real_unit_cost is not None
    assert with_inv.total_cost != base.total_cost


@pytest.mark.skipif(
    not (DATA / "blueprints.json").exists(),
    reason="data/blueprints.json no generado",
)
def test_resolve_damage_control_ii_with_invention_smoke():
    from eveindustry.engine.resolve import resolve
    from eveindustry.model.assumptions import Assumptions
    from eveindustry.model.costconfig import CostIndices

    ds = load_dataset(DATA)

    class Flat:
        def sell(self, tid):
            return 1000.0
        def buy(self, tid):
            return 900.0
        def adjusted(self, tid):
            return 1000.0
        def average(self, tid):
            return 1000.0

    r = resolve(
        ds, 2048,
        Assumptions(default_me=2.0, indices=CostIndices(manufacturing=0.04),
                    invention=InventionParams()),
        Flat(),
    )
    node = r.nodes[2048]
    assert node.decision == "build"
    assert node.invention_decryptor is not None
    assert 0.0 < node.invention_probability <= 1.0
    assert r.total_invention_cost > 0.0

