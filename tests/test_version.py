"""`eveindustry.__version__` viene de importlib.metadata (el .dist-info del
paquete instalado), no de una constante a mano. Este test es la red de
seguridad: si alguien sube el número en pyproject.toml sin reinstalar
(`pip install -e .`), este test falla con un mensaje claro en vez de dejar el
motor reportando una versión vieja en silencio.
"""

import re
from pathlib import Path

import eveindustry


def test_version_matches_pyproject():
    text = (Path(__file__).parents[1] / "pyproject.toml").read_text()
    m = re.search(r'(?m)^version\s*=\s*"([^"]+)"', text)
    assert m, "no se encontró version= en pyproject.toml"
    assert eveindustry.__version__ == m.group(1), (
        f"eveindustry.__version__={eveindustry.__version__!r} no coincide con "
        f"pyproject.toml={m.group(1)!r} — ¿falta `pip install -e .` tras el bump?"
    )
