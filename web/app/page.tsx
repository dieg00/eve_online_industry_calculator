"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getEngine,
  type Buildable,
  type Engine,
  type FormState,
  type ResolveResult,
} from "@/lib/engine";
import { base } from "@/lib/pyodide";
import { patchQuery } from "@/lib/query";

const DEFAULT_QUERY = "t=20184&me=10&sys=30000142";
const isk = (n: number | null | undefined) =>
  n == null ? "—" : Math.round(n).toLocaleString("en-US");

type Out = { result: ResolveResult; state: FormState; query: string };

export default function Page() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [status, setStatus] = useState("Iniciando…");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>(() => {
    if (typeof window !== "undefined" && window.location.search.length > 1)
      return window.location.search.slice(1);
    return DEFAULT_QUERY;
  });
  const [out, setOut] = useState<Out | null>(null);
  const [buildables, setBuildables] = useState<Buildable[]>([]);
  const [systems, setSystems] = useState<Record<string, [string, number]>>({});
  const [typeInput, setTypeInput] = useState("");
  const [sysInput, setSysInput] = useState("");

  useEffect(() => {
    let alive = true;
    getEngine(setStatus)
      .then((e) => {
        if (!alive) return;
        setEngine(e);
        setBuildables(e.buildables());
        setStatus("");
      })
      .catch((x) => alive && setError(String(x)));
    fetch(`${base()}/data/systems.json`)
      .then((r) => r.json())
      .then((d) => alive && setSystems(d.systems))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!engine) return;
    try {
      const res = engine.calc(query) as Out;
      setOut(res);
      setError(null);
      window.history.replaceState(null, "", `?${res.query}`);
    } catch (x) {
      setError(String(x));
    }
  }, [engine, query]);

  const st = out?.state;
  const r = out?.result as ResolveResult | undefined;

  const patch = (p: Record<string, string | number | boolean | null>) =>
    setQuery((q) => patchQuery(q, p));

  // sincroniza los inputs de texto con el estado resuelto
  useEffect(() => {
    if (r) setTypeInput(`${r.root_name}`);
  }, [r?.root_name]);
  useEffect(() => {
    if (st?.system_id && systems[String(st.system_id)])
      setSysInput(systems[String(st.system_id)][0]);
  }, [st?.system_id, systems]);

  const typeMatches = useMemo(() => {
    const q = typeInput.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return buildables
      .filter(([, name]) => name.toLowerCase().includes(q))
      .slice(0, 60);
  }, [typeInput, buildables]);

  const sysMatches = useMemo(() => {
    const q = sysInput.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return Object.entries(systems)
      .filter(([, [name]]) => name.toLowerCase().includes(q))
      .slice(0, 40);
  }, [sysInput, systems]);

  function pickType(v: string) {
    setTypeInput(v);
    const hit = buildables.find(([, name]) => name.toLowerCase() === v.trim().toLowerCase());
    if (hit) patch({ t: hit[0] });
  }
  function pickSystem(v: string) {
    setSysInput(v);
    const hit = Object.entries(systems).find(
      ([, [name]]) => name.toLowerCase() === v.trim().toLowerCase(),
    );
    if (hit) patch({ sys: hit[0] });
  }

  if (error)
    return (
      <div className="wrap">
        <div className="error">Error: {error}</div>
      </div>
    );

  if (!engine || !r || !st)
    return (
      <div className="wrap">
        <h1>Calculadora de industria — EVE Online</h1>
        <div className="loading">
          <span className="spinner" />
          {status || "Cargando…"}
        </div>
      </div>
    );

  const marginClass = r.margin == null ? "" : r.margin >= 0 ? "good" : "bad";

  return (
    <div className="wrap">
      <h1>Calculadora de industria — EVE Online</h1>
      <p className="sub">
        Coste real make-or-buy, con el coste de instalación acumulado en cada nivel del árbol.
      </p>

      <div className="grid">
        {/* ------------ inputs ------------ */}
        <div>
          <div className="panel">
            <div className="field">
              <label>Item</label>
              <input
                type="text"
                list="types"
                value={typeInput}
                onChange={(e) => setTypeInput(e.target.value)}
                onBlur={(e) => pickType(e.target.value)}
                placeholder="Providence, Damage Control II…"
              />
              <datalist id="types">
                {typeMatches.map(([id, name]) => (
                  <option key={id} value={name} />
                ))}
              </datalist>
            </div>

            <div className="field">
              <label>
                ME por defecto <span className="me-value">{st.default_me}</span>
              </label>
              <div className="row">
                <input
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
              <label>Unidades</label>
              <input
                type="number"
                min={1}
                value={st.demand}
                onChange={(e) => patch({ d: Math.max(1, +e.target.value || 1) })}
              />
            </div>

            <div className="field">
              <label>Sistema (índice de coste)</label>
              <input
                type="text"
                list="systems"
                value={sysInput}
                onChange={(e) => setSysInput(e.target.value)}
                onBlur={(e) => pickSystem(e.target.value)}
                placeholder="Jita, Sakht…"
              />
              <datalist id="systems">
                {sysMatches.map(([id, [name, sec]]) => (
                  <option key={id} value={name}>
                    {name} ({sec.toFixed(1)})
                  </option>
                ))}
              </datalist>
            </div>

            <div className="field">
              <label>Seguridad (multiplicador de rigs)</label>
              <select
                value={st.security}
                onChange={(e) => patch({ sec: e.target.value === "highsec" ? null : e.target.value })}
              >
                <option value="highsec">Highsec ×1.0</option>
                <option value="lowsec">Lowsec ×1.9</option>
                <option value="nullsec">Null / WH ×2.1</option>
              </select>
            </div>

            <div className="field">
              <label>Make-or-buy global</label>
              <select
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
              <label htmlFor="inv" style={{ margin: 0 }}>
                Capa de invención (elige decryptor por item T2)
              </label>
            </div>
          </div>

          <div className="linkbar">
            <div>
              <code>?{out!.query}</code>
              <button
                className="copy"
                onClick={() =>
                  navigator.clipboard?.writeText(`${location.origin}${location.pathname}?${out!.query}`)
                }
              >
                copiar enlace
              </button>
            </div>
          </div>
        </div>

        {/* ------------ resultados ------------ */}
        <div>
          <div className="panel">
            <div className="kpi">
              <span className="muted">
                {r.root_name} ×{r.root_demand}
              </span>
              {r.margin != null && (
                <>
                  <span className={`big ${marginClass}`}>{isk(r.margin)}</span>
                  <span className="pct">
                    {r.margin_pct != null
                      ? `${(r.margin_pct * 100).toFixed(1)}% margen`
                      : ""}
                  </span>
                </>
              )}
            </div>

            <table className="breakdown">
              <tbody>
                <tr>
                  <td className="muted">Material (comprado + raw)</td>
                  <td>{isk(r.total_material_cost)}</td>
                </tr>
                <tr>
                  <td className="muted">Instalación (acumulada)</td>
                  <td>{isk(r.total_install_cost)}</td>
                </tr>
                {r.total_invention_cost > 0 && (
                  <tr>
                    <td className="muted">Invención</td>
                    <td>{isk(r.total_invention_cost)}</td>
                  </tr>
                )}
                <tr className="total">
                  <td>Coste total</td>
                  <td>{isk(r.total_cost)}</td>
                </tr>
                <tr>
                  <td className="muted">Coste unitario</td>
                  <td>{isk(r.unit_cost)}</td>
                </tr>
                <tr>
                  <td className="muted">Comprar el item (Jita sell)</td>
                  <td>{isk(r.root_buy_price)}</td>
                </tr>
                {r.revenue != null && (
                  <tr>
                    <td className="muted">Ingreso neto (Jita buy − fees)</td>
                    <td>{isk(r.revenue)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {r.root_should_buy && (
              <p className="warns">
                A estos precios sale más barato comprar el item entero que fabricarlo.
              </p>
            )}
            <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              {Object.values(r.nodes).filter((n: any) => n.decision === "build").length} construir ·{" "}
              {Object.values(r.nodes).filter((n: any) => n.decision === "buy").length} comprar ·{" "}
              {Object.keys(r.leaves).length} hojas · {r.flips.length} flips ·{" "}
              {r.fixpoint_iterations} iteraciones
            </p>
          </div>

          <div className="panel">
            <label style={{ marginBottom: 8 }}>Árbol de decisiones</label>
            <Tree result={r} />
            {r.warnings.length > 0 && (
              <ul className="warns">
                {r.warnings.slice(0, 15).map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tree({ result }: { result: ResolveResult }) {
  // dataclasses.asdict + json.dumps deja las claves de dicts como strings.
  const nodes: Record<string, any> = result.nodes;
  const rows: React.ReactNode[] = [];
  const seen = new Set<string>();

  const walk = (id: string, depth: number) => {
    const n = nodes[id];
    if (!n || seen.has(id)) return;
    seen.add(id);
    rows.push(
      <div className="node" key={id} style={{ paddingLeft: depth * 16 }}>
        <span className="name">{n.name}</span>
        <span className={`tag ${n.decision}`}>{n.decision}</span>
        {n.flipped_to_buy && <span className="tag flip">flip→buy</span>}
        {n.invention_decryptor && (
          <span className="tag inv">
            {n.invention_decryptor} · P{(n.invention_probability * 100).toFixed(0)}% · ME
            {n.effective_me}
          </span>
        )}
        <div className="meta">
          {n.decision === "build"
            ? `jobs ${JSON.stringify(n.jobs)} · install ${isk(n.install_cost)}${
                n.real_unit_cost != null ? ` · ud ${isk(n.real_unit_cost)}` : ""
              }`
            : n.marginal_unit_cost != null && isFinite(n.marginal_unit_cost)
            ? `ud ${isk(n.marginal_unit_cost)}`
            : ""}
        </div>
      </div>,
    );
    if (depth > 6) return;
    for (const childId of Object.keys(n.children || {})) walk(childId, depth + 1);
  };

  walk(String(result.root_type_id), 0);
  return <div className="tree">{rows}</div>;
}
