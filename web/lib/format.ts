// Formato de números. Único sitio donde se decide cómo se pintan ISK, m³, % y
// horas, para que toda la UI sea coherente (es-ES: punto de miles, coma decimal).

const LOCALE = "es-ES";
const MINUS = "−"; // signo menos tipográfico

function sign(n: number): string {
  return n < 0 ? MINUS : "";
}

/** Entero con separador de miles. "—" si no hay dato. */
export function num(n: number | null | undefined, digits = 0): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  return (
    sign(n) +
    abs.toLocaleString(LOCALE, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

/** ISK completo, redondeado a la unidad: "1.548.671.050". */
export function isk(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return num(Math.round(n));
}

/** ISK abreviado con ~3 cifras significativas: "1,55 B", "339 M", "12,1 k". */
export function iskShort(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  const fmt = (v: number, unit: string) => {
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return `${sign(n)}${v.toLocaleString(LOCALE, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })} ${unit}`;
  };
  if (abs >= 1e12) return fmt(abs / 1e12, "T");
  if (abs >= 1e9) return fmt(abs / 1e9, "B");
  if (abs >= 1e6) return fmt(abs / 1e6, "M");
  if (abs >= 1e3) return fmt(abs / 1e3, "k");
  return num(Math.round(n));
}

/** Porcentaje a partir de una fracción: 0.104 -> "10,4 %". */
export function pct(frac: number | null | undefined, digits = 1): string {
  if (frac == null || !isFinite(frac)) return "—";
  return `${num(frac * 100, digits)} %`;
}

export function m3(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `${num(Math.round(n))} m³`;
}

/** Horas legibles: "45 min", "3,5 h", "2.664 h (111 d)". */
export function hours(h: number | null | undefined): string {
  if (h == null || !isFinite(h) || h < 0) return "—";
  if (h < 1) return `${num(Math.round(h * 60))} min`;
  if (h < 48) return `${num(h, 1)} h`;
  return `${num(Math.round(h))} h (${num(h / 24, 0)} d)`;
}
