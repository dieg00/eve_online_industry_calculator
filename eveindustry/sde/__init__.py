"""Lectura y recorte del SDE (Static Data Export) de EVE Online.

Se asume la conversión a SQLite de fuzzwork (nombres de tabla estándar del SDE:
``industryActivityMaterials``, ``industryActivityProducts``, ``industryBlueprints``,
``invTypes``, ``invGroups``, ``invCategories``...).

Este subpaquete SOLO corre en build / en la GitHub Action. El navegador nunca ve
sqlite: recibe los JSON que produce ``eveindustry.sde.trim``.
"""
