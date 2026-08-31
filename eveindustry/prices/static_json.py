"""``PriceProvider`` sobre el JSON estático que vuelca la GitHub Action.

Formato (plan §3b)::

    {"meta": {...}, "prices": {"<typeID>": {"b":..., "s":..., "adj":..., "avg":...}}}
"""

from __future__ import annotations

import json
from pathlib import Path


class StaticJsonPriceProvider:
    def __init__(self, prices_doc: dict) -> None:
        raw = prices_doc.get("prices", {})
        self._by_id: dict[int, dict] = {int(k): v for k, v in raw.items()}
        self.meta: dict = prices_doc.get("meta", {})

    @classmethod
    def from_file(cls, path: str | Path) -> "StaticJsonPriceProvider":
        return cls(json.loads(Path(path).read_text("utf-8")))

    def _field(self, type_id: int, key: str) -> float | None:
        row = self._by_id.get(type_id)
        if row is None:
            return None
        val = row.get(key)
        return float(val) if val is not None else None

    def buy(self, type_id: int) -> float | None:
        return self._field(type_id, "b")

    def sell(self, type_id: int) -> float | None:
        return self._field(type_id, "s")

    def adjusted(self, type_id: int) -> float | None:
        return self._field(type_id, "adj")

    def average(self, type_id: int) -> float | None:
        return self._field(type_id, "avg")
