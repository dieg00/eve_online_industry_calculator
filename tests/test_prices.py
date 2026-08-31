"""Tests de la capa de precios (static JSON + overrides)."""

from eveindustry.prices import (
    OverridePriceProvider,
    PriceKind,
    PriceProvider,
    StaticJsonPriceProvider,
    resolve_price,
)

DOC = {
    "meta": {"hub": "Jita IV-4"},
    "prices": {
        "34": {"b": 4.5, "s": 5.1, "adj": 4.9, "avg": 4.8},
        "35": {"b": 180.0, "s": 210.0, "adj": 200.0, "avg": 199.0},
        "36": {"b": None, "s": 900.0, "adj": 850.0, "avg": None},
    },
}


def test_static_provider_reads_all_kinds():
    p = StaticJsonPriceProvider(DOC)
    assert isinstance(p, PriceProvider)
    assert p.buy(34) == 4.5
    assert p.sell(34) == 5.1
    assert p.adjusted(35) == 200.0
    assert p.average(35) == 199.0


def test_static_provider_missing_type_and_missing_field():
    p = StaticJsonPriceProvider(DOC)
    assert p.buy(9999) is None
    assert p.buy(36) is None      # campo presente pero null
    assert p.average(36) is None
    assert p.sell(36) == 900.0


def test_resolve_price_by_kind():
    p = StaticJsonPriceProvider(DOC)
    assert resolve_price(p, 34, PriceKind.SELL) == 5.1
    assert resolve_price(p, 34, PriceKind.ADJUSTED) == 4.9


def test_override_replaces_only_given_fields():
    inner = StaticJsonPriceProvider(DOC)
    ov = OverridePriceProvider(inner, {34: {"sell": 6.0}, 36: {"buy": 800.0}})
    assert ov.sell(34) == 6.0        # override
    assert ov.buy(34) == 4.5         # delega
    assert ov.buy(36) == 800.0       # override rellena un hueco
    assert ov.adjusted(36) == 850.0  # delega
    assert isinstance(ov, PriceProvider)


def test_override_with_no_overrides_is_transparent():
    inner = StaticJsonPriceProvider(DOC)
    ov = OverridePriceProvider(inner)
    assert ov.sell(35) == 210.0
    assert ov.buy(9999) is None
