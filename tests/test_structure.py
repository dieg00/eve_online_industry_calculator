"""Tests de ``eveindustry.model.structure``: factor de material por estructura+rigs.

Usan un catálogo sintético para no depender del estado de curación de
``data/rigs.json``.
"""

import pytest

from eveindustry.model.structure import RigCatalog, StructureConfig
from eveindustry.model.types import ACTIVITY_MANUFACTURING, ACTIVITY_REACTION

CAP_COMPONENTS_GROUP = 873
STRUCTURE_COMPONENTS_GROUP = 334

DOC = {
    "structures": {
        "35827": {"n": "Sotiyo", "roleBonus": {"manufacturing": 0.01, "reaction": 0.0}},
    },
    "rigs": {
        "1001": {
            "n": "T1 Cap Component ME",
            "activity": "manufacturing",
            "meBonus": 0.02,
            "groups": [CAP_COMPONENTS_GROUP],
            "categories": [],
        },
        "1002": {
            "n": "T2 Cap Component ME",
            "activity": "manufacturing",
            "meBonus": 0.024,
            "groups": [CAP_COMPONENTS_GROUP],
            "categories": [],
        },
    },
    "secMultiplier": {"highsec": 1.0, "lowsec": 1.9, "nullsec": 2.1},
}


@pytest.fixture(scope="module")
def catalog() -> RigCatalog:
    return RigCatalog.from_doc(DOC)


def test_npc_station_no_rigs_is_exactly_one(catalog):
    cfg = StructureConfig()  # estación NPC
    f = cfg.material_factor(catalog, ACTIVITY_MANUFACTURING, CAP_COMPONENTS_GROUP, 17)
    assert f == 1.0


def test_structure_role_bonus_only(catalog):
    cfg = StructureConfig(structure_type_id=35827)
    f = cfg.material_factor(catalog, ACTIVITY_MANUFACTURING, 9999, 17)
    assert f == pytest.approx(0.99)  # 1% role, sin rig aplicable


def test_t2_rig_highsec_stacks_multiplicatively_with_role(catalog):
    cfg = StructureConfig(structure_type_id=35827, rig_type_ids=(1002,), security="highsec")
    f = cfg.material_factor(catalog, ACTIVITY_MANUFACTURING, CAP_COMPONENTS_GROUP, 17)
    # (1 - 0.01) * (1 - 0.024 * 1.0)
    assert f == pytest.approx(0.99 * 0.976)


def test_nullsec_multiplier_amplifies_rig(catalog):
    cfg = StructureConfig(rig_type_ids=(1001,), security="nullsec")
    f = cfg.material_factor(catalog, ACTIVITY_MANUFACTURING, CAP_COMPONENTS_GROUP, 17)
    # (1 - 0.02 * 2.1) = 0.958
    assert f == pytest.approx(0.958)


def test_rig_does_not_apply_to_other_group(catalog):
    cfg = StructureConfig(rig_type_ids=(1001,), security="nullsec")
    f = cfg.material_factor(
        catalog, ACTIVITY_MANUFACTURING, STRUCTURE_COMPONENTS_GROUP, 17
    )
    assert f == 1.0


def test_rig_does_not_apply_to_other_activity(catalog):
    cfg = StructureConfig(rig_type_ids=(1001,), security="nullsec")
    f = cfg.material_factor(catalog, ACTIVITY_REACTION, CAP_COMPONENTS_GROUP, 17)
    assert f == 1.0


def test_applies_by_category_when_group_misses(catalog):
    doc = {
        "rigs": {
            "2001": {
                "n": "cat rig",
                "activity": "manufacturing",
                "meBonus": 0.02,
                "groups": [],
                "categories": [17],
            }
        }
    }
    cat = RigCatalog.from_doc(doc)
    cfg = StructureConfig(rig_type_ids=(2001,))
    assert cfg.material_factor(cat, ACTIVITY_MANUFACTURING, 999, 17) == pytest.approx(0.98)


def test_empty_catalog_is_identity():
    cat = RigCatalog.empty()
    cfg = StructureConfig(structure_type_id=35827, rig_type_ids=(1001,))
    assert cfg.material_factor(cat, ACTIVITY_MANUFACTURING, CAP_COMPONENTS_GROUP, 17) == 1.0
