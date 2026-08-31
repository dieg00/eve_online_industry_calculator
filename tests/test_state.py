"""Tests de eveindustry.state: round-trip del estado y traducción a Assumptions."""

import pytest

from eveindustry.engine.policy import NodePolicy
from eveindustry.prices.base import PriceKind
from eveindustry.state import (
    State,
    build_assumptions,
    price_override_map,
    resolve_security,
    security_band,
)

_JITA_SYSTEMS = {"systems": {"30000142": ["Jita", 0.9], "30003802": ["Curnemare", -0.03]}}


def test_parse_minimal():
    st = State.parse("t=20184")
    assert st.type_id == 20184
    assert st.demand == 1 and st.default_me == 0.0
    assert st.global_policy is NodePolicy.AUTO


def test_parse_requires_type_id():
    with pytest.raises(ValueError):
        State.parse("me=10&sys=30000142")


def test_round_trip_rich_state():
    s = (
        "t=20184&d=5&me=10&me.2049=7&sys=30000142&struct=35825&rigs=37180,37181"
        "&sec=nullsec&tax=0.001&pol=build&pol.34562=buy&polact.reaction=buy"
        "&inv=1&enc=4&sci1=3&pin=buy&pout=sell&broker=0.02&stax=0.03&px.34=6"
    )
    st = State.parse(s)
    assert st.demand == 5
    assert st.me_overrides == {2049: 7.0}
    assert st.rig_type_ids == (37180, 37181)
    assert st.security == "nullsec"
    assert st.facility_tax == 0.001
    assert st.global_policy is NodePolicy.BUILD
    assert st.policy_by_type == {34562: NodePolicy.BUY}
    assert st.policy_by_activity == {"reaction": NodePolicy.BUY}
    assert st.invention and st.enc_level == 4 and st.sci1_level == 3
    assert st.input_price_kind is PriceKind.BUY
    assert st.output_price_kind is PriceKind.SELL
    assert st.price_overrides == {34: 6.0}
    # y re-serializa idéntico (orden estable)
    assert State.parse(st.to_query()).to_query() == st.to_query()


def test_defaults_are_omitted_from_query():
    q = State(type_id=20184).to_query()
    assert q == "t=20184"


def test_minerals_policy_round_trips():
    st = State.parse("t=20184&pol=minerals")
    assert st.global_policy is NodePolicy.MINERALS
    assert st.to_query() == "t=20184&pol=minerals"
    assert st.to_dict()["global_policy"] == "minerals"
    a = build_assumptions(st)
    assert a.policy.default is NodePolicy.MINERALS


def test_build_assumptions_wires_indices_invention_and_policy():
    indices_doc = {
        "systems": {"30000142": {"manufacturing": 0.17, "reaction": 0.004}},
        "constants": {"sccSurcharge": 0.04, "facilityTaxDefault": 0.0025},
    }
    st = State.parse("t=20184&me=10&sys=30000142&inv=1&pol=buy&d=3")
    a = build_assumptions(st, indices_doc=indices_doc)
    assert a.default_me == 10.0
    assert a.root_demand == 3
    assert a.indices.manufacturing == 0.17
    assert a.indices.reaction == 0.004
    assert a.constants.scc_surcharge == 0.04
    assert a.invention is not None
    assert a.policy.default is NodePolicy.BUY


def test_build_assumptions_unknown_system_leaves_zero_indices():
    st = State.parse("t=20184&sys=99999999")
    a = build_assumptions(st, indices_doc={"systems": {}, "constants": {}})
    assert a.indices.manufacturing == 0.0


def test_price_override_map_expands_all_kinds():
    st = State.parse("t=1&px.34=6.5")
    assert price_override_map(st) == {34: {"buy": 6.5, "sell": 6.5, "adjusted": 6.5, "average": 6.5}}


# --- seguridad derivada del sistema ---------------------------------------
@pytest.mark.parametrize(
    "sec, band",
    [(0.9, "highsec"), (0.5, "highsec"), (0.45, "highsec"),
     (0.4, "lowsec"), (0.1, "lowsec"),
     (0.0, "nullsec"), (-0.03, "nullsec"), (-0.99, "nullsec")],
)
def test_security_band(sec, band):
    assert security_band(sec) == band


def test_security_defaults_to_none_and_derives_from_system():
    st = State.parse("t=1&sys=30000142")
    assert st.security is None
    assert "sec=" not in st.to_query()                       # no ensucia el link
    assert resolve_security(st, _JITA_SYSTEMS) == "highsec"
    assert build_assumptions(st, systems_doc=_JITA_SYSTEMS).structure.security == "highsec"


def test_nullsec_system_derives_nullsec():
    st = State.parse("t=1&sys=30003802")
    assert resolve_security(st, _JITA_SYSTEMS) == "nullsec"


def test_explicit_security_override_wins_and_round_trips():
    st = State.parse("t=1&sys=30000142&sec=lowsec")
    assert st.security == "lowsec"
    assert resolve_security(st, _JITA_SYSTEMS) == "lowsec"
    assert "sec=lowsec" in st.to_query()
    assert State.parse(st.to_query()).security == "lowsec"


def test_resolve_security_without_systems_doc_is_highsec():
    st = State.parse("t=1&sys=30000142")
    assert resolve_security(st, None) == "highsec"


def test_structure_and_rigs_round_trip():
    st = State.parse("t=20184&struct=35827&rigs=37172,43719&tax=0.001")
    assert st.structure_type_id == 35827
    assert st.rig_type_ids == (37172, 43719)
    assert st.facility_tax == 0.001
    assert State.parse(st.to_query()).to_query() == st.to_query()
