// Carga diferida de Pyodide + del wheel del motor. Una sola vez por pestaña.
// El init en frío tarda unos segundos (descarga ~6-8 MB de runtime); luego el
// navegador lo cachea y cada cálculo posterior es instantáneo, sin red.

const PYODIDE_VERSION = "0.28.3";
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pyodide = any;

declare global {
  interface Window {
    loadPyodide?: (opts: { indexURL: string }) => Promise<Pyodide>;
  }
}

let cached: Pyodide | null = null;
let inflight: Promise<Pyodide> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`no se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

export function base(): string {
  // basePath del deploy (vacío por defecto). Permite servir bajo un subdirectorio.
  return process.env.NEXT_PUBLIC_BASE_PATH ?? "";
}

export async function getPyodide(onStatus?: (s: string) => void): Promise<Pyodide> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    onStatus?.("Descargando runtime de Python…");
    if (!window.loadPyodide) await loadScript(`${CDN}pyodide.js`);
    const pyodide = await window.loadPyodide!({ indexURL: CDN });

    onStatus?.("Instalando el motor…");
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");
    let v = "";
    try {
      v = "?v=" + (await (await fetch(`${base()}/engine/version.txt`)).text()).trim();
    } catch {
      /* sin manifiesto: se usa la URL a pelo */
    }
    await micropip.install(
      `${location.origin}${base()}/engine/eveindustry-0.1.0-py3-none-any.whl${v}`,
    );

    cached = pyodide;
    return pyodide;
  })();

  return inflight;
}
