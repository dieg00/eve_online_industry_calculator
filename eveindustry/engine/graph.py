"""Grafo de recetas: orden topológico y subgrafo de construcción.

La red manufacturing+reacción es un DAG en la práctica; aun así se protege contra
ciclos (Kahn deja fuera lo que no se puede ordenar y se avisa).
"""

from __future__ import annotations

from collections import deque

from eveindustry.model.dataset import Dataset


def build_subgraph(
    dataset: Dataset,
    root_product_id: int,
    build_set: set[int],
) -> tuple[dict[int, list[int]], dict[int, list[int]]]:
    """Aristas entre nodos construidos ({root} ∪ build_set).

    Devuelve ``(children, parents)`` donde ``children[t]`` son los productos
    construidos que consume el trabajo de ``t`` (con multiplicidad colapsada), y
    ``parents`` es la relación inversa. Los materiales que NO se construyen no
    aparecen aquí (son hojas de demanda).
    """
    built = set(build_set) | {root_product_id}
    children: dict[int, list[int]] = {t: [] for t in built}
    parents: dict[int, list[int]] = {t: [] for t in built}

    for t in built:
        bp = dataset.blueprint_for_product(t)
        if bp is None:
            continue
        seen: set[int] = set()
        for mat_id, _qty in bp.materials:
            if mat_id in built and mat_id not in seen and mat_id != t:
                seen.add(mat_id)
                children[t].append(mat_id)
                parents[mat_id].append(t)
    return children, parents


def topological_order(
    nodes: set[int],
    children: dict[int, list[int]],
) -> tuple[list[int], list[int]]:
    """Kahn sobre ``parent -> children``. Orden de padres antes que hijos.

    Devuelve ``(orden, en_ciclo)``. ``en_ciclo`` son los nodos que no se pudieron
    ordenar (parte de un ciclo); el llamador los tratará como hoja.
    """
    indeg: dict[int, int] = {t: 0 for t in nodes}
    for t in nodes:
        for c in children.get(t, ()):
            if c in indeg:
                indeg[c] += 1

    queue = deque(sorted(t for t in nodes if indeg[t] == 0))
    order: list[int] = []
    while queue:
        t = queue.popleft()
        order.append(t)
        for c in sorted(children.get(t, ())):
            if c not in indeg:
                continue
            indeg[c] -= 1
            if indeg[c] == 0:
                queue.append(c)

    in_cycle = [t for t in nodes if t not in order]
    return order, in_cycle
