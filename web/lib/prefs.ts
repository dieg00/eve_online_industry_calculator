// Preferencias de presentación por navegador (qué secciones quedan abiertas).
// No es estado del cálculo: eso vive entero en el query-string.

const KEY = "eveindustry.ui";

type Prefs = Record<string, boolean>;

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Prefs) : {};
  } catch {
    return {}; // modo privado, storage bloqueado, JSON corrupto...
  }
}

export function getPref(key: string, fallback: boolean): boolean {
  const v = read()[key];
  return typeof v === "boolean" ? v : fallback;
}

export function setPref(key: string, value: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [key]: value }));
  } catch {
    /* sin storage: la preferencia simplemente no persiste */
  }
}
