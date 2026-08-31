"""Tests de ``eveindustry.engine.jobcost``: EIV y coste de instalación."""

import pytest

from eveindustry.engine.jobcost import (
    CostConstants,
    CostIndices,
    estimated_item_value,
    job_install_cost,
)
from eveindustry.model.types import ACTIVITY_MANUFACTURING, ACTIVITY_REACTION


class FakePrices:
    """adjusted_price sencillo; el resto no se usa aquí."""

    def __init__(self, adj: dict[int, float]):
        self._adj = adj

    def adjusted(self, tid):
        return self._adj.get(tid)

    def buy(self, tid):
        return None

    def sell(self, tid):
        return None

    def average(self, tid):
        return None


MATS = [(34, 100), (35, 10)]  # (typeID, cantidad base a ME0)
PRICES = FakePrices({34: 5.0, 35: 200.0})


def test_eiv_uses_base_quantities_and_adjusted_price_and_scales_with_runs():
    eiv1, missing = estimated_item_value(MATS, runs=1, prices=PRICES)
    assert missing == []
    assert eiv1 == pytest.approx(100 * 5.0 + 10 * 200.0)  # 2500
    eiv3, _ = estimated_item_value(MATS, runs=3, prices=PRICES)
    assert eiv3 == pytest.approx(3 * 2500)


def test_eiv_reports_missing_adjusted_prices():
    eiv, missing = estimated_item_value([(34, 100), (99, 5)], runs=1, prices=PRICES)
    assert missing == [99]
    assert eiv == pytest.approx(500.0)  # solo el material con precio


def test_install_cost_components_and_total():
    indices = CostIndices(manufacturing=0.04, reaction=0.02)
    constants = CostConstants(scc_surcharge=0.015, facility_tax=0.0025)
    jc = job_install_cost(
        MATS, runs=2, activity_id=ACTIVITY_MANUFACTURING,
        prices=PRICES, indices=indices, constants=constants,
    )
    eiv = 2 * 2500
    assert jc.eiv == pytest.approx(eiv)
    assert jc.index_component == pytest.approx(eiv * 0.04)
    assert jc.facility_tax_component == pytest.approx(eiv * 0.0025)
    assert jc.scc_component == pytest.approx(eiv * 0.015)
    assert jc.total == pytest.approx(eiv * (0.04 + 0.0025 + 0.015))


def test_activity_selects_the_right_index():
    indices = CostIndices(manufacturing=0.04, reaction=0.02)
    constants = CostConstants(scc_surcharge=0.0, facility_tax=0.0)
    jc = job_install_cost(
        MATS, runs=1, activity_id=ACTIVITY_REACTION,
        prices=PRICES, indices=indices, constants=constants,
    )
    assert jc.index_component == pytest.approx(2500 * 0.02)


def test_facility_tax_override_from_structure_config():
    indices = CostIndices(manufacturing=0.04)
    constants = CostConstants(scc_surcharge=0.0, facility_tax=0.0025)
    jc = job_install_cost(
        MATS, runs=1, activity_id=ACTIVITY_MANUFACTURING,
        prices=PRICES, indices=indices, constants=constants, facility_tax=0.01,
    )
    assert jc.facility_tax_component == pytest.approx(2500 * 0.01)


def test_accumulates_across_a_two_level_tree():
    """installCost es por nodo y se suma hacia arriba."""
    indices = CostIndices(manufacturing=0.05)
    constants = CostConstants(scc_surcharge=0.0, facility_tax=0.0)
    child = job_install_cost(
        [(34, 40)], runs=36, activity_id=ACTIVITY_MANUFACTURING,
        prices=PRICES, indices=indices, constants=constants,
    )
    parent = job_install_cost(
        [(21027, 1)], runs=1, activity_id=ACTIVITY_MANUFACTURING,
        prices=FakePrices({21027: 900.0}), indices=indices, constants=constants,
    )
    total_install = child.total + parent.total
    assert child.total == pytest.approx(40 * 36 * 5.0 * 0.05)
    assert parent.total == pytest.approx(900.0 * 0.05)
    assert total_install == pytest.approx(360.0 + 45.0)
