// Últimos items calculados en este navegador, para volver a ellos en un click.
// Módulo hermano de prefs.ts / lastSeenVersion.ts: cada uno guarda un tipo de
// valor distinto bajo su propia clave, sin un store genérico que no hace falta.

const KEY = "eveindustry.recentItems";
const MAX = 6;

export type RecentItem = { id: number; name: string };

export function getRecentItems(): RecentItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter(
          (x): x is RecentItem =>
            typeof x === "object" && x !== null && typeof (x as RecentItem).id === "number" &&
            typeof (x as RecentItem).name === "string",
        )
      : [];
  } catch {
    return []; // modo privado, storage bloqueado, JSON corrupto...
  }
}

/** Mueve `item` al principio y devuelve la lista nueva (sin duplicados, tope MAX). */
export function pushRecentItem(item: RecentItem): RecentItem[] {
  const list = [item, ...getRecentItems().filter((x) => x.id !== item.id)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* sin storage: no persiste */
  }
  return list;
}
