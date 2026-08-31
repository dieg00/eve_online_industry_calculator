"""Calculadora make-or-buy de margenes de industria de EVE Online.

El paquete se divide en:

- ``eveindustry.sde``     lee el SDE (SQLite) y lo recorta a JSON. Solo en build/Action.
- ``eveindustry.model``   dataclasses y carga de los JSON recortados a indices en memoria.
- ``eveindustry.engine``  FUNCIONES PURAS. Sin I/O. Corre tal cual en Pyodide en el navegador.
- ``eveindustry.prices``  capa de precios tras una interfaz abstracta.
- ``eveindustry.invention`` capa de invencion (probabilidad, decryptors).
"""

__version__ = "0.1.0"
