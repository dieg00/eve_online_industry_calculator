// Copia los datos (SDE recortado + precios + índices) y el wheel del motor a
// web/public/. Se ejecuta en `prebuild` y `predev`.
//
// prices.json / indices.json los publica la GitHub Action en la rama `data`; en
// local se usan los de ../data si existen. Si faltan, el build sigue pero la app
// avisará al cargar.

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  "ores.json",
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

// El nombre del wheel lleva su versión real (PEP 427: eveindustry-X.Y.Z-...).
// No se renombra: renombrarlo a un nombre fijo es lo que antes obligaba a
// hardcodear "eveindustry-0.1.0-..." aquí Y en pyodide.ts (dos sitios más).
// En su lugar se publica un manifest.json con el nombre real + el hash de
// cache-busting, y pyodide.ts lo lee en runtime.
const wheel = existsSync(distSrc)
  ? readdirSync(distSrc).find((f) => f.endsWith(".whl"))
  : null;
if (wheel) {
  // limpia wheels de versiones anteriores para no acumular binarios muertos
  for (const f of readdirSync(pubEngine)) {
    if (f.endsWith(".whl") && f !== wheel) rmSync(join(pubEngine, f));
  }
  const dest = join(pubEngine, wheel);
  cpSync(join(distSrc, wheel), dest);
  const hash = createHash("sha256").update(readFileSync(dest)).digest("hex").slice(0, 12);
  writeFileSync(join(pubEngine, "manifest.json"), JSON.stringify({ wheel, hash }));
  console.log("engine:", wheel, hash);
} else {
  console.warn("no hay wheel en ../dist — corre: python -m pip wheel . --no-deps -w dist/");
}

// CHANGELOG.md (raíz) es la única fuente del historial de versiones; se
// deriva a JSON aquí para que la web no necesite un parser de Markdown.
// Formato fijo que controlamos nosotros mismos, así que basta un parser a
// medida: cabeceras "## [x.y.z] - AAAA-MM-DD" + viñetas "- texto". Cualquier
// otra línea (preámbulo, subcabeceras ### Added/Changed/Fixed, blancos) se
// ignora sin más. Nunca debe haber una sección "## [Unreleased]": la web
// asume que la primera entrada de este JSON es la versión que corre ahora.
function parseChangelog(md) {
  const heading = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/;
  const bullet = /^\s*-\s+(.*\S)\s*$/;
  const entries = [];
  let current = null;
  for (const line of md.split("\n")) {
    const h = line.match(heading);
    if (h) {
      current = { version: h[1], date: h[2] ?? "", highlights: [] };
      entries.push(current);
      continue;
    }
    const b = current && line.match(bullet);
    if (b) current.highlights.push(b[1]);
  }
  return entries;
}

const changelogSrc = join(repo, "CHANGELOG.md");
if (existsSync(changelogSrc)) {
  const entries = parseChangelog(readFileSync(changelogSrc, "utf8"));
  writeFileSync(join(pubData, "changelog.json"), JSON.stringify(entries));
  console.log("changelog:", entries.length, "versiones");

  // Guardarraíles (avisos, no errores duros): que no se me olvide sincronizar
  // la versión en los tres sitios que importan al bumpear.
  const pyprojectSrc = readFileSync(join(repo, "pyproject.toml"), "utf8");
  const pyprojectVersion = pyprojectSrc.match(/(?<=^version\s*=\s*")[^"]+/m)?.[0];
  if (entries[0] && entries[0].version !== pyprojectVersion) {
    console.warn(
      `changelog.json (${entries[0].version}) no coincide con pyproject.toml (${pyprojectVersion})`,
    );
  }
  if (wheel) {
    const wheelVersion = wheel.match(/^eveindustry-([^-]+)-/)?.[1];
    if (entries[0] && wheelVersion && entries[0].version !== wheelVersion) {
      console.warn(
        `changelog.json (${entries[0].version}) no coincide con el wheel commiteado ` +
          `(${wheelVersion}) — ¿falta reconstruir y commitear web/public/engine/*.whl?`,
      );
    }
  }
} else {
  console.warn("no hay CHANGELOG.md en la raíz del repo");
}
