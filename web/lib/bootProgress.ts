// Progreso del arranque en frío: qué paso va, cuántos bytes han llegado, a qué
// velocidad y si la red se ha parado. Estado a nivel de módulo (como el
// `inflight` de pyodide.ts/engine.ts) leído desde React con
// `useSyncExternalStore`; así no hay que pasar callbacks por toda la cadena y el
// doble efecto de StrictMode no lo duplica.
//
// Los bytes que se cuentan son los DECODIFICADOS (el body de un Response ya
// viene descomprimido): no coinciden con los que pasan por la red, pero
// numerador y denominador están en la misma unidad, así que el % y el tiempo
// restante son coherentes.

export type BootStepId = "runtime" | "engine" | "data" | "compile";

export const BOOT_STEPS: readonly { id: BootStepId; label: string }[] = [
  { id: "runtime", label: "Runtime de Python (Pyodide)" },
  { id: "engine", label: "Motor de cálculo" },
  { id: "data", label: "Blueprints, precios de Jita e índices" },
  { id: "compile", label: "Preparar el motor" },
];

export type BootSnapshot = Readonly<{
  step: BootStepId | "idle" | "ready";
  /** performance.now() al empezar el arranque y el paso actual */
  startedAt: number;
  stepStartedAt: number;
  /** bytes recibidos en el paso actual / esperados (0 = desconocido) */
  received: number;
  expected: number;
  /** último fichero del que llegaron datos */
  file: string | null;
  /** peticiones del paso todavía abiertas, y sus ficheros (para decir qué se atasca) */
  pending: number;
  waiting: readonly string[];
  /** última vez que pasó algo (bytes, petición nueva o terminada, cambio de paso) */
  lastActivityAt: number;
  /** última vez que llegaron bytes: la velocidad solo vale si es reciente */
  lastByteAt: number;
  /** bytes/s en los últimos ~3 s */
  bps: number;
  done: readonly { id: BootStepId; ms: number }[];
  error: string | null;
}>;

/** Sin red durante este tiempo con peticiones abiertas = atascado. */
export const STALL_MS = 10_000;

export const SERVER_SNAPSHOT: BootSnapshot = Object.freeze({
  step: "idle",
  startedAt: 0,
  stepStartedAt: 0,
  received: 0,
  expected: 0,
  file: null,
  pending: 0,
  waiting: [],
  lastActivityAt: 0,
  lastByteAt: 0,
  bps: 0,
  done: [],
  error: null,
});

// --------------------------------------------------------------- almacén

const now = () => (typeof performance !== "undefined" ? performance.now() : 0);

type State = {
  -readonly [K in keyof BootSnapshot]: BootSnapshot[K];
} & { done: { id: BootStepId; ms: number }[] };

const st: State = { ...SERVER_SNAPSHOT, done: [] };
const open = new Map<number, string>(); // peticiones abiertas: id -> fichero
let nextId = 0;
let snapshot: BootSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

// ventana de velocidad: [instante, bytes] de los últimos SPEED_WINDOW ms
const SPEED_WINDOW = 3000;
const samples: [number, number][] = [];

function speed(t: number): number {
  while (samples.length && t - samples[0][0] > SPEED_WINDOW) samples.shift();
  if (!samples.length) return 0;
  const bytes = samples.reduce((a, [, n]) => a + n, 0);
  // si la ventana aún no está llena, se divide por lo que lleva el paso
  const span = Math.max(500, Math.min(SPEED_WINDOW, t - st.stepStartedAt));
  return (bytes * 1000) / span;
}

// Un chunk de 16-64 KB son cientos de eventos por fichero: se emite como mucho
// cada EMIT_MS, salvo los cambios de paso y los fallos, que van al momento.
const EMIT_MS = 200;
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  st.bps = speed(now());
  st.pending = open.size;
  snapshot = Object.freeze({ ...st, done: [...st.done], waiting: [...new Set(open.values())] });
  for (const l of listeners) l();
}

