"use client";

import { useMemo, useState } from "react";
import type { OreFamily } from "@/lib/types";
import s from "./OrePicker.module.css";

/** Abreviaturas de los minerales básicos para los chips; el resto va entero. */
const SHORT: Record<number, string> = {
  34: "Trit",
  35: "Pye",
  36: "Mex",
  37: "Iso",
  38: "Nocx",
  39: "Zyd",
  40: "Mega",
  11399: "Morph",
};

const PRESETS: [string, string][] = [
  ["highsec", "Highsec"],
  ["lowsec", "Lowsec"],
  ["nullsec", "Nullsec"],
];

/**
 * Selector de familias de ore. Antes: 36 familias en orden alfabético, las 16
 * clásicas de asteroide mezcladas con ore lunar y Triglavian, sin decir qué
 * mineral da cada una. Ahora las de asteroide van primero con sus minerales, y
 * el resto queda plegado.
 */
export default function OrePicker({
  selected,
  families,
  presets,
  onToggle,
  onSet,
}: {
  /** familyIDs marcados (string) */
  selected: string[];
  families: OreFamily[];
  presets: Record<string, number[]>;
  onToggle: (id: string) => void;
  onSet: (ids: number[]) => void;
}) {
  const [showOthers, setShowOthers] = useState(false);
  const on = useMemo(() => new Set(selected), [selected]);

  const asteroid = families.filter((f) => f.asteroid);
  const others = families.filter((f) => !f.asteroid);
  const othersOn = others.filter((f) => on.has(String(f.id))).length;

  const presetActive = (band: string) => {
    const ids = (presets[band] ?? []).map(String);
    return ids.length > 0 && ids.length === on.size && ids.every((i) => on.has(i));
  };

  // qué minerales cubre la selección actual, para el resumen de abajo
  const covered = useMemo(() => {
    const seen = new Map<number, string>();
    for (const f of families)
      if (on.has(String(f.id))) for (const [id, name] of f.minerals) seen.set(id, name);
    return [...seen.entries()].sort((a, b) => a[0] - b[0]);
  }, [families, on]);

  const row = (f: OreFamily) => (
    <label key={f.id} className={`${s.fam} ${on.has(String(f.id)) ? s.on : ""}`}>
      <input type="checkbox" checked={on.has(String(f.id))} onChange={() => onToggle(String(f.id))} />
      <span className={s.name}>{f.name}</span>
      <span className={s.mins}>
        {f.minerals.map(([id, name]) => (
          <span key={id} className={s.min} title={name}>
            {SHORT[id] ?? name}
          </span>
        ))}
      </span>
    </label>
  );

  return (
    <div className="field">
      <div className={s.presets}>
        {PRESETS.map(([band, label]) => (
          <button
            key={band}
            type="button"
            className={`btn btn-xs ${presetActive(band) ? "btn-on" : ""}`}
            title="Orientativo: desde el rework, la distribución real de ore es por región"
            onClick={() => onSet(presets[band] ?? [])}
          >
            {label}
          </button>
        ))}
        {on.size > 0 && (
          <button type="button" className="btn btn-xs" onClick={() => onSet([])}>
            ninguno
          </button>
        )}
      </div>

      <div className={s.list}>
        {families.length === 0 && <span className="faint">cargando…</span>}
        {asteroid.map(row)}
        {others.length > 0 && (
          <>
            <button
              type="button"
              className={s.more}
              aria-expanded={showOthers}
              onClick={() => setShowOthers((v) => !v)}
            >
              {showOthers ? "▾" : "▸"} Lunas, Triglavian y otros ({others.length}
              {othersOn > 0 ? `, ${othersOn} marcados` : ""})
            </button>
            {showOthers && others.map(row)}
          </>
        )}
      </div>

      {on.size > 0 && (
        <p className={s.summary}>
          Tus ores dan:{" "}
          {covered.length === 0
            ? "nada reprocesable"
            : covered.map(([, name]) => name).join(", ")}
          .
        </p>
      )}
    </div>
  );
}
