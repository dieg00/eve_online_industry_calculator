// Última versión de la app que este navegador ha "visto" (abrió el panel de
// novedades). Módulo hermano de prefs.ts en vez de generalizarlo: prefs.ts
// guarda solo booleanos bajo una clave compartida, y forzarlo a un valor
// string único rompería ese contrato limpio sin necesidad.

const KEY = "eveindustry.lastSeenVersion";

export function getLastSeenVersion(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // modo privado, storage bloqueado...
  }
}

export function setLastSeenVersion(version: string): void {
  try {
    localStorage.setItem(KEY, version);
  } catch {
    /* sin storage: no persiste, se volverá a preguntar la próxima carga */
  }
}
