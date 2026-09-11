# Convenciones de este repo

## Git — autorización permanente

**Commit + push a `main` de forma automática** al cerrar cada cambio, siempre que
`pytest` esté en verde. Confirmado por el autor (2026-09-10); no hace falta
preguntar cada vez.

- Mensajes de commit descriptivos y en presente.
- Acabar cada mensaje con `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Trabajo en `main` directamente (proyecto de una persona).

## Comandos

| | |
|---|---|
| Tests | `.venv/bin/python -m pytest -q` |
| CLI | `.venv/bin/eveindustry calc <typeID> --me 10 --system 30000142` |
| Web dev | `cd web && npm run dev` |
| Rebuild del wheel tras tocar `eveindustry/` | `python -m pip wheel . --no-deps -w dist/ && node web/scripts/sync-assets.mjs` |
| Regenerar rigs desde el SDE | `python scripts/list_rigs.py --sde sde.sqlite --out data/rigs.json` |
| Regenerar ore desde el SDE | `python scripts/build_ores.py --sde sde.sqlite --out data/ores.json` |

## Versionado

Una sola versión para todo el proyecto (motor + web), en `pyproject.toml`
([project].version). Sin script de bump: al implementar una funcionalidad
nueva (no en fixes/refactors menores de puro estilo), como parte de ese mismo
cambio:

1. Sube el número en `pyproject.toml` (semver: MINOR para funcionalidades,
   PATCH para arreglos, MAJOR para cambios incompatibles).
2. Añade una entrada al principio de `CHANGELOG.md` (formato Keep a
   Changelog, `## [x.y.z] - AAAA-MM-DD`). **Nunca** una sección
   `## [Unreleased]`: la web asume que la primera entrada del changelog ES
   la versión actual. Cada viñeta en **una sola línea física** (sin
   envolver): el parser de `sync-assets.mjs` es a propósito muy simple y no
   junta continuaciones.
3. Si el cambio toca `eveindustry/`: reconstruye el wheel y commitea el
   binario resultante —
   `python -m pip wheel . --no-deps -w dist/ && node web/scripts/sync-assets.mjs`,
   luego `git add`/`git rm` lo que cambie en `web/public/engine/`. Ese
   directorio **sí se versiona** (ver `.gitignore`): Vercel construye sin
   `dist/`, así que el `.whl` commiteado es el que se despliega de verdad.
   Editar solo `pyproject.toml` sin repetir este paso deja desplegado el
   motor viejo con la versión nueva en la etiqueta.
4. `git tag vX.Y.Z` sobre el commit de la release y `git push origin vX.Y.Z`.

`eveindustry/__init__.py` lee `__version__` de los metadatos del paquete
instalado (`importlib.metadata`), nunca hardcodeado — tras bumpear en local
hace falta un `pip install -e .` para que se refleje; si se olvida,
`tests/test_version.py` falla con un mensaje explicándolo, en vez de dejarlo
pasar en silencio. La web muestra la versión e insignia de novedades leyendo
`web/public/data/changelog.json`, que `sync-assets.mjs` deriva de
`CHANGELOG.md` en cada `predev`/`prebuild` — no hay fichero intermedio
versionado. El mismo script avisa (sin fallar el build) si la versión del
changelog no coincide con la de `pyproject.toml` o con la del wheel
commiteado.

## Arquitectura

Motor Python puro (cero deps) en `eveindustry/`: corre en `pytest` y en el
navegador vía **Pyodide** (`web/`, Next.js export estático en Vercel). El SDE va
recortado a `data/{blueprints,types,systems,rigs,ores}.json` (versionados);
`prices.json` / `indices.json` los publica la GitHub Action `data.yml` en la rama
`data` y el frontend los lee en runtime (`NEXT_PUBLIC_DATA_URL`).

Diseño completo: `~/.claude/plans/calculadora-de-industria-de-glimmering-sutton.md`.
