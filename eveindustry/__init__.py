"""Calculadora make-or-buy de margenes de industria de EVE Online.

El paquete se divide en:

- ``eveindustry.sde``     lee el SDE (SQLite) y lo recorta a JSON. Solo en build/Action.
- ``eveindustry.model``   dataclasses y carga de los JSON recortados a indices en memoria.
- ``eveindustry.engine``  FUNCIONES PURAS. Sin I/O. Corre tal cual en Pyodide en el navegador.
- ``eveindustry.prices``  capa de precios tras una interfaz abstracta.
- ``eveindustry.invention`` capa de invencion (probabilidad, decryptors).
"""

from importlib.metadata import PackageNotFoundError, version

try:
    # Fuente única: `pyproject.toml` [project].version. Tras subirla en local
    # hace falta `pip install -e .` para que se refleje aquí — si no,
    # tests/test_version.py falla con un mensaje que lo explica.
    __version__ = version("eveindustry")
except PackageNotFoundError:  # pragma: no cover - paquete no instalado (raro)
    __version__ = "0.0.0-dev"
