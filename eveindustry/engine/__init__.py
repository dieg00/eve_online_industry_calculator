"""Motor de calculo. FUNCIONES PURAS, sin I/O.

Este subpaquete no importa sqlite, no lee ficheros y no llama a la red. Recibe el
dataset, los supuestos y los precios ya cargados y devuelve estructuras planas.
Es lo que corre en el navegador via Pyodide.
"""

from eveindustry.engine.jobcost import (
    CostConstants,
    CostIndices,
    JobCost,
    estimated_item_value,
    job_install_cost,
)
from eveindustry.engine.makeorbuy import MakeOrBuyResult, resolve_make_or_buy
from eveindustry.engine.me import (
    job_material_totals,
    material_quantity_per_job,
    runs_for_demand,
)
from eveindustry.engine.policy import NodePolicy, PolicyConfig
from eveindustry.engine.resolve import NodeResult, ResolveResult, resolve

__all__ = [
    "job_material_totals",
    "material_quantity_per_job",
    "runs_for_demand",
    "CostConstants",
    "CostIndices",
    "JobCost",
    "estimated_item_value",
    "job_install_cost",
    "NodePolicy",
    "PolicyConfig",
    "MakeOrBuyResult",
    "resolve_make_or_buy",
    "NodeResult",
    "ResolveResult",
    "resolve",
]
