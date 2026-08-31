// Copia los datos (SDE recortado + precios + índices) y el wheel del motor a
// web/public/. Se ejecuta en `prebuild` y `predev`.
//
// prices.json / indices.json los publica la GitHub Action en la rama `data`; en
// local se usan los de ../data si existen. Si faltan, el build sigue pero la app
// avisará al cargar.

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// De dónde bajar prices.json / indices.json cuando no están en local (build en
// Vercel desde `main`). La GitHub Action los publica en la rama `data`.
//   DATA_BRANCH_RAW_BASE=https://raw.githubusercontent.com/<owner>/<repo>/data/data
const RAW_BASE = process.env.DATA_BRANCH_RAW_BASE;

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const dataSrc = join(repo, "data");
const distSrc = join(repo, "dist");
const pubData = join(here, "..", "public", "data");
const pubEngine = join(here, "..", "public", "engine");

mkdirSync(pubData, { recursive: true });
mkdirSync(pubEngine, { recursive: true });

const DATA_FILES = [
  "blueprints.json",
  "types.json",
  "systems.json",
  "rigs.json",
  "prices.json",
  "indices.json",
];

const missing = [];
for (const f of DATA_FILES) {
  const src = join(dataSrc, f);
  if (existsSync(src)) {
    cpSync(src, join(pubData, f));
    console.log("data:", f);
  } else {
    missing.push(f);
  }
}

for (const f of missing.slice()) {
  if (!RAW_BASE) break;
  try {
    const res = await fetch(`${RAW_BASE}/${f}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(join(pubData, f), Buffer.from(await res.arrayBuffer()));
    console.log("data (rama data):", f);
    missing.splice(missing.indexOf(f), 1);
  } catch (e) {
    console.warn(`no pude bajar ${f} de la rama data: ${e.message}`);
  }
}
if (missing.length) console.warn("faltan:", missing.join(", "));

const wheel = existsSync(distSrc)
  ? readdirSync(distSrc).find((f) => f.endsWith(".whl"))
  : null;
if (wheel) {
  const dest = join(pubEngine, "eveindustry-0.1.0-py3-none-any.whl");
  cpSync(join(distSrc, wheel), dest);
  const hash = createHash("sha256").update(readFileSync(dest)).digest("hex").slice(0, 12);
  writeFileSync(join(pubEngine, "version.txt"), hash);
  console.log("engine:", wheel, hash);
} else {
  console.warn("no hay wheel en ../dist — corre: python -m pip wheel . --no-deps -w dist/");
}
