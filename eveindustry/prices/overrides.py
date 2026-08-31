"""Decorator: overrides de precio por typeID (vienen del estado de la URL).

``overrides[type_id]`` es un dict parcial con cualquiera de ``"buy"``, ``"sell"``,
``"adjusted"``, ``"average"``. Lo que no esté se delega al proveedor envuelto.
"""

from __future__ import annotations

from eveindustry.prices.base import PriceProvider


class OverridePriceProvider:
    def __init__(
        self,
        inner: PriceProvider,
        overrides: dict[int, dict[str, float]] | None = None,
    ) -> None:
        self._inner = inner
        self._ov = {int(k): dict(v) for k, v in (overrides or {}).items()}

    def _get(self, type_id: int, key: str, fallback) -> float | None:
        row = self._ov.get(type_id)
        if row is not None and key in row and row[key] is not None:
            return float(row[key])
        return fallback(type_id)

    def buy(self, type_id: int) -> float | None:
        return self._get(type_id, "buy", self._inner.buy)

    def sell(self, type_id: int) -> float | None:
        return self._get(type_id, "sell", self._inner.sell)

    def adjusted(self, type_id: int) -> float | None:
        return self._get(type_id, "adjusted", self._inner.adjusted)

    def average(self, type_id: int) -> float | None:
        return self._get(type_id, "average", self._inner.average)
