"use client";

// Pasos 1 y 2 de la configuración: qué construyes y dónde. El paso 3 (qué
// minas) vive en MiningSetup.

import { useMemo, useState } from "react";
import type { Buildable, CalcOut, FormState } from "@/lib/engine";
import { SEC_LABEL, type RigInfo, type RigsDoc, type SystemsDoc } from "@/lib/data";
import type { Patch } from "@/lib/hooks/useCalculator";
import { ItemPicker, SystemPicker } from "./Pickers";
import { AdvancedPanel } from "./AdvancedPanel";
import { NumField } from "./NumField";

export function BuildPanel({
  st,
  rootName,
  buildables,
  patch,
}: {
  st: FormState;
  rootName: string;
  buildables: Buildable[];
  patch: (p: Patch) => void;
}) {
  return (
    <section className="panel" aria-labelledby="h-build">
      <div className="panel-head">
        <span className="step-no">1</span>
        <h2 id="h-build">Qué construyes</h2>
      </div>

      <div className="field">
        <label htmlFor="item">Item</label>
        <ItemPicker
          buildables={buildables}
          selectedName={rootName}
          onPick={(id) => patch({ t: id })}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="units">Unidades</label>
          <NumField
            id="units"
            min={1}
            step={1}
            value={st.demand}
            onCommit={(v) => patch({ d: v == null ? null : Math.max(1, Math.floor(v)) })}
          />
        </div>
        <div className="field">
          <label htmlFor="me">
            ME de los blueprints <span className="val">{st.default_me}</span>
          </label>
          <input
            id="me"
            type="range"
            min={0}
            max={10}
            step={1}
            value={st.default_me}
            onChange={(e) => patch({ me: e.target.value })}
          />
        </div>
      </div>

      <div className="field">
        <label className="check" htmlFor="inv">
          <input
            id="inv"
            type="checkbox"
            checked={st.invention}
            onChange={(e) => patch({ inv: e.target.checked ? 1 : null })}
          />
          <span>
            Incluir invención (T2){" "}
            <span className="muted small">— elige el mejor decryptor por item</span>
          </span>
        </label>
      </div>
    </section>
  );
}

export function PlacePanel({
  st,
  out,
  systems,
  systemName,
  rigsDoc,
  patch,
}: {
  st: FormState;
  out: CalcOut;
  systems: SystemsDoc["systems"];
  systemName: string;
  rigsDoc: RigsDoc | null;
  patch: (p: Patch) => void;
}) {
  const [allRigs, setAllRigs] = useState(false);

  // rigs que afectan a algo del árbol actual (por defecto solo esos)
  const rigList = useMemo(() => {
    if (!rigsDoc) return [] as [string, RigInfo][];
    const g = new Set(out.tree_groups);
    const c = new Set(out.tree_categories);
    const relevant = ([, rig]: [string, RigInfo]) =>
      rig.groups.some((x) => g.has(x)) || rig.categories.some((x) => c.has(x));
    return Object.entries(rigsDoc.rigs)
      .filter((e) => allRigs || relevant(e))
      .sort((a, b) => a[1].n.localeCompare(b[1].n));
  }, [rigsDoc, out.tree_groups, out.tree_categories, allRigs]);

  function toggleRig(id: string) {
    const cur = new Set(st.rig_type_ids.map(String));
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    patch({ rigs: [...cur].join(",") || null });
  }

  const secLabel = SEC_LABEL[st.security_effective];
  const secSource = st.security == null ? (systemName ? `según ${systemName}` : "por defecto") : "manual";

  return (
    <section className="panel" aria-labelledby="h-place">
      <div className="panel-head">
        <span className="step-no">2</span>
        <h2 id="h-place">Dónde fabricas</h2>
      </div>

      <div className="field">
        <label htmlFor="system">
          Sistema <span className="muted">(índice de coste)</span>
          <span className="spacer" />
          <span className={`tag neutral`}>
            <span className={`sec-dot sec-${st.security_effective}`} />
            {secLabel} · {secSource}
          </span>
        </label>
        <SystemPicker
          systems={systems}
          selectedName={systemName}
          onPick={(id) => patch({ sys: id })}
        />
      </div>

      <div className="field">
        <label htmlFor="struct">Estructura</label>
        <select
          id="struct"
          value={st.structure_type_id ?? ""}
          onChange={(e) => patch({ struct: e.target.value || null })}
        >
          <option value="">Estación NPC (sin bonus)</option>
          {rigsDoc &&
            Object.entries(rigsDoc.structures).map(([id, s]) => (
              <option key={id} value={id}>
                {s.n}
              </option>
            ))}
        </select>
      </div>

      <div className="field">
        <div className="label">
          Rigs de eficiencia de material
          <span className="spacer" />
          <button type="button" className="btn ghost sm" onClick={() => setAllRigs((v) => !v)}>
            {allRigs ? "solo los que aplican" : "ver todos"}
          </button>
        </div>
        <div className="scroll-list">
          {rigList.length === 0 && (
            <span className="empty">
              {rigsDoc ? "Ningún rig afecta a este cálculo." : "Cargando…"}
            </span>
          )}
          {rigList.map(([id, rig]) => (
            <label key={id} className="check">
              <input
                type="checkbox"
                checked={st.rig_type_ids.map(String).includes(id)}
                onChange={() => toggleRig(id)}
              />
              <span>
                {rig.n} <span className="muted">−{(rig.meBonus * 100).toFixed(1)} %</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="pol">Qué se fabrica y qué se compra</label>
        <select
          id="pol"
          value={st.global_policy}
          onChange={(e) => patch({ pol: e.target.value === "auto" ? null : e.target.value })}
        >
          <option value="auto">Automático: lo que salga más barato</option>
          <option value="build">Construir todo lo que se pueda</option>
          <option value="minerals">Solo fabricación: comprar reacciones y minerales</option>
          <option value="buy">Comprar todos los componentes</option>
        </select>
      </div>

      <AdvancedPanel st={st} patch={patch} />
    </section>
  );
}