function emit(immediate = false) {
  if (immediate) {
    if (timer) clearTimeout(timer);
    flush();
  } else if (!timer) {
    timer = setTimeout(flush, EMIT_MS);
  }
}

export function subscribeBoot(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Misma referencia entre emisiones (requisito de useSyncExternalStore). */
export function getBootSnapshot(): BootSnapshot {
  return snapshot;
}

/** Cierra el paso anterior (apuntando cuánto tardó) y abre `id`. */
export function bootStep(id: BootStepId, expectedBytes = 0): void {
  const t = now();
  if (st.step === "idle") st.startedAt = t;
  else if (st.step !== "ready") st.done.push({ id: st.step, ms: t - st.stepStartedAt });
  st.step = id;
  st.stepStartedAt = t;
  st.received = 0;
  st.expected = expectedBytes;
  st.file = null;
  open.clear();
  st.lastActivityAt = t;
  samples.length = 0;
  emit(true);
}

export function bootDone(): void {
  const t = now();
  if (st.step !== "idle" && st.step !== "ready")
    st.done.push({ id: st.step, ms: t - st.stepStartedAt });
  st.step = "ready";
  open.clear();
  emit(true);
}

/**
 * La pestaña lleva un rato sin poder ejecutar JS (p. ej. compilando en Python):
 * eso es CPU, no red, y no debe contar como atasco.
 */
export function noteActivity(): void {
  st.lastActivityAt = now();
}

export function isStalled(s: BootSnapshot, t: number): boolean {
  return s.pending > 0 && s.step !== "ready" && t - s.lastActivityAt > STALL_MS;
}

// ------------------------------------------------------------ peticiones

export type RequestHandle = {
  chunk(bytes: number): void;
  end(extraBytes?: number): void;
  fail(reason: string): void;
};

// Primer fallo de un fichero imprescindible (el runtime de Pyodide). Pyodide
// se traga el error del .wasm con un console.warn y su promesa no termina
// nunca: sin esto, una descarga fallida es un spinner infinito.
let rejectFailure: ((e: Error) => void) | null = null;
const failure = new Promise<never>((_, reject) => {
  rejectFailure = reject;
});
failure.catch(() => {}); // nadie la espera hasta que se usa en un race

export function bootFailure(): Promise<never> {
  return failure;
}

export function beginRequest(name: string, fatal = false): RequestHandle {
  const id = nextId++;
  open.set(id, name);
  st.lastActivityAt = now();
  emit();
  // false si ya estaba cerrada (o si el paso cambió y open.clear() la quitó):
  // así cerrar dos veces no cuenta los bytes dos veces
  const close = () => {
    if (!open.delete(id)) return false;
    st.lastActivityAt = now();
    return true;
  };
  return {
    chunk(bytes) {
      if (!open.has(id)) return;
      const t = now();
      st.received += bytes;
      st.file = name;
      st.lastActivityAt = t;
      st.lastByteAt = t;
      samples.push([t, bytes]);
      emit();
    },
    end(extraBytes = 0) {
      if (!close()) return;
      if (extraBytes) {
        st.received += extraBytes;
        st.file = name;
      }
      emit();
    },
    fail(reason) {
      if (!close()) return;
      if (fatal) {
        st.error = reason;
        rejectFailure?.(new Error(reason));
      }
      emit(true);
    },
  };
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Cuenta los bytes de una respuesta leyendo un CLON en segundo plano y devuelve
 * el original intacto: conserva url, tipo, MIME (instantiateStreaming del wasm)
 * y la verificación de integridad de loadPackage. Reconstruirla con
 * `new Response(stream)` perdería la URL (y con ella la caché de código wasm del
 * navegador) y fallaría con respuestas opacas o sin cuerpo.
 */
async function track(
  name: string,
  run: () => Promise<Response>,
  fatal: boolean,
  expected?: number,
): Promise<Response> {
  const h = beginRequest(name, fatal);
  let res: Response;
  try {
    res = await run();
  } catch (e) {
    h.fail(`no se pudo descargar ${name}: ${errorText(e)}`);
    throw e;
  }
  if (!res.ok) {
    h.fail(`HTTP ${res.status} al descargar ${name}`);
    return res;
  }
  if (!res.body || res.type === "opaque" || res.type === "opaqueredirect") {
    h.end();
    return res;
  }
  const reader = res.clone().body!.getReader();
  void (async () => {
    let got = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.byteLength;
        h.chunk(value.byteLength);
      }
      h.end();
      if (expected && process.env.NODE_ENV !== "production" && Math.abs(got - expected) > expected * 0.1)
        console.warn(
          `[arranque] ${name}: ${got} bytes, la tabla dice ${expected}. ` +
            "¿Hay que actualizar los tamaños al cambiar de versión?",
        );
    } catch (e) {
      h.fail(`se cortó la descarga de ${name}: ${errorText(e)}`);
    }
  })();
  return res;
}

