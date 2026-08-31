"""Política por nodo: construir / comprar / auto (plan §4d).

Se resuelve en este orden de prioridad:

1. override por typeID
2. default por categoría (invCategories)
3. default por actividad ("manufacturing", "reaction")
4. default global

``build`` sobre un typeID sin blueprint se degrada a ``buy`` con un aviso.
Solo ``auto`` ejecuta el ``min(comprar, construir)``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class NodePolicy(str, Enum):
    BUILD = "build"
    BUY = "buy"
    AUTO = "auto"


@dataclass(frozen=True)
class PolicyDecision:
    policy: NodePolicy
    source: str   # "type" | "category" | "activity" | "default" | "no-blueprint"


@dataclass
class PolicyConfig:
    by_type: dict[int, NodePolicy] = field(default_factory=dict)
    by_category: dict[int, NodePolicy] = field(default_factory=dict)
    by_activity: dict[str, NodePolicy] = field(default_factory=dict)
    default: NodePolicy = NodePolicy.AUTO

    def resolve(
        self,
        type_id: int,
        *,
        category_id: int | None,
        activity_name: str | None,
        has_blueprint: bool,
    ) -> PolicyDecision:
        if type_id in self.by_type:
            decision = PolicyDecision(self.by_type[type_id], "type")
        elif category_id is not None and category_id in self.by_category:
            decision = PolicyDecision(self.by_category[category_id], "category")
        elif activity_name is not None and activity_name in self.by_activity:
            decision = PolicyDecision(self.by_activity[activity_name], "activity")
        else:
            decision = PolicyDecision(self.default, "default")

        if not has_blueprint:
            # Sin receta solo se puede comprar. Si alguien forzó build, lo degradamos.
            return PolicyDecision(NodePolicy.BUY, "no-blueprint")
        return decision
