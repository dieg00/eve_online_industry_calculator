"""Capa de precios tras una interfaz abstracta.

El motor solo conoce ``PriceProvider``. Hoy: ``StaticJsonPriceProvider`` (JSON que
vuelca una GitHub Action). Mañana, sin tocar el motor: ``EsiLivePriceProvider``
cuando llegue el SSO/backend. ``OverridePriceProvider`` aplica los overrides
puntuales del estado de la URL.
"""

from eveindustry.prices.base import PriceKind, PriceProvider, resolve_price
from eveindustry.prices.overrides import OverridePriceProvider
from eveindustry.prices.static_json import StaticJsonPriceProvider

__all__ = [
    "PriceKind",
    "PriceProvider",
    "resolve_price",
    "OverridePriceProvider",
    "StaticJsonPriceProvider",
]
