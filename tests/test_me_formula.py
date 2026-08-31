"""Tests de la fórmula de ME y del modelado de lotes (``eveindustry.engine.me``).

No necesitan el SDE. Cubren las trampas del plan §4 y las cifras del test de
regresión de la Providence a nivel de componente (base -> ME10 -> unidades -> runs).
"""

import pytest

from eveindustry.engine.me import (
    job_material_totals,
    material_quantity_per_job,
    runs_for_demand,
)


class TestMaterialQuantityPerJob:
    @pytest.mark.parametrize(
        "base, expected",
        [
            (40, 36),   # Capital Cargo Bay
            (16, 15),   # U-C Trigger Neurolink Conduit  (14.4 -> ceil 15)
            (15, 14),   # Capital Propulsion Engine      (13.5 -> ceil 14)
            (5, 5),     # Capital Armor Plates           (4.5 -> ceil 5, sin ahorro)
            (5, 5),     # Capital Construction Parts
            (400, 360), # Auto-Integrity Preservation Seal
            (200, 180), # Life Support Backup Unit
            (1, 1),     # Radar-FTL Interlink Communicator (0.9 -> ceil 1)
            (1, 1),     # Capital Core Temperature Regulator
        ],
    )
    def test_providence_components_me10_one_run(self, base, expected):
        # El casco de la Providence es 1 trabajo de 1 run a ME 10.
        assert material_quantity_per_job(base, runs=1, me=10) == expected

    def test_floor_at_runs_prevents_savings_on_small_quantities(self):
        # base 5, ME 10, 1 run: ceil(round(4.5, 2)) = 5 == runs mínimo.
        assert material_quantity_per_job(5, runs=1, me=10) == 5
        # Con 10 runs el suelo ya no muerde: 5*10*0.9 = 45.
        assert material_quantity_per_job(5, runs=10, me=10) == 45

    def test_rounds_to_two_decimals_before_ceil(self):
        # raw = 999.004 -> round(_, 2) = 999.00 -> ceil 999  (sin el round: ceil 1000)
        assert material_quantity_per_job(1000, runs=1, me=0, structure_factor=0.999004) == 999
        # raw = 999.006 -> round(_, 2) = 999.01 -> ceil 1000
        assert material_quantity_per_job(1000, runs=1, me=0, structure_factor=0.999006) == 1000

    def test_me0_is_identity_times_runs(self):
        assert material_quantity_per_job(37, runs=4, me=0) == 148

    def test_structure_factor_reduces_before_rounding(self):
        # ME 10 + factor 0.98 (rig ~2%): 100 * 0.9 * 0.98 = 88.2 -> ceil 89.
        assert material_quantity_per_job(100, runs=1, me=10, structure_factor=0.98) == 89

    def test_invalid_runs(self):
        with pytest.raises(ValueError):
            material_quantity_per_job(10, runs=0, me=10)


class TestRunsForDemand:
    def test_portion_size_one(self):
        assert runs_for_demand(36, produces_per_run=1, max_production_limit=0) == [36]

    @pytest.mark.parametrize(
        "demand, expected_runs",
        [
            (360, 120),  # Auto-Integrity Preservation Seal: ceil(360/3)
            (180, 60),   # Life Support Backup Unit
            (1, 1),      # ceil(1/3) = 1
            (4, 2),      # ceil(4/3) = 2, no 1
            (3, 1),
        ],
    )
    def test_portion_size_three(self, demand, expected_runs):
        assert runs_for_demand(demand, produces_per_run=3, max_production_limit=0) == [
            expected_runs
        ]

    def test_zero_demand_no_jobs(self):
        assert runs_for_demand(0, produces_per_run=3, max_production_limit=10) == []

    def test_splits_at_max_production_limit_minimising_job_count(self):
        # 250 runs necesarios, tope 100 -> [100, 100, 50]
        assert runs_for_demand(250, produces_per_run=1, max_production_limit=100) == [
            100,
            100,
            50,
        ]

    def test_exact_multiple_of_limit_has_no_remainder_job(self):
        assert runs_for_demand(200, produces_per_run=1, max_production_limit=100) == [
            100,
            100,
        ]


class TestJobMaterialTotals:
    def test_batch_of_36_cheaper_than_36_batches_of_1(self):
        # base 3, ME 10. Un lote de 36 runs vs 36 lotes de 1 run.
        mats = [(34, 3)]
        one_big = job_material_totals(mats, jobs=[36], me=10)
        many_small = job_material_totals(mats, jobs=[1] * 36, me=10)
        assert one_big[34] == 98      # 36*3*0.9 = 97.2 -> ceil 98
        assert many_small[34] == 108  # cada lote: 2.7 -> ceil 3 -> max(1, 3) = 3; x36
        assert one_big[34] < many_small[34]

    def test_totals_sum_over_jobs_with_per_job_rounding(self):
        mats = [(1, 5), (2, 400)]
        totals = job_material_totals(mats, jobs=[100, 100, 50], me=10)
        # material 1: base 5 -> por trabajo max(runs, ceil(runs*5*0.9))
        #   100 runs: ceil(450) = 450 ; 50 runs: ceil(225) = 225
        assert totals[1] == 450 + 450 + 225
        # material 2: base 400 -> 100 runs: ceil(36000) ; 50 runs: ceil(18000)
        assert totals[2] == 36000 + 36000 + 18000