/** fetch propio con progreso (wheel, manifiesto, JSON de datos). Nunca fatal:
 *  quien llama decide (p. ej. los precios frescos caen a la copia empaquetada). */
export function trackedFetch(url: string, init: RequestInit | undefined, name: string) {
  return track(name, () => fetch(url, init), false);
}

const TAPPED = Symbol.for("eveindustry.bootTap");

/**
 * Parchea `window.fetch` mientras dura `loadPyodide`, que descarga el runtime
 * (lock, stdlib, wasm, micropip) por dentro sin ninguna opción de progreso.
 * Solo cuenta las URLs a las que `label` les da nombre; el resto pasa sin
 * tocar. Devuelve la función que lo quita.
 */
export function tapFetch(
  label: (url: string) => string | null,
  sizes: Record<string, number> = {},
): () => void {
  const orig = window.fetch;
  if ((orig as unknown as Record<symbol, boolean>)[TAPPED]) return () => {}; // ya puesto (HMR)
  let active = true;
  const tapped = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const name = active ? label(url) : null;
    if (!name) return orig.call(window, input, init);
    return track(name, () => orig.call(window, input, init), true, sizes[name]);
  }) as typeof fetch;
  (tapped as unknown as Record<symbol, boolean>)[TAPPED] = true;
  window.fetch = tapped;
  return () => {
    active = false; // por si alguien guardó la referencia: actúa como fetch normal
    if (window.fetch === tapped) window.fetch = orig;
  };
}

/**
 * Para lo que no pasa por fetch (`pyodide.asm.js` se carga con `import()`):
 * cuenta como petición abierta hasta que la Resource Timing API lo ve llegar,
 * y entonces suma su tamaño conocido. Así un atasco ahí también se detecta.
 */
export function watchResource(url: string, name: string, bytes: number): () => void {
  const h = beginRequest(name);
  if (typeof PerformanceObserver === "undefined") {
    return () => h.end(bytes);
  }
  const seen = (entries: PerformanceEntryList) =>
    entries.some((e) => e.name.split("?")[0] === url);
  const obs = new PerformanceObserver((list) => {
    if (seen(list.getEntries())) {
      h.end(bytes);
      obs.disconnect();
    }
  });
  try {
    obs.observe({ type: "resource", buffered: true });
  } catch {
    return () => h.end(bytes);
  }
  return () => {
    obs.disconnect();
    h.end(bytes); // no-op si ya se cerró
  };
}

/**
 * Espera a que el navegador pinte antes de un trozo de trabajo síncrono (si no,
 * el último cambio de paso nunca llega a verse). En pestañas en segundo plano
 * requestAnimationFrame no se dispara: el timeout evita quedarse esperando.
 */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, 150);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setTimeout(() => {
          clearTimeout(t);
          resolve();
        }, 0),
      ),
    );
  });
}
