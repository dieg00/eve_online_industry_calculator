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

    // Bajamos el wheel nosotros (no micropip) para dar un error claro si la ruta
    // devuelve HTML/404 en vez del binario, y para evitarnos su fetch interno.
    let v = "";
    try {
      v = "?v=" + (await (await fetch(`${base()}/engine/version.txt`)).text()).trim();
    } catch {
      /* sin manifiesto */
    }
    const wheelUrl = `${base()}/engine/eveindustry-0.1.0-py3-none-any.whl${v}`;
    const resp = await fetch(wheelUrl);
    if (!resp.ok) throw new Error(`wheel del motor: HTTP ${resp.status} en ${wheelUrl}`);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new Error(
        `wheel del motor: la respuesta no es un .whl (¿404 / SPA fallback?) en ${wheelUrl}`,
      );
    }
    // micropip parsea la versión/tags del nombre: tiene que ser el nombre PEP 427.
    const fsPath = "/tmp/eveindustry-0.1.0-py3-none-any.whl";
    pyodide.FS.writeFile(fsPath, bytes);
    await micropip.install(`emfs:${fsPath}`);

    cached = pyodide;
    return pyodide;
  })();

  return inflight;
}
