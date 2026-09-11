// Overrides por nodo: `pol.<typeID>`, `me.<blueprintID>` y `px.<typeID>`.
//
// El motor y `State.parse` ya los soportan (eveindustry/state.py) y hay test de
// round-trip en tests/test_state.py; lo único que faltaba era UI. Se centraliza
// aquí la lectura/escritura para no esparcir las claves punteadas por los
// componentes.

export type NodePolicy = "auto" | "build" | "buy";

export type Overrides = {
  /** typeID -> política forzada */
  policy: Record<string, NodePolicy>;
  /** blueprintID -> ME */
  me: Record<string, number>;
  /** typeID -> precio en ISK */
  price: Record<string, number>;
};

const EMPTY: Overrides = { policy: {}, me: {}, price: {} };

export function readOverrides(query: string): Overrides {
  const out: Overrides = { policy: {}, me: {}, price: {} };
  for (const [k, v] of new URLSearchParams(query)) {
    const dot = k.indexOf(".");
    if (dot < 0) continue;
    const id = k.slice(dot + 1);
    if (!id) continue;
    switch (k.slice(0, dot)) {
      case "pol":
        if (v === "build" || v === "buy" || v === "auto") out.policy[id] = v;
        break;
      case "me": {
        const n = Number(v);
        if (isFinite(n)) out.me[id] = n;
        break;
      }
      case "px": {
        const n = Number(v);
        if (isFinite(n)) out.price[id] = n;
        break;
      }
    }
  }
  return out;
}

export const countOverrides = (o: Overrides = EMPTY): number =>
  Object.keys(o.policy).length + Object.keys(o.me).length + Object.keys(o.price).length;

/** ¿Este nodo tiene algún override (propio o de su blueprint)? */
export function nodeHasOverride(
  o: Overrides,
  typeId: number | string,
  blueprintId?: number | null,
): boolean {
  const t = String(typeId);
  if (o.policy[t] != null || o.price[t] != null) return true;
  return blueprintId != null && o.me[String(blueprintId)] != null;
}

/** Patch que borra todos los overrides de golpe. */
export function clearAllPatch(o: Overrides): Record<string, null> {
  const p: Record<string, null> = {};
  for (const id of Object.keys(o.policy)) p[`pol.${id}`] = null;
  for (const id of Object.keys(o.me)) p[`me.${id}`] = null;
  for (const id of Object.keys(o.price)) p[`px.${id}`] = null;
  return p;
}
