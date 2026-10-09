"""Tests del plan de minado (``eveindustry.engine.mining``) sobre ores sintéticos."""

import pytest

from eveindustry.engine.mining import minerals_from_batches, ore_mix_for
from eveindustry.model.ores import Ore, OreCatalog

TRIT, PYE, MEGA = 34, 35, 40


def ore(type_id, name, volume, minerals, portion=100, comp_v=None):
    return Ore(
        type_id=type_id, name=name, family_id=type_id, family_name=name, grade=1,
        volume=volume, portion=portion, minerals=tuple(minerals),
        compressed_type_id=type_id + 1000, compressed_volume=comp_v,
    )


VELD = ore(1, "Veldspar", 0.1, [(TRIT, 400)], comp_v=0.001)      # 10 m³/lote
ARKO = ore(2, "Arkonor", 16.0, [(PYE, 3200), (MEGA, 120)])       # 1600 m³/lote


# --- reprocesado ------------------------------------------------------------
def test_minerals_from_batches_applies_yield():
    assert minerals_from_batches(VELD, 10, 1.0) == {TRIT: 4000}
    assert minerals_from_batches(VELD, 10, 0.5) == {TRIT: 2000}
    assert minerals_from_batches(VELD, 1, 0.876) == {TRIT: 350}   # int(400*0.876)


def test_zero_batches_gives_nothing():
    assert minerals_from_batches(VELD, 0, 1.0) == {}


# --- mezcla de ore ----------------------------------------------------------
def test_single_ore_covers_target_exactly():
    plan = ore_mix_for({TRIT: 4000}, [VELD], yield_rate=1.0)
    assert len(plan.lines) == 1
    line = plan.lines[0]
    assert line.batches == 10 and line.units == 1000
    assert line.m3 == pytest.approx(100.0)          # 1000 ud × 0.1 m³
    assert plan.covered[TRIT] == 4000
    assert not plan.shortfall and not plan.surplus


def test_compressed_volume_uses_the_compressed_variant():
    plan = ore_mix_for({TRIT: 4000}, [VELD], yield_rate=1.0)
    # 1000 ud × 0.001 m³ = 1 m³, ratio 100×
    assert plan.total_m3_compressed == pytest.approx(1.0)
    assert plan.total_m3 / plan.total_m3_compressed == pytest.approx(100.0)


def test_shortfall_when_no_ore_produces_the_mineral():
    plan = ore_mix_for({TRIT: 4000, MEGA: 500}, [VELD], yield_rate=1.0)
    assert plan.shortfall == {MEGA: 500}
    assert plan.covered.get(MEGA, 0) == 0


def test_surplus_from_a_multi_mineral_ore():
    # Solo se quiere Megacyte; Arkonor arrastra Pyerite de propina.
    plan = ore_mix_for({MEGA: 120}, [VELD, ARKO], yield_rate=1.0)
    assert [l.ore_name for l in plan.lines] == ["Arkonor"]
    assert plan.surplus[PYE] == 3200
    assert not plan.shortfall


def test_picks_the_ore_with_more_mineral_per_m3():
    # Para Tritanium, Veldspar (40 trit/m³) gana a cualquier cosa voluminosa.
    fat = ore(3, "FatRock", 100.0, [(TRIT, 400)])   # 0.04 trit/m³
    plan = ore_mix_for({TRIT: 4000}, [VELD, fat], yield_rate=1.0)
    assert [l.ore_name for l in plan.lines] == ["Veldspar"]


def test_trim_removes_redundant_batches():
    # Arkonor cubre el Pyerite de sobra al ir a por Megacyte: no debe pedirse
    # además un ore de Pyerite dedicado.
    pyro = ore(4, "PyeRock", 1.0, [(PYE, 100)])
    plan = ore_mix_for({PYE: 1000, MEGA: 120}, [pyro, ARKO], yield_rate=1.0)
    assert [l.ore_name for l in plan.lines] == ["Arkonor"]
    assert plan.covered[PYE] >= 1000


def test_hours_from_rate():
    plan = ore_mix_for({TRIT: 4000}, [VELD], yield_rate=1.0)   # 100 m³
    assert plan.hours(50) == pytest.approx(2.0)
    assert plan.hours(None) is None
    assert plan.hours(0) is None


def test_no_ores_means_everything_is_shortfall():
    plan = ore_mix_for({TRIT: 100}, [], yield_rate=0.876)
    assert plan.shortfall == {TRIT: 100}
    assert plan.lines == []


