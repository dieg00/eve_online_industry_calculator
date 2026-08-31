"""Tests del resolvedor make-or-buy sobre datasets sintéticos.

Se aíslan las mecánicas: ME 0, factor estructura 1, índices y constantes 0 (salvo
donde se prueba lo contrario), para que el coste sea solo material + instalación.
"""

import pytest

from eveindustry.engine.makeorbuy import resolve_make_or_buy
from eveindustry.engine.policy import NodePolicy, PolicyConfig
from eveindustry.engine.resolve import resolve
from eveindustry.model.assumptions import Assumptions
from eveindustry.model.dataset import dataset_from_docs


def make_dataset(blueprints: dict[int, dict], type_names: dict[int, str]):
    """blueprints: {bpID: {"product":pid,"pr":1,"ml":100,"a":1,"mats":[(mid,qty)]}}."""
    bp_doc = {"blueprints": {}, "productIndex": {}}
    types = {}
    for bpid, b in blueprints.items():
        bp_doc["blueprints"][str(bpid)] = {
            "a": b.get("a", 1),
            "p": b["product"],
            "pr": b.get("pr", 1),
            "ml": b.get("ml", 100),
            "m": [[m, q] for m, q in b["mats"]],
            "t": 0,
        }
        bp_doc["productIndex"][str(b["product"])] = bpid
    for tid, name in type_names.items():
        types[str(tid)] = {"n": name, "g": 1, "c": 1, "v": 0.0}
    return dataset_from_docs(bp_doc, {"types": types})


class DictPrices:
    def __init__(self, table: dict[int, dict[str, float]]):
        self._t = table

    def _f(self, tid, k):
        return self._t.get(tid, {}).get(k)

    def buy(self, tid):
        return self._f(tid, "buy")

    def sell(self, tid):
        return self._f(tid, "sell")

    def adjusted(self, tid):
        return self._f(tid, "adjusted")

    def average(self, tid):
        return self._f(tid, "average")


ZERO_COST = dict(
    default_me=0.0,
    max_fixpoint_iterations=8,
)


# --- caso 1: construir 2 y comprar el resto gana ------------------------------
ROOT, A, B, M1, M2 = 100, 10, 11, 20, 21

DS1 = make_dataset(
    blueprints={
        1000: {"product": ROOT, "mats": [(A, 2), (B, 3)], "ml": 10},
        1010: {"product": A, "mats": [(M1, 5)]},
        1011: {"product": B, "mats": [(M2, 4)]},
    },
    type_names={ROOT: "Root", A: "CompA", B: "CompB", M1: "Min1", M2: "Min2"},
)
PRICES1 = DictPrices({
    ROOT: {"sell": 100.0, "buy": 90.0},
    A: {"sell": 8.0},          # construir A (5) < comprar A (8)
    B: {"sell": 3.0},          # construir B (4) > comprar B (3)
    M1: {"sell": 1.0},
    M2: {"sell": 1.0},
})


def test_builds_a_buys_b():
    a = Assumptions(**ZERO_COST)
    mob = resolve_make_or_buy(DS1, a, PRICES1, ROOT)
    assert mob.decision[A] is NodePolicy.BUILD
    assert mob.decision[B] is NodePolicy.BUY
    assert mob.decision[ROOT] is NodePolicy.BUILD


def test_mixed_beats_build_all_and_buy_all():
    auto = resolve(DS1, ROOT, Assumptions(**ZERO_COST), PRICES1)
    build_all = resolve(
        DS1, ROOT,
        Assumptions(policy=PolicyConfig(default=NodePolicy.BUILD), **ZERO_COST),
        PRICES1,
    )
    # coste óptimo: 2*build(A)=10  + 3*buy(B)=9  = 19
    assert auto.total_cost == pytest.approx(19.0)
    # build-all: 2*5 + 3*4 = 22
    assert build_all.total_cost == pytest.approx(22.0)
    assert auto.total_cost < build_all.total_cost
    # buy-all sería comprar el root entero a 100
    assert auto.total_cost < PRICES1.sell(ROOT)


def test_leaves_bom_is_exact():
    r = resolve(DS1, ROOT, Assumptions(**ZERO_COST), PRICES1)
    # ROOT (1 run) -> 2 A + 3 B ; A construido, demanda 2 -> 2 runs -> 10 M1 ; B comprado
    assert r.leaves == {B: 3, M1: 10}
    assert r.leaf_cost[B] == pytest.approx(9.0)
    assert r.leaf_cost[M1] == pytest.approx(10.0)
    assert r.unit_cost == pytest.approx(19.0)


