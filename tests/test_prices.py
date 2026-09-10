"""Tests de la capa de precios (static JSON + overrides)."""

import pytest

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


# --- valoración de minerales propios (SelfMinedPriceProvider) ---------------
class _Inner:
    """Provider de juguete: precios fijos por typeID."""

    def __init__(self, table):
        self._t = table

    def buy(self, tid):
        return self._t.get(tid, {}).get("buy")

    def sell(self, tid):
        return self._t.get(tid, {}).get("sell")

    def adjusted(self, tid):
        return self._t.get(tid, {}).get("adjusted")

    def average(self, tid):
        return self._t.get(tid, {}).get("average")


def _mining_setup():
    from eveindustry.model.ores import Ore

    TRIT, PYE = 34, 35
    veld = Ore(type_id=1, name="Veldspar", family_id=462, family_name="Veldspar",
               grade=1, volume=0.1, portion=100, minerals=((TRIT, 400),),
               compressed_type_id=62516, compressed_volume=0.001)
    inner = _Inner({
        TRIT: {"buy": 4.0, "sell": 5.0, "adjusted": 4.5},
        PYE: {"buy": 10.0, "sell": 12.0},
        62516: {"sell": 1000.0, "buy": 900.0},   # 100 ud comprimidas
        99: {"buy": 7.0, "sell": 8.0},           # algo que no es mineral
    })
    return inner, [veld], frozenset({TRIT}), TRIT, PYE


def test_self_mined_zero_basis():
    from eveindustry.prices.mining import SelfMinedPriceProvider

    inner, ores, mineable, TRIT, PYE = _mining_setup()
    p = SelfMinedPriceProvider(inner, mineable, "zero", ores, 1.0)
    assert p.sell(TRIT) == 0.0 and p.buy(TRIT) == 0.0
    assert p.sell(PYE) == 12.0        # no minable -> delega
    assert p.sell(99) == 8.0


def test_self_mined_buy_basis_uses_jita_buy():
    from eveindustry.prices.mining import SelfMinedPriceProvider

    inner, ores, mineable, TRIT, _ = _mining_setup()
    p = SelfMinedPriceProvider(inner, mineable, "buy", ores, 1.0)
    assert p.sell(TRIT) == 4.0        # el buy del inner, no el sell


def test_self_mined_fixed_basis():
    from eveindustry.prices.mining import SelfMinedPriceProvider

    inner, ores, mineable, TRIT, _ = _mining_setup()
    p = SelfMinedPriceProvider(inner, mineable, "fixed", ores, 1.0, fixed_price=2.5)
    assert p.sell(TRIT) == 2.5


def test_self_mined_ore_basis_derives_from_compressed_price():
    from eveindustry.prices.mining import SelfMinedPriceProvider

    inner, ores, mineable, TRIT, _ = _mining_setup()
    # 1 lote comprimido = 100 ud × 1000 ISK = 100 000 ISK -> 400 Tritanium
    # valor de mercado del lote refinado = 400 × 4.0 (buy) = 1600
    # factor = 100000 / 1600 = 62.5 -> implícito = 4.0 × 62.5 = 250
    p = SelfMinedPriceProvider(inner, mineable, "ore", ores, 1.0)
    assert p.sell(TRIT) == pytest.approx(250.0)


def test_self_mined_never_touches_adjusted():
    from eveindustry.prices.mining import SelfMinedPriceProvider

    inner, ores, mineable, TRIT, _ = _mining_setup()
    p = SelfMinedPriceProvider(inner, mineable, "zero", ores, 1.0)
    # el EIV del coste de instalación usa adjusted_price de CCP: no se toca
    assert p.adjusted(TRIT) == 4.5
