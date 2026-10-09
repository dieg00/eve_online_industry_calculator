// Tipos de los JSON estáticos (SDE recortado) que consume la UI directamente,
// más constantes de dominio que no merecen una consulta al motor.

import { base } from "./pyodide";

export type SystemsDoc = {
  meta?: Record<string, unknown>;
  systems: Record<string, [name: string, security: number]>;
};

export type RigInfo = {
  n: string;
  activity: "manufacturing" | "reaction";
  meBonus: number;
  groups: number[];
  categories: number[];
};

export type RigsDoc = {
  structures: Record<string, { n: string; roleBonus?: Record<string, number> }>;
  rigs: Record<string, RigInfo>;
  secMultiplier?: Record<string, number>;
};

export type OreInfo = {
  n: string;
  fam: number;
  famName: string;
  grade: number;
  v: number;
  portion: number;
  comp: number | null;
  compV?: number | null;
  m: [mineralTypeId: number, qtyPerBatch: number][];
};

export type OresDoc = {
  ores: Record<string, OreInfo>;
  families: Record<string, { n: string; grades: Record<string, number> }>;
  secPresets: Record<string, number[]>;
};

export async function loadDoc<T>(name: string): Promise<T> {
  const r = await fetch(`${base()}/data/${name}`);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** Minerales básicos (grupo 18) + Morphite. Para chips y etiquetas sin ir al motor. */
export const MINERAL_NAMES: Record<number, string> = {
  34: "Tritanium",
  35: "Pyerite",
  36: "Mexallon",
  37: "Isogen",
  38: "Nocxium",
  39: "Zydrine",
  40: "Megacyte",
  11399: "Morphite",
};

/** Las 16 familias clásicas de asteroide del SDE son los grupos 450–469. */
export function isAsteroidFamily(familyId: number): boolean {
  return familyId >= 450 && familyId <= 469;
}

export type SecBand = "highsec" | "lowsec" | "nullsec";

/** Misma regla que eveindustry.state.security_band. */
export function secBand(sec: number): SecBand {
  if (sec >= 0.45) return "highsec";
  if (sec > 0) return "lowsec";
  return "nullsec";
}

export const SEC_LABEL: Record<SecBand, string> = {
  highsec: "Highsec",
  lowsec: "Lowsec",
  nullsec: "Null / WH",
};

export const ACTIVITY_LABEL: Record<number, string> = {
  1: "Fabricación",
  11: "Reacción",
};
