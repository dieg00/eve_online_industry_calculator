import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// URL de la rama `data` (precios e índices que publica la GitHub Action a diario).
// La web la lee en runtime para refrescar precios sin re-deploy. Si no se define
// NEXT_PUBLIC_DATA_URL, se reutiliza DATA_BRANCH_RAW_BASE: es el mismo valor y es
// la única variable que existe en Vercel. Sin esto, la web servía los precios
// empaquetados en el último deploy. No es un secreto: es el raw público del repo.
const dataUrl = process.env.NEXT_PUBLIC_DATA_URL || process.env.DATA_BRANCH_RAW_BASE;

// Hash corto y tamaño de cada JSON de public/data/, para web/lib/engine.ts:
// - el hash va en la URL (`?v=`), así el navegador cachea los datos estáticos
//   entre visitas sin servir nunca el SDE de un deploy anterior;
// - el tamaño (descomprimido) es lo que espera la barra de progreso.
// `next build`/`next dev` corren después de sync-assets.mjs (prebuild/predev),
// así que los ficheros ya están ahí. Va en el bundle y no en un manifest.json
// servido aparte porque vercel.json cachea /data/ una hora: quedaría desfasado.
const DATA_FILES = [
  "blueprints.json",
  "types.json",
  "systems.json",
  "rigs.json",
  "ores.json",
  "prices.json",
  "indices.json",
  "changelog.json",
];
const dataDir = join(process.cwd(), "public", "data");
const dataManifest: Record<string, { v: string; bytes: number }> = {};
for (const f of DATA_FILES) {
  const p = join(dataDir, f);
  if (!existsSync(p)) continue;
  const buf = readFileSync(p);
  dataManifest[f] = { v: createHash("sha256").update(buf).digest("hex").slice(0, 12), bytes: buf.length };
}

// Export estático: todo el cómputo vive en el cliente (Pyodide), sin backend.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // `env` inlinea los valores en el bundle en build-time (Next sustituye
  // `process.env.NEXT_PUBLIC_…`). NEXT_PUBLIC_DATA_URL solo se define si hay
  // valor: así en local, sin variables, sigue cayendo a la copia de /data/.
  env: {
    ...(dataUrl ? { NEXT_PUBLIC_DATA_URL: dataUrl } : {}),
    NEXT_PUBLIC_DATA_MANIFEST: JSON.stringify(dataManifest),
  },
  // Pyodide necesita estas cabeceras solo si se usa SharedArrayBuffer / hilos.
  // En export estático no hay servidor, así que se configuran en vercel.json.
};

export default nextConfig;
