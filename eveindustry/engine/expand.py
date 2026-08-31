"""Expansión forzada: el modo del test de regresión (plan §4c).

No hay make-or-buy aquí. Se le da un conjunto de productos "a construir"
(``build_set``); el resto se trata como hoja y su demanda se acumula tal cual.
Es la pasada 2 del resolvedor sin la decisión económica.

Asunción de esta implementación (válida para el test de la Providence): ningún
nodo construido tiene dos padres construidos, así que la demanda de cada nodo se
conoce por completo en su primera visita y se puede resolver por recursión. El
resolvedor general (``engine.makeorbuy``) usará acumulación topológica real.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from eveindustry.engine.me import job_material_totals, runs_for_demand
from eveindustry.model.dataset import Dataset


@dataclass
class BuiltNode:
    product_type_id: int
    blueprint_type_id: int
    demand: int                 # unidades de producto pedidas
    produces_per_run: int
    jobs: list[int]             # tamaños de trabajo en runs
    me: float

    @property
    def total_runs(self) -> int:
        return sum(self.jobs)

    @property
    def produced(self) -> int:
        return self.total_runs * self.produces_per_run


@dataclass
class ExpandResult:
    root_product_id: int
    built: dict[int, BuiltNode] = field(default_factory=dict)   # product_type_id -> BuiltNode
    leaves: dict[int, int] = field(default_factory=dict)         # type_id -> cantidad total
    warnings: list[str] = field(default_factory=list)


def _me_for(blueprint_type_id: int, me_map: dict[int, float] | None, default_me: float) -> float:
    if me_map and blueprint_type_id in me_map:
        return me_map[blueprint_type_id]
    return default_me


def expand_forced(
    dataset: Dataset,
    root_product_id: int,
    *,
    build_set: set[int],
    me_map: dict[int, float] | None = None,
    default_me: float = 0.0,
    root_demand: int = 1,
    structure_factor: float = 1.0,
) -> ExpandResult:
    """Expande ``root_product_id`` y los productos de ``build_set``; todo lo demás
    queda como hoja en ``result.leaves``.

    ``me_map`` mapea blueprintTypeID -> ME. ``default_me`` es el ME por defecto.
    """
    result = ExpandResult(root_product_id=root_product_id)
    # El root siempre se construye, esté o no en build_set.
    to_build = set(build_set) | {root_product_id}

    def visit(product_id: int, demand: int, path: tuple[int, ...]) -> None:
        if product_id in result.built:
            # Nodo ya resuelto: bajo la asunción del módulo no debería repetirse
            # con demanda nueva. Si pasa, lo avisamos y sumamos como hoja.
            result.warnings.append(
                f"nodo construido {product_id} visitado dos veces "
                f"(path {path}); la asunción de un solo padre construido no se cumple"
            )
            result.leaves[product_id] = result.leaves.get(product_id, 0) + demand
            return

        bp = dataset.blueprint_for_product(product_id)
        if bp is None:
            result.warnings.append(
                f"producto {product_id} en build_set sin blueprint; tratado como hoja"
            )
            result.leaves[product_id] = result.leaves.get(product_id, 0) + demand
            return

        me = _me_for(bp.blueprint_type_id, me_map, default_me)
        jobs = runs_for_demand(demand, bp.produces_per_run, bp.max_production_limit)
        node = BuiltNode(
            product_type_id=product_id,
            blueprint_type_id=bp.blueprint_type_id,
            demand=demand,
            produces_per_run=bp.produces_per_run,
            jobs=jobs,
            me=me,
        )
        result.built[product_id] = node

        totals = job_material_totals(bp.materials, jobs, me, structure_factor)
        for mat_id, qty in totals.items():
            if mat_id in to_build and mat_id not in path:
                visit(mat_id, qty, path + (product_id,))
            else:
                if mat_id in path:
                    result.warnings.append(
                        f"ciclo detectado en {mat_id} (path {path}); tratado como hoja"
                    )
                result.leaves[mat_id] = result.leaves.get(mat_id, 0) + qty

    visit(root_product_id, root_demand, ())
    return result
