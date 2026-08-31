# web — frontend de la calculadora

Next.js con **export estático**. Todo el cómputo corre en el cliente: el motor
Python (`eveindustry`) se ejecuta en el navegador vía **Pyodide**. Sin backend.

## Desarrollo

```bash
# desde la raíz del repo, una vez:
python -m pip wheel . --no-deps -w dist/        # construye el wheel del motor

cd web
npm install
npm run dev        # predev copia data/ y dist/*.whl a public/
```

`predev` / `prebuild` ejecutan `scripts/sync-assets.mjs`, que copia a `public/`:

- `public/data/*.json` — SDE recortado (`blueprints`, `types`, `systems`, `rigs`)
  desde `../data`, más `prices.json` / `indices.json`.
- `public/engine/eveindustry-0.1.0-py3-none-any.whl` + `version.txt` (cache-bust).

`prices.json` / `indices.json` los publica la GitHub Action (`.github/workflows/
data.yml`) en la rama `data`. El frontend los lee **en tiempo de ejecución**
desde ahí si defines:

    NEXT_PUBLIC_DATA_URL=https://raw.githubusercontent.com/<owner>/<repo>/data/data

Así se refrescan cada día sin re-deploy. Si no está definido (o si el fetch
falla), se cae a la copia bundleada en `/data/` — que solo existe si el build
tenía los ficheros: en local (`../data`) o vía
`DATA_BRANCH_RAW_BASE` (mismo valor) que hace que `sync-assets.mjs` los baje.
El repo debe ser público para que el navegador pueda leer el raw.

## Deploy (Vercel)

- Root del proyecto: `web/`. `vercel.json` fija `buildCommand`/`outputDirectory`.
- Variable de entorno: `DATA_BRANCH_RAW_BASE` (ver arriba).
- Para refrescar precios sin re-deployar código: un Deploy Hook disparado por la
  Action tras publicar en la rama `data`.

## Arquitectura

```
lib/pyodide.ts   carga diferida de Pyodide (CDN) + micropip install del wheel
lib/engine.ts    bootstrap Python: dataset_from_docs + resolve; expone calc()/buildables()
lib/query.ts     edición del query-string de estado (el formato lo define eveindustry/state.py)
app/page.tsx     UI: inputs -> query -> engine.calc(query) -> render; estado en la URL
```

El primer arranque descarga ~6–8 MB de runtime (cacheado luego); cada recálculo
posterior es local e instantáneo.
