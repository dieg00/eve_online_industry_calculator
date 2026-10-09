"use client";

// Paso 3: qué ore minas tú. Lo que tus ores no cubran se compra.

import { useMemo } from "react";
import type { FormState } from "@/lib/engine";
import { isAsteroidFamily, type OresDoc } from "@/lib/data";
import type { Patch } from "@/lib/hooks/useCalculator";
import { NumField } from "./NumField";

const PRESETS: [string, string][] = [
  ["highsec", "Highsec"],
  ["lowsec", "Lowsec"],
  ["nullsec", "Nullsec"],
];

export function MiningSetup({
  st,
  oresDoc,
  patch,
}: {
  st: FormState;
  oresDoc: OresDoc | null;
  patch: (p: Patch) => void;
}) {
  const selected = useMemo(() => new Set(st.ore_families.map(String)), [st.ore_families]);

  const { asteroid, other } = useMemo(() => {
    const all = oresDoc
      ? Object.entries(oresDoc.families)
          .map(([id, f]) => [id, f.n] as [string, string])
          .sort((a, b) => a[1].localeCompare(b[1]))
      : [];
    return {
      asteroid: all.filter(([id]) => isAsteroidFamily(+id)),
      other: all.filter(([id]) => !isAsteroidFamily(+id)),
    };
  }, [oresDoc]);

  function toggle(id: string) {
    const cur = new Set(selected);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    patch({ ore: [...cur].join(",") || null });
  }

  function applyPreset(band: string) {
    const ids = oresDoc?.secPresets?.[band] ?? [];
    patch({ ore: ids.join(",") || null });
  }

  const presetActive = (band: string) => {
    const ids = (oresDoc?.secPresets?.[band] ?? []).map(String);
    return ids.length > 0 && ids.length === selected.size && ids.every((i) => selected.has(i));
  };

  const active = selected.size > 0;

  const famCheck = ([id, name]: [string, string]) => (
    <label key={id} className="check">
      <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} />
      <span>{name}</span>
    </label>
  );

  return (
    <section className="panel" aria-labelledby="h-mine">
      <div className="panel-head">
        <span className="step-no">3</span>
        <h2 id="h-mine">Qué minas tú</h2>
        <span className="spacer" />
        {active && (
          <button type="button" className="btn ghost sm" onClick={() => patch({ ore: null })}>
            quitar todo
          </button>
        )}
      </div>
      <p className="help" style={{ marginTop: -8, marginBottom: 12 }}>
        Marca el ore que puedes minar. Los minerales que salgan de ahí no se compran; lo que
        tus ores no cubran, sí.
      </p>

      <div className="field">
        <div className="chips">
          {PRESETS.map(([band, label]) => (
            <button
              key={band}
              type="button"
              className={`chip ${presetActive(band) ? "on" : ""}`}
              onClick={() => applyPreset(band)}
              title="Preset orientativo: la distribución real de ore es por región"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="scroll-list">
          {!oresDoc && <span className="empty">Cargando…</span>}
          <div className="two-col">{asteroid.map(famCheck)}</div>
          {other.length > 0 && (
            <details className="adv" style={{ marginTop: 8 }}>
              <summary>Ore de lunas, Triglavian y otros ({other.length})</summary>
              <div className="body two-col">{other.map(famCheck)}</div>
            </details>
          )}
        </div>
      </div>

      {active && (
        <>
          <div className="field-row">
            <div className="field">
              <label htmlFor="ograde">Grado del ore</label>
              <select
                id="ograde"
                value={st.ore_grade}
                onChange={(e) => patch({ ograde: e.target.value === "1" ? null : e.target.value })}
              >
                <option value="0">0-Grade</option>
                <option value="1">Base</option>
                <option value="2">II-Grade (+5 %)</option>
                <option value="3">III-Grade (+10 %)</option>
                <option value="4">IV-Grade (+15 %)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ry">Rendimiento de reprocesado %</label>
              <NumField
                id="ry"
                min={1}
                max={100}
                step={0.1}
                digits={2}
                value={st.reprocess_yield * 100}
                onCommit={(v) => {
                  if (v == null) return patch({ ry: null });
                  const frac = v / 100;
                  patch({ ry: Math.abs(frac - 0.876) < 1e-9 ? null : String(frac) });
                }}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="mval">Cuánto te cuestan tus minerales</label>
            <select
              id="mval"
              value={st.mineral_basis}
              onChange={(e) => patch({ mval: e.target.value === "ore" ? null : e.target.value })}
            >
              {!["ore", "zero", "buy"].includes(st.mineral_basis) && (
                <option value={st.mineral_basis}>Precio fijo: {st.mineral_basis} ISK/ud</option>
              )}
              <option value="ore">Lo que valdría vender el ore (coste de oportunidad)</option>
              <option value="zero">Nada: mi tiempo es gratis</option>
              <option value="buy">El precio Jita buy del mineral</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="mrate">
              Tu ritmo de minado <span className="muted">(m³/h, opcional)</span>
            </label>
            <NumField
              id="mrate"
              min={0}
              step={100}
              value={st.mining_rate}
              placeholder="p. ej. 1200"
              onCommit={(v) => patch({ mrate: v == null || v <= 0 ? null : v })}
            />
            <p className="help">Sirve para estimar horas de minado y margen por hora.</p>
          </div>
        </>
      )}
    </section>
  );
}
