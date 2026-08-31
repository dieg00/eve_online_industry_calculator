// Manipulación del query-string de estado. El formato canónico lo define
// eveindustry/state.py (Python es la autoridad al parsear); aquí solo se editan
// parámetros sueltos.

export function patchQuery(
  query: string,
  patch: Record<string, string | number | boolean | null | undefined>,
): string {
  const p = new URLSearchParams(query);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "" || v === false) {
      p.delete(k);
    } else {
      p.set(k, String(v === true ? 1 : v));
    }
  }
  // URLSearchParams codifica la coma; state.py la acepta, pero la dejamos legible.
  return p.toString().replace(/%2C/gi, ",");
}

export function getParam(query: string, key: string): string | null {
  return new URLSearchParams(query).get(key);
}
