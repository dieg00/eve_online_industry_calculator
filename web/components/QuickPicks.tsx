"use client";

import { useMemo } from "react";
import type { Buildable } from "@/lib/engine";
import type { RecentItem } from "@/lib/recentItems";
import s from "./QuickPicks.module.css";

/** Items para probar la calculadora sin saber qué escribir: uno por tipo de cosa. */
const EXAMPLES = ["Providence", "Damage Control II", "Hulk", "Rifter", "Hobgoblin II", "Fullerides"];

/**
 * Atajos bajo el buscador de item: los últimos calculados en este navegador y
 * unos ejemplos fijos. El buscador exige saber el nombre; esto no.
 */
export default function QuickPicks({
  buildables,
  recent,
  currentName,
  onPick,
}: {
  buildables: Buildable[];
  recent: RecentItem[];
  /** nombre del item actual: se omite de "recientes" (el id de la URL puede ser el del blueprint) */
  currentName: string;
  onPick: (typeId: number) => void;
}) {
  // primer buildable con ese nombre (determinista si el SDE repite nombres)
  const examples = useMemo(
    () =>
      EXAMPLES.map((n) => [buildables.find(([, name]) => name === n)?.[0], n] as const).filter(
        (x): x is readonly [number, string] => x[0] != null,
      ),
    [buildables],
  );
  const recentOthers = recent.filter((x) => x.name !== currentName);

  const chip = (id: number, name: string) => (
    <button key={id} type="button" className={s.chip} onClick={() => onPick(id)} title={`Calcular ${name}`}>
      {name}
    </button>
  );

  if (recentOthers.length === 0 && examples.length === 0) return null;

  return (
    <div className={s.wrap}>
      {recentOthers.length > 0 && (
        <p className={s.row}>
          <span className={s.k}>Recientes</span>
          {recentOthers.map((x) => chip(x.id, x.name))}
        </p>
      )}
      {examples.length > 0 && (
        <p className={s.row}>
          <span className={s.k}>Ejemplos</span>
          {examples.map(([id, name]) => chip(id, name))}
        </p>
      )}
    </div>
  );
}
