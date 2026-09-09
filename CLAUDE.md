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

## Arquitectura

Motor Python puro (cero deps) en `eveindustry/`: corre en `pytest` y en el
navegador vía **Pyodide** (`web/`, Next.js export estático en Vercel). El SDE va
recortado a `data/{blueprints,types,systems,rigs}.json` (versionados);
`prices.json` / `indices.json` los publica la GitHub Action `data.yml` en la rama
`data` y el frontend los lee en runtime (`NEXT_PUBLIC_DATA_URL`).

Diseño completo: `~/.claude/plans/calculadora-de-industria-de-glimmering-sutton.md`.
