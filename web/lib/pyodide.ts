// Carga diferida de Pyodide + del wheel del motor. Una sola vez por pestaña.
// El init en frío tarda unos segundos (el runtime son ~12 MB descomprimidos);
// luego el navegador lo cachea y cada cálculo posterior es instantáneo, sin red.

import {
  beginRequest,
  bootFailure,
  bootStep,
  tapFetch,
  trackedFetch,
  watchResource,
} from "./bootProgress";

const PYODIDE_VERSION = "0.28.3";
// NEXT_PUBLIC_PYODIDE_URL permite servir Pyodide desde otro sitio (auto-alojarlo,
// o probar en local sin acceso a jsDelivr).
const CDN =
  process.env.NEXT_PUBLIC_PYODIDE_URL?.replace(/\/*$/, "/") ||
  `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// Tamaños DESCOMPRIMIDOS de lo que baja Pyodide 0.28.3, medidos del tarball npm
// (micropip, del wheel de PyPI: el del CDN es una recompilación de tamaño
// parecido). Solo sirven para la barra de progreso; si se sube PYODIDE_VERSION
// hay que medirlos otra vez — en desarrollo avisa si se desvían más de un 10 %.
const RUNTIME_FILES: Record<string, number> = {
  "pyodide.js": 17_331,
  "pyodide-lock.json": 109_732,
  "python_stdlib.zip": 2_416_866,
  "pyodide.asm.wasm": 8_645_967,
  "pyodide.asm.js": 1_073_033,
  "micropip-0.10.1-py3-none-any.whl": 115_174,
};
const RUNTIME_BYTES = Object.values(RUNTIME_FILES).reduce((a, b) => a + b, 0);
// Lo que se compara al llegar (aviso en desarrollo). micropip no: su tamaño es
// el del wheel de PyPI y el del CDN es otro, así que avisaría siempre.
const SIZE_CHECK = Object.fromEntries(
  Object.entries(RUNTIME_FILES).filter(([f]) => !f.startsWith("micropip-")),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pyodide = any;

declare global {
  interface Window {
    loadPyodide?: (opts: { indexURL: string; packages?: string[] }) => Promise<Pyodide>;
  }
}

let cached: Pyodide | null = null;
let inflight: Promise<Pyodide> | null = null;

function loadScript(src: string, name: string, bytes: number): Promise<void> {
  const h = beginRequest(name, true);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => {
      h.end(bytes);
      resolve();
    };
    s.onerror = () => {
      const msg = `no se pudo cargar ${src}`;
      h.fail(msg);
      reject(new Error(msg));
    };
    document.head.appendChild(s);
  });
}

export function base(): string {
  // basePath del deploy (vacío por defecto). Permite servir bajo un subdirectorio.
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}

/** Nombre del fichero si la URL es del CDN de Pyodide; si no, null (no se cuenta). */
function cdnFile(url: string): string | null {
  return url.startsWith(CDN) ? url.slice(CDN.length).split("?")[0] || null : null;
}

export async function getPyodide(): Promise<Pyodide> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    bootStep("runtime", RUNTIME_BYTES);
    let pyodide: Pyodide;
    // loadPyodide baja el lock, la stdlib, el .wasm y micropip por dentro, en
    // paralelo y sin emitir progreso: se cuentan parcheando fetch mientras dura.
    const untap = tapFetch(cdnFile, SIZE_CHECK);
    try {
      if (!window.loadPyodide)
        await loadScript(`${CDN}pyodide.js`, "pyodide.js", RUNTIME_FILES["pyodide.js"]);
      const unwatch = watchResource(
        `${CDN}pyodide.asm.js`,
        "pyodide.asm.js",
        RUNTIME_FILES["pyodide.asm.js"],
      );
      try {
        // Si el .wasm falla (403, bloqueador, red cortada), Pyodide solo hace un
        // console.warn y esta promesa no termina NUNCA: la carrera con el primer
        // fallo de descarga lo convierte en un error con mensaje claro.
        pyodide = await Promise.race([
          window.loadPyodide!({ indexURL: CDN, packages: ["micropip"] }),
          bootFailure(),
        ]);
      } finally {
        unwatch();
      }
    } finally {
      untap();
    }

    bootStep("engine");
    const micropip = pyodide.pyimport("micropip");

    // Bajamos el wheel nosotros (no micropip) para dar un error claro si la ruta
    // devuelve HTML/404 en vez del binario, y para evitarnos su fetch interno.
    // El nombre real del wheel (con su versión) y el hash de cache-busting los
    // publica sync-assets.mjs en este manifiesto — nada hardcodeado aquí.
    type Manifest = { wheel: string; hash: string };
    let manifest: Manifest | null = null;
    try {
      manifest = await (
        await trackedFetch(`${base()}/engine/manifest.json`, undefined, "manifest.json")
      ).json();
    } catch {
      /* se valida abajo */
    }
    if (!manifest?.wheel) {
      throw new Error("manifiesto del motor no disponible (engine/manifest.json)");
    }
    const wheelUrl = `${base()}/engine/${manifest.wheel}?v=${manifest.hash}`;
    const resp = await trackedFetch(wheelUrl, undefined, manifest.wheel);
    if (!resp.ok) throw new Error(`wheel del motor: HTTP ${resp.status} en ${wheelUrl}`);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new Error(
        `wheel del motor: la respuesta no es un .whl (¿404 / SPA fallback?) en ${wheelUrl}`,
      );
    }
    // micropip parsea la versión/tags del nombre: tiene que ser el nombre PEP 427.
    const fsPath = `/tmp/${manifest.wheel}`;
    pyodide.FS.writeFile(fsPath, bytes);
    await micropip.install(`emfs:${fsPath}`);

    cached = pyodide;
    return pyodide;
  })();

  return inflight;
}
