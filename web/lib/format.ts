// Formateo de cifras. Todo lo que devuelva un número para pintar pasa por aquí,
// para que ISK, m³ y porcentajes se vean igual en toda la app.

/** ISK redondeado con separadores de millar. `—` si no hay dato. */
export const isk = (n: number | null | undefined): string =>
  n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US");

/** Enteros (unidades, m³). */
export const qty = (n: number | null | undefined): string =>
  n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US");

/** Fracción 0..1 -> "12.3%". */
export const pct = (n: number | null | undefined, digits = 1): string =>
  n == null || !isFinite(n) ? "—" : `${(n * 100).toFixed(digits)}%`;

/** ISK compacto para la barra de resumen, donde el ancho manda. */
export function iskShort(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${Math.round(abs).toLocaleString("en-US")}`;
}

/** "hace 3 h" a partir de un ISO8601. Para la antigüedad de precios/índices. */
export function relTime(iso: string | undefined): { text: string; hours: number } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  const hours = (Date.now() - t) / 3.6e6;
  if (hours < 1) return { text: "hace menos de 1 h", hours };
  if (hours < 24) return { text: `hace ${Math.floor(hours)} h`, hours };
  const days = Math.floor(hours / 24);
  return { text: `hace ${days} ${days === 1 ? "día" : "días"}`, hours };
}

/** `jobs` viene como runs por trabajo: [250,250,250] -> "3 trabajos × 250 runs". */
export function jobsLabel(jobs: number[]): string {
  if (!jobs.length) return "";
  const first = jobs[0];
  if (jobs.every((j) => j === first))
    return jobs.length === 1
      ? `1 trabajo × ${qty(first)} runs`
      : `${jobs.length} trabajos × ${qty(first)} runs`;
  return `${jobs.length} trabajos (${jobs.map(qty).join(" + ")} runs)`;
}

/**
 * Los errores de Pyodide llegan con el traceback completo; la última línea es
 * la causa real y es lo único que le sirve a quien mira la pantalla.
 */
export function errorCause(x: unknown): string {
  const lines = String(x)
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? String(x);
}
