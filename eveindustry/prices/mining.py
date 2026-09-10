"""Valoración de los minerales que minas tú (decorator de ``PriceProvider``).

Si minas tu propio ore, esos minerales no cuestan el precio de Jita. Este
decorator sustituye ``buy``/``sell`` **solo** para los minerales que tus ores
pueden producir, según la base elegida:

- ``ore``  — coste de oportunidad honesto: lo que vale el **ore comprimido** del
  que saldrían. El precio del lote se reparte entre sus minerales **a prorrata de
  su valor de mercado** (un lote de Arkonor no vale solo por su Megacyte), y de
  cada mineral se toma el ore que lo deja más barato.
- ``zero`` — "mi tiempo es gratis": 0 ISK.
- ``buy``  — Jita buy del mineral.
- ``fixed``— un ISK/unidad a mano.

``adjusted`` y ``average`` NO se tocan: el EIV del coste de instalación se calcula
con los ``adjusted_price`` de CCP y no depende de dónde sacaste el material.
"""

from __future__ import annotations

from enum import Enum

from eveindustry.model.ores import Ore
from eveindustry.prices.base import PriceProvider


class MineralBasis(str, Enum):
    ORE = "ore"
    ZERO = "zero"
    BUY = "buy"
    FIXED = "fixed"


class SelfMinedPriceProvider:
    def __init__(
        self,
        inner: PriceProvider,
        mineable: frozenset[int] | set[int],
        basis: MineralBasis = MineralBasis.ORE,
        ores: list[Ore] | None = None,
        yield_rate: float = 0.5,
        fixed_price: float | None = None,
    ) -> None:
        self._inner = inner
        self._mineable = frozenset(mineable)
        self._basis = MineralBasis(basis)
        self._fixed = fixed_price
        self._implied: dict[int, float] = {}
        if self._basis is MineralBasis.ORE and ores:
            self._implied = _implied_from_ore(inner, ores, yield_rate, self._mineable)

    # ------------------------------------------------------------------ API
    def _mined(self, type_id: int) -> float | None:
        """Precio del mineral si lo minas tú; ``None`` si no aplica."""
        if type_id not in self._mineable:
            return None
        if self._basis is MineralBasis.ZERO:
            return 0.0
        if self._basis is MineralBasis.FIXED:
            return self._fixed if self._fixed is not None else None
        if self._basis is MineralBasis.BUY:
            return self._inner.buy(type_id)
        return self._implied.get(type_id)   # ORE; None -> cae al inner

    def buy(self, type_id: int) -> float | None:
        mined = self._mined(type_id)
        return mined if mined is not None else self._inner.buy(type_id)

    def sell(self, type_id: int) -> float | None:
        mined = self._mined(type_id)
        return mined if mined is not None else self._inner.sell(type_id)

    def adjusted(self, type_id: int) -> float | None:
        return self._inner.adjusted(type_id)

    def average(self, type_id: int) -> float | None:
        return self._inner.average(type_id)

    # -------------------------------------------------------------- detalle
    @property
    def basis(self) -> MineralBasis:
        return self._basis

    @property
    def mineable(self) -> frozenset[int]:
        return self._mineable

    def implied_prices(self) -> dict[int, float]:
        """ISK/unidad implícito por mineral (solo con base ``ore``)."""
        return dict(self._implied)


def _implied_from_ore(
    inner: PriceProvider,
    ores: list[Ore],
    yield_rate: float,
    mineable: frozenset[int],
) -> dict[int, float]:
    """Reparte el precio del ore comprimido entre sus minerales a prorrata del
    valor de mercado, y se queda con el ore más barato para cada mineral."""
    out: dict[int, float] = {}
    for ore in ores:
        comp_id = ore.compressed_type_id or ore.type_id
        ore_price = inner.sell(comp_id) or inner.buy(comp_id)
        if not ore_price or ore_price <= 0:
            continue

        # Valor de mercado del lote refinado, para repartir a prorrata.
        batch_value = 0.0
        yields: dict[int, float] = {}
        for mineral, qty in ore.minerals:
            units = qty * yield_rate
            if units <= 0:
                continue
            market = inner.buy(mineral) or inner.sell(mineral)
            if not market:
                continue
            yields[mineral] = units
            batch_value += units * market
        if batch_value <= 0 or not yields:
            continue

        factor = (ore_price * ore.portion) / batch_value
        for mineral, units in yields.items():
            if mineral not in mineable:
                continue
            market = inner.buy(mineral) or inner.sell(mineral) or 0.0
            implied = market * factor
            if mineral not in out or implied < out[mineral]:
                out[mineral] = implied
    return out
