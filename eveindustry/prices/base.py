"""Interfaz de la capa de precios."""

from __future__ import annotations

from enum import Enum
from typing import Protocol, runtime_checkable


class PriceKind(str, Enum):
    BUY = "buy"            # Jita best buy: lo que te pagan si vendes a ordenes de compra
    SELL = "sell"          # Jita best sell: lo que pagas si compras de ordenes de venta
    ADJUSTED = "adjusted"  # ESI adjusted_price: solo para el EIV / coste de instalacion
    AVERAGE = "average"    # ESI average_price


@runtime_checkable
class PriceProvider(Protocol):
    """Devuelve precios por typeID. ``None`` = sin dato (el llamador decide)."""

    def buy(self, type_id: int) -> float | None: ...
    def sell(self, type_id: int) -> float | None: ...
    def adjusted(self, type_id: int) -> float | None: ...
    def average(self, type_id: int) -> float | None: ...


def resolve_price(provider: PriceProvider, type_id: int, kind: PriceKind) -> float | None:
    """Precio de ``type_id`` según ``kind`` usando ``provider``."""
    return {
        PriceKind.BUY: provider.buy,
        PriceKind.SELL: provider.sell,
        PriceKind.ADJUSTED: provider.adjusted,
        PriceKind.AVERAGE: provider.average,
    }[kind](type_id)
