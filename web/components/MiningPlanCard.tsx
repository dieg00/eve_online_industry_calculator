"use client";

import type { ResolveResult } from "@/lib/engine";
import { hours, isk, m3, num } from "@/lib/format";

export function MiningPlanCard({ r }: { r: ResolveResult }) {
  const mp = r.mining_plan;
  if (!mp) return null;
  const name = (id: string) => r.nodes[id]?.name ?? `#${id}`;
  const h =
    r.margin_per_hour != null && r.margin != null && r.margin_per_hour !== 0
      ? r.margin / r.margin_per_hour
      : null;
  const shortfall = Object.entries(mp.shortfall);
  const surplus = Object.entries(mp.surplus).sort((a, b) => b[1] - a[1]);

  return (
    <section className="panel" aria-labelledby="h-mining">
      <div className="panel-head">
        <h2 id="h-mining">Plan de minado</h2>
        <span className="hint">
          {m3(mp.total_m3)} · {m3(mp.total_m3_compressed)} comprimido
          {h != null && ` · ${hours(h)}`}
        </span>
      </div>

      {mp.lines.length === 0 ? (
        <p className="muted small">Ninguno de tus ores produce los minerales que hacen falta.</p>
      ) : (
        <div className="ore-lines">
          {mp.lines.map((l) => (
            <div className="ore-line" key={l.ore_type_id}>
              <span className="n">
                {l.ore_name}
                <small>{num(l.units)} ud</small>
              </span>
              <div className="bar">
                <span className="seg-mined" style={{ width: `${(l.m3 / mp.total_m3) * 100}%` }} />
              </div>
              <span className="v">{m3(l.m3)}</span>
            </div>
          ))}
        </div>
      )}

      {shortfall.length > 0 && (
        <div className="notice warn">
          <span>
            Tus ores no cubren (se compran):{" "}
            {shortfall.map(([id, q]) => `${name(id)} ${num(q)}`).join(" · ")}
          </span>
        </div>
      )}
      {surplus.length > 0 && (
        <p className="muted small" style={{ marginTop: 10 }}>
          Te sobrará: {surplus.slice(0, 5).map(([id, q]) => `${name(id)} ${num(q)}`).join(" · ")}
        </p>
      )}

      <table className="breakdown" style={{ marginTop: 10 }}>
        <tbody>
          {r.margin_per_hour != null && (
            <tr>
              <td className="k">Margen por hora de minado</td>
              <td>{isk(r.margin_per_hour)} / h</td>
            </tr>
          )}
          {r.margin_per_m3 != null && (
            <tr>
              <td className="k">Margen por m³ minado</td>
              <td>{num(r.margin_per_m3, 1)} / m³</td>
            </tr>
          )}
          {r.ore_market_value ? (
            <tr className="total">
              <td className="k">Vender ese ore comprimido en vez de fabricar</td>
              <td>{isk(r.ore_market_value)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {!r.ore_market_value && (
        <p className="help">
          Sin precios de ore comprimido en este snapshot: la comparación «vender el ore» aparecerá
          cuando se publiquen.
        </p>
      )}
    </section>
  );
}