def test_policy_override_forces_build_of_b():
    a = Assumptions(policy=PolicyConfig(by_type={B: NodePolicy.BUILD}), **ZERO_COST)
    mob = resolve_make_or_buy(DS1, a, PRICES1, ROOT)
    assert mob.decision[B] is NodePolicy.BUILD
    assert B not in mob.flips  # forzado: el punto fijo no lo revierte


# --- caso 2: el punto fijo revierte por el suelo max(runs, …) ----------------
ROOT2, C, M3 = 200, 30, 22

DS2 = make_dataset(
    blueprints={
        2000: {"product": ROOT2, "mats": [(C, 1)]},
        2030: {"product": C, "mats": [(M3, 3)]},
    },
    type_names={ROOT2: "Root2", C: "CompC", M3: "Min3"},
)
PRICES2 = DictPrices({
    ROOT2: {"sell": 500.0},
    C: {"sell": 5.0},
    M3: {"sell": 10.0},
})


def test_fixpoint_flips_c_because_small_batch_floor_bites():
    # ME 90 en el BP de C: marginal dice construir (0.3*10 = 3 < 5),
    # pero 1 run consume max(1, ceil(0.3)) = 1 M3 -> coste real 10 > 5.
    a = Assumptions(me_map={2030: 90.0}, default_me=0.0, max_fixpoint_iterations=8)
    mob = resolve_make_or_buy(DS2, a, PRICES2, ROOT2)
    assert C in mob.flips
    assert mob.decision[C] is NodePolicy.BUY

    r = resolve(DS2, ROOT2, a, PRICES2)
    assert r.leaves == {C: 1}
    assert r.total_cost == pytest.approx(5.0)
    assert r.fixpoint_iterations >= 2


def test_no_flip_when_floor_does_not_bite():
    # base 2, ME 50 -> reducido = 1 por run (>= 1): el suelo max(runs, …) no muerde.
    # marginal C = 1 * precio(M3)=2 = 2 < comprar C (5) -> construir, y el coste
    # real coincide con el marginal, así que el punto fijo no lo revierte.
    ds = make_dataset(
        blueprints={
            2000: {"product": ROOT2, "mats": [(C, 40)]},
            2030: {"product": C, "mats": [(M3, 2)], "ml": 1000},
        },
        type_names={ROOT2: "Root2", C: "CompC", M3: "Min3"},
    )
    prices = DictPrices({
        ROOT2: {"sell": 500.0},
        C: {"sell": 5.0},
        M3: {"sell": 2.0},
    })
    a = Assumptions(me_map={2030: 50.0}, default_me=0.0)
    mob = resolve_make_or_buy(ds, a, prices, ROOT2)
    assert mob.decision[C] is NodePolicy.BUILD
    assert C not in mob.flips

    r = resolve(ds, ROOT2, a, prices)
    # 40 C -> 40 runs -> max(40, ceil(40*2*0.5)) = 40 M3 -> coste 80, unidad 2.0
    assert r.leaves == {M3: 40}
    assert r.nodes[C].real_unit_cost == pytest.approx(2.0)


# --- reacciones: misma maquinaria, activityID 11 ----------------------------
def test_reaction_node_respects_by_activity_policy():
    RROOT, RINT, RGAS = 300, 31, 23
    ds = make_dataset(
        blueprints={
            3000: {"product": RROOT, "mats": [(RINT, 2)], "a": 1},
            3031: {"product": RINT, "mats": [(RGAS, 10)], "a": 11},  # reacción
        },
        type_names={RROOT: "RRoot", RINT: "ReactInt", RGAS: "Gas"},
    )
    prices = DictPrices({
        RROOT: {"sell": 1000.0},
        RINT: {"sell": 50.0},     # comprar el intermedio de reacción
        RGAS: {"sell": 1.0},      # construirlo costaría 10
    })
    a = Assumptions(
        policy=PolicyConfig(by_activity={"reaction": NodePolicy.BUY}),
        default_me=0.0,
    )
    mob = resolve_make_or_buy(ds, a, prices, RROOT)
    assert mob.decision[RINT] is NodePolicy.BUY
    r = resolve(ds, RROOT, a, prices)
    assert r.leaves == {RINT: 2}
    assert r.total_cost == pytest.approx(100.0)


