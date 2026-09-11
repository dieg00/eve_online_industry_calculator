"use client";

import { useMemo, useState } from "react";
import type { Buildable, FormState } from "@/lib/engine";
import type { OresDoc, RigsDoc, SystemsMap } from "@/lib/types";
import Combobox, { type ComboOption } from "./Combobox";
import NumberField from "./NumberField";
import Section from "./Section";
import s from "./Sidebar.module.css";

type Patch = Record<string, string | number | boolean | null>;

type Props = {
  st: FormState;
  patch: (p: Patch) => void;
  buildables: Buildable[];
  systems: SystemsMap;
  rigsDoc: RigsDoc | null;
  oresDoc: OresDoc | null;
  rootName: string;
  treeGroups: number[];
  treeCategories: number[];
};

export default function Sidebar({
  st,
  patch,
  buildables,
  systems,
  rigsDoc,
  oresDoc,
  rootName,
  treeGroups,
  treeCategories,
}: Props) {
  const [allRigs, setAllRigs] = useState(false);

  const itemOptions = useMemo<ComboOption[]>(
    () => buildables.map(([id, name]) => ({ id: String(id), name, meta: String(id) })),
    [buildables],
  );

  const systemOptions = useMemo<ComboOption[]>(
    () =>
      Object.entries(systems).map(([id, [name, sec]]) => ({
        id,
        name,
        meta: sec.toFixed(1),
      })),
    [systems],
  );

  const systemName = st.system_id != null ? systems[String(st.system_id)]?.[0] ?? "" : "";

  const rigList = useMemo(() => {
    if (!rigsDoc) return [];
    const g = new Set(treeGroups);
    const c = new Set(treeCategories);
    return Object.entries(rigsDoc.rigs)
      .filter(
        ([, rig]) =>
          allRigs || rig.groups.some((x) => g.has(x)) || rig.categories.some((x) => c.has(x)),
      )
      .sort((a, b) => a[1].n.localeCompare(b[1].n));
  }, [rigsDoc, treeGroups, treeCategories, allRigs]);

  const oreFamilies = useMemo(() => {
    if (!oresDoc) return [] as [string, string][];
    return Object.entries(oresDoc.families)
      .map(([id, f]) => [id, f.n] as [string, string])
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [oresDoc]);

  const rigsOn = st.rig_type_ids.map(String);
  const oresOn = st.ore_families.map(String);

  const toggleIn = (list: string[], id: string, key: string) => {
    const cur = new Set(list);
    cur.has(id) ? cur.delete(id) : cur.add(id);
    patch({ [key]: [...cur].join(",") || null });
  };

  return (
    <>
      <Section id="what" title="Qué construyes" defaultOpen badge={rootName}>
        <Combobox
          label="Item"
          value={rootName}
          options={itemOptions}
          onPick={(id) => patch({ t: id })}
          placeholder="Providence, Damage Control II…"
        />

        <NumberField
          label="Unidades"
          value={st.demand}
          min={1}
          step={1}
          onCommit={(raw) => patch({ d: Math.max(1, Math.floor(+raw) || 1) })}
        />

        <div className="field">
          <label htmlFor="me">
            ME por defecto <span className={`${s.val} num`}>{st.default_me}</span>
          </label>
          <div className="row">
            <input
              id="me"
              type="range"
              min={0}
              max={10}
              step={1}
              value={st.default_me}
              onChange={(e) => patch({ me: e.target.value })}
            />
            <span className="shrink">
              <NumberField
                value={st.default_me}
                min={0}
                max={10}
                step={1}
                onCommit={(raw) => patch({ me: Math.min(10, Math.max(0, +raw || 0)) })}
              />
            </span>
          </div>
          <p className={s.hint}>0 = BPC sin investigar · 10 = BPO investigada</p>
        </div>
      </Section>

      <Section id="where" title="Dónde fabricas" badge={systemName || undefined}>
        <Combobox
          label="Sistema (índice de coste)"
          value={systemName}
          options={systemOptions}
          onPick={(id) => patch({ sys: id })}
          placeholder="Jita, Sakht…"
        />

        <div className="field">
          <label htmlFor="struct">Estructura</label>
          <select
            id="struct"
            value={st.structure_type_id ?? ""}
            onChange={(e) => patch({ struct: e.target.value || null })}
          >
            <option value="">Estación NPC (sin bonus)</option>
            {rigsDoc &&
              Object.entries(rigsDoc.structures).map(([id, x]) => (
                <option key={id} value={id}>
                  {x.n}
                </option>
              ))}
          </select>
        </div>

        <div className="field">
          <label>
            Rigs de ME{" "}
            <button className="btn btn-xs" onClick={() => setAllRigs((v) => !v)}>
              {allRigs ? "solo relevantes" : "ver todos"}
            </button>
          </label>
          <div className={s.list}>
            {rigList.length === 0 && (
              <span className="faint">
                {rigsDoc ? "ningún rig relevante para este cálculo" : "cargando…"}
              </span>
            )}
            {rigList.map(([id, rig]) => (
              <label key={id} className={`inline ${s.check}`}>
                <input
                  type="checkbox"
                  checked={rigsOn.includes(id)}
                  onChange={() => toggleIn(rigsOn, id, "rigs")}
                />
                <span>
                  {rig.n} <span className="faint num">−{(rig.meBonus * 100).toFixed(1)}%</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="sec">
            Seguridad{" "}
            <span className="faint">
              {st.security == null ? "derivada del sistema" : "manual"}
            </span>
            {st.security != null && (
              <button className="btn btn-xs" onClick={() => patch({ sec: null })}>
                usar la del sistema
              </button>
            )}
          </label>
          <select
            id="sec"
            value={st.security ?? st.security_effective}
            onChange={(e) =>
              patch({ sec: e.target.value === st.security_effective ? null : e.target.value })
            }
          >
            <option value="highsec">Highsec ×1.0</option>
            <option value="lowsec">Lowsec ×1.9</option>
            <option value="nullsec">Null / WH ×2.1</option>
          </select>
        </div>

        <NumberField
          label="Tax de instalación %"
          value={st.facility_tax != null ? +(st.facility_tax * 100).toFixed(3) : null}
          min={0}
          step={0.1}
          placeholder="0.25 (NPC)"
          onCommit={(raw) => patch({ tax: raw === "" ? null : String(+raw / 100) })}
        />
      </Section>

      <Section id="strategy" title="Estrategia" badge={st.global_policy}>
        <div className="field">
          <label htmlFor="pol">Make-or-buy global</label>
          <select
            id="pol"
            value={st.global_policy}
            onChange={(e) => patch({ pol: e.target.value === "auto" ? null : e.target.value })}
          >
            <option value="auto">Auto (decide el coste)</option>
            <option value="build">Construir todo lo posible</option>
            <option value="minerals">Vertical de minerales (comprar reacciones)</option>
            <option value="buy">Comprar todo</option>
          </select>
        </div>

        <div className="field inline">
          <input
            id="inv"
            type="checkbox"
            checked={st.invention}
            onChange={(e) => patch({ inv: e.target.checked ? 1 : null })}
          />
          <label htmlFor="inv">Capa de invención (elige decryptor por item T2)</label>
        </div>

        {st.invention && (
          <div className={s.triple}>
            <NumberField
              label="Encryption"
              value={st.enc_level}
              min={0}
              max={5}
              step={1}
              onCommit={(raw) => patch({ enc: raw === "" ? null : Math.min(5, Math.max(0, +raw)) })}
            />
            <NumberField
              label="Ciencia 1"
              value={st.sci1_level}
              min={0}
              max={5}
              step={1}
              onCommit={(raw) => patch({ sci1: raw === "" ? null : Math.min(5, Math.max(0, +raw)) })}
            />
            <NumberField
              label="Ciencia 2"
              value={st.sci2_level}
              min={0}
              max={5}
              step={1}
              onCommit={(raw) => patch({ sci2: raw === "" ? null : Math.min(5, Math.max(0, +raw)) })}
            />
          </div>
        )}
      </Section>

      <Section id="market" title="Mercado">
        <div className="row">
          <div className="field">
            <label htmlFor="pin">Precio de compra</label>
            <select
              id="pin"
              value={st.input_price_kind}
              onChange={(e) => patch({ pin: e.target.value === "sell" ? null : e.target.value })}
            >
              <option value="sell">Jita sell (compras al instante)</option>
              <option value="buy">Jita buy (pones órdenes)</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="pout">Precio de venta</label>
          <select
            id="pout"
            value={st.output_price_kind}
            onChange={(e) => patch({ pout: e.target.value === "buy" ? null : e.target.value })}
          >
            <option value="buy">Jita buy (vendes al instante)</option>
            <option value="sell">Jita sell (pones órdenes)</option>
          </select>
        </div>

        <div className="row">
          <NumberField
            label="Broker fee %"
            value={+(st.broker_fee * 100).toFixed(3)}
            min={0}
            step={0.1}
            onCommit={(raw) => patch({ broker: raw === "" ? null : String(+raw / 100) })}
          />
          <NumberField
            label="Sales tax %"
            value={+(st.sales_tax * 100).toFixed(3)}
            min={0}
            step={0.1}
            onCommit={(raw) => patch({ stax: raw === "" ? null : String(+raw / 100) })}
          />
        </div>
        <p className={s.hint}>Solo afectan al ingreso neto, no al coste de producción.</p>
      </Section>

      <Section
        id="mining"
        title="Minado propio"
        badge={oresOn.length > 0 ? `${oresOn.length} ores` : undefined}
      >
        <p className={s.hint}>
          Marca el ore que puedes minar. Lo que tus ores no cubran se compra.
        </p>

        <div className="field">
          <label>
            Ore disponible{" "}
            {["highsec", "lowsec", "nullsec"].map((b) => (
              <button
                key={b}
                className="btn btn-xs"
                onClick={() => patch({ ore: (oresDoc?.secPresets?.[b] ?? []).join(",") || null })}
              >
                {b}
              </button>
            ))}
            {oresOn.length > 0 && (
              <button className="btn btn-xs" onClick={() => patch({ ore: null })}>
                ninguno
              </button>
            )}
          </label>
          <div className={s.list}>
            {oreFamilies.length === 0 && <span className="faint">cargando…</span>}
            {oreFamilies.map(([id, name]) => (
              <label key={id} className={`inline ${s.check}`}>
                <input
                  type="checkbox"
                  checked={oresOn.includes(id)}
                  onChange={() => toggleIn(oresOn, id, "ore")}
                />
                <span>{name}</span>
              </label>
            ))}
          </div>
        </div>

        {oresOn.length > 0 && (
          <>
            <div className="field">
              <label htmlFor="ograde">Grado del ore</label>
              <select
                id="ograde"
                value={st.ore_grade}
                onChange={(e) => patch({ ograde: e.target.value === "1" ? null : e.target.value })}
              >
                <option value="0">0-Grade</option>
                <option value="1">Base</option>
                <option value="2">II-Grade (+5%)</option>
                <option value="3">III-Grade (+10%)</option>
                <option value="4">IV-Grade (+15%)</option>
              </select>
            </div>

            <NumberField
              label="Rendimiento de reprocesado %"
              value={+(st.reprocess_yield * 100).toFixed(2)}
              min={1}
              max={100}
              step={0.1}
              onCommit={(raw) => {
                const v = +raw / 100;
                patch({ ry: v === 0.876 ? null : String(v) });
              }}
            />

            <div className="field">
              <label htmlFor="mval">Cuánto valen tus minerales</label>
              <select
                id="mval"
                value={st.mineral_basis}
                onChange={(e) => patch({ mval: e.target.value === "ore" ? null : e.target.value })}
              >
                <option value="ore">Lo que valdría el ore (coste de oportunidad)</option>
                <option value="zero">Cero (mi tiempo es gratis)</option>
                <option value="buy">Jita buy del mineral</option>
              </select>
            </div>

            <NumberField
              label="m³/hora de tu setup (opcional)"
              value={st.mining_rate}
              min={0}
              step={100}
              placeholder="p. ej. 1200"
              onCommit={(raw) => patch({ mrate: raw === "" ? null : raw })}
            />
          </>
        )}
      </Section>
    </>
  );
}