# --- catálogo ---------------------------------------------------------------
def test_catalog_pick_falls_back_to_a_lower_grade():
    doc = {
        "ores": {
            "1": {"n": "V", "fam": 462, "famName": "Veldspar", "grade": 1,
                  "v": 0.1, "portion": 100, "comp": 2, "compV": 0.001, "m": [[TRIT, 400]]},
        },
        "families": {"462": {"n": "Veldspar", "grades": {"1": 1}}},
        "secPresets": {"highsec": [462]},
    }
    cat = OreCatalog.from_doc(doc)
    # se pide grado IV pero solo hay base -> coge el base
    picked = cat.pick((462,), grade=4)
    assert [o.type_id for o in picked] == [1]
    assert cat.mineable_minerals(picked) == frozenset({TRIT})
    assert cat.sec_presets["highsec"] == (462,)


# --- "este lo compro": exclusión por mineral -------------------------------
def _mine_or_buy_setup():
    """Producto P = 100 Tritanium + 100 Pyerite; solo Veldspar (da Tritanium)."""
    from eveindustry.model.assumptions import Assumptions, MiningConfig
    from eveindustry.model.dataset import dataset_from_docs
    from eveindustry.model.types import MINERAL_GROUP_ID

    P, BP = 500, 501
    bp_doc = {
        "blueprints": {str(BP): {"a": 1, "p": P, "pr": 1, "ml": 100, "m": [[TRIT, 100], [PYE, 100]], "t": 0}},
        "productIndex": {str(P): BP},
    }
    types = {
        str(P): {"n": "P", "g": 1, "c": 1, "v": 0.0},
        str(TRIT): {"n": "Tritanium", "g": MINERAL_GROUP_ID, "c": 4, "v": 0.01},
        str(PYE): {"n": "Pyerite", "g": MINERAL_GROUP_ID, "c": 4, "v": 0.01},
    }
    ds = dataset_from_docs(bp_doc, {"types": types})
    ores_doc = {
        "ores": {
            "1": {"n": "Veldspar", "fam": 462, "famName": "Veldspar", "grade": 1,
                  "v": 0.1, "portion": 100, "comp": None, "m": [[TRIT, 400]]},
        },
        "families": {"462": {"n": "Veldspar", "grades": {"1": 1}}},
        "secPresets": {},
    }

    class Prices:
        table = {P: 10_000.0, TRIT: 5.0, PYE: 10.0}

        def buy(self, t):
            return self.table.get(t)

        def sell(self, t):
            return self.table.get(t)

        def adjusted(self, t):
            return self.table.get(t)

        def average(self, t):
            return self.table.get(t)

    def assumptions(exclude=()):
        return Assumptions(
            mining=MiningConfig(ore_families=(462,), reprocess_yield=1.0,
                                basis="zero", exclude_minerals=exclude),
            ore_catalog=OreCatalog.from_doc(ores_doc),
        )

    return ds, P, Prices(), assumptions


def test_leaf_source_marks_mined_vs_bought():
    from eveindustry.engine.resolve import resolve

    ds, P, prices, assumptions = _mine_or_buy_setup()
    r = resolve(ds, P, assumptions(), prices)
    assert r.leaf_source == {TRIT: "mined", PYE: "bought"}
    assert r.cost_self_mined == 0.0            # basis zero
    assert r.cost_bought_minerals == pytest.approx(100 * 10.0)
    assert r.mining_plan.shortfall == {PYE: 100}
    assert [l.ore_name for l in r.mining_plan.lines] == ["Veldspar"]


def test_excluded_mineral_is_bought_and_leaves_the_ore_plan():
    from eveindustry.engine.resolve import resolve

    ds, P, prices, assumptions = _mine_or_buy_setup()
    r = resolve(ds, P, assumptions(exclude=(TRIT,)), prices)
    assert r.leaf_source == {TRIT: "bought", PYE: "bought"}
    assert r.cost_self_mined == 0.0
    assert r.cost_bought_minerals == pytest.approx(100 * 5.0 + 100 * 10.0)
    # el Tritanium ya no es objetivo del plan: ni líneas de ore ni shortfall por él
    assert r.mining_plan.lines == []
    assert r.mining_plan.shortfall == {PYE: 100}


def test_leaf_source_without_mining_is_all_bought():
    from eveindustry.engine.resolve import resolve
    from eveindustry.model.assumptions import Assumptions

    ds, P, prices, _ = _mine_or_buy_setup()
    r = resolve(ds, P, Assumptions(), prices)
    assert r.leaf_source == {TRIT: "bought", PYE: "bought"}
    assert r.mining_plan is None