# --- modo "vertical de minerales" -------------------------------------------
def _mineral_dataset():
    # ROOT (manuf) <- A (manuf, minerales) + B (reacción)
    ROOT_M, A_M, B_M, MIN, GAS = 400, 41, 42, 34, 24
    ds = make_dataset(
        blueprints={
            4000: {"product": ROOT_M, "mats": [(A_M, 3), (B_M, 2)], "a": 1},
            4041: {"product": A_M, "mats": [(MIN, 100)], "a": 1},   # job de minerales
            4042: {"product": B_M, "mats": [(GAS, 50)], "a": 11},   # reacción
        },
        type_names={ROOT_M: "RootM", A_M: "CompA", B_M: "ReactB", MIN: "Tritanium", GAS: "Gas"},
    )
    prices = DictPrices({
        ROOT_M: {"sell": 100_000.0},
        A_M: {"sell": 900.0},
        B_M: {"sell": 400.0},
        MIN: {"sell": 5.0},
        GAS: {"sell": 3.0},
    })
    return ds, prices, ROOT_M, A_M, B_M, MIN


def test_minerals_mode_builds_manufacturing_buys_reactions():
    ds, prices, ROOT_M, A_M, B_M, MIN = _mineral_dataset()
    a = Assumptions(policy=PolicyConfig(default=NodePolicy.MINERALS), default_me=0.0)
    mob = resolve_make_or_buy(ds, a, prices, ROOT_M)

    assert mob.decision[ROOT_M] is NodePolicy.BUILD   # manufacturing
    assert mob.decision[A_M] is NodePolicy.BUILD      # manufacturing (minerales)
    assert mob.decision[B_M] is NodePolicy.BUY        # reacción -> comprar
    assert B_M not in mob.flips                       # forzado, el punto fijo no lo toca

    r = resolve(ds, ROOT_M, a, prices)
    # ROOT: 1 run -> 3 A + 2 B ; A construido (3 -> 300 Tritanium) ; B comprado
    assert set(r.leaves) == {B_M, MIN}
    assert r.leaves[B_M] == 2
    assert r.leaves[MIN] == 300


def test_minerals_mode_type_override_still_wins():
    ds, prices, ROOT_M, A_M, B_M, MIN = _mineral_dataset()
    a = Assumptions(
        policy=PolicyConfig(default=NodePolicy.MINERALS, by_type={B_M: NodePolicy.BUILD}),
        default_me=0.0,
    )
    mob = resolve_make_or_buy(ds, a, prices, ROOT_M)
    assert mob.decision[B_M] is NodePolicy.BUILD      # override por typeID manda


# --- estructura + rigs de verdad reducen el material -----------------------
def test_rig_reduces_material_and_security_amplifies():
    from eveindustry.model.structure import RigCatalog, StructureConfig

    ROOT_R, M = 600, 34
    ds = make_dataset(
        blueprints={6000: {"product": ROOT_R, "mats": [(M, 1000)], "a": 1}},
        type_names={ROOT_R: "Rigged", M: "Tritanium"},
    )
    prices = DictPrices({ROOT_R: {"sell": 999_999.0}, M: {"sell": 5.0}})
    # rig T2 (2.4%) que aplica a la categoría 1 (la que usa make_dataset)
    rigs_doc = {
        "structures": {"9": {"n": "S", "roleBonus": {"manufacturing": 0.01}}},
        "rigs": {"7": {"n": "r", "activity": "manufacturing", "meBonus": 0.024, "categories": [1]}},
        "secMultiplier": {"highsec": 1.0, "nullsec": 2.1},
    }
    catalog = RigCatalog.from_doc(rigs_doc)

    base = resolve(ds, ROOT_R, Assumptions(default_me=0.0), prices)
    hs = resolve(ds, ROOT_R, Assumptions(
        default_me=0.0, rig_catalog=catalog,
        structure=StructureConfig(structure_type_id=9, rig_type_ids=(7,), security="highsec"),
    ), prices)
    ns = resolve(ds, ROOT_R, Assumptions(
        default_me=0.0, rig_catalog=catalog,
        structure=StructureConfig(structure_type_id=9, rig_type_ids=(7,), security="nullsec"),
    ), prices)

    assert hs.total_material_cost < base.total_material_cost
    assert ns.total_material_cost < hs.total_material_cost   # ×2.1 amplifica el rig
    assert hs.nodes[ROOT_R].structure_factor < 1.0
    assert ns.nodes[ROOT_R].structure_factor < hs.nodes[ROOT_R].structure_factor
