"use client";

import { isk, qty } from "@/lib/format";
import type { ResolveResult } from "@/lib/types";
import s from "./MiningPanel.module.css";

export default function MiningPanel({
  r,
  miningRate,
}: {
  r: ResolveResult;
  /** m³/h del setup, para estimar horas aunque no haya margen */
  miningRate: number | null;
}) {
  const mp = r.mining_plan;
  if (!mp) return null;

  const name = (id: string) => r.nodes[id]?.name ?? `#${id}`;

  // Antes las horas se derivaban de rebote (`margin / margin_per_hour`), así que
  // poner m³/h sin precio de venta del root no producía nada visible.
  const hours = miningRate && miningRate > 0 ? mp.total_m3 / miningRate : null;

  const shortfall = Object.entries(mp.shortfall);
  const surplus = Object.entries(mp.surplus).sort((a, b) => b[1] - a[1]);

  return (
    <div className="panel">
      <h2 className="panel-title">
        Plan de minado
        <span className="faint num">
          {qty(mp.total_m3)} m³ · {qty(mp.total_m3_compressed)} m³ comprimido
          {hours != null && ` · ${hours.toFixed(1)} h`}
        </span>
      </h2>

      <table className="data">
        <thead>
          <tr>
            <th>Ore</th>
            <th className="r">Unidades</th>
            <th className="r">m³</th>
            <th className="r">m³ comp.</th>
          </tr>
        </thead>
        <tbody>
          {mp.lines.map((l) => (
            <tr key={l.ore_type_id} className={s.row}>
              <td>
                {l.ore_name}
                {l.family_name && l.family_name !== l.ore_name && (
                  <span className="faint"> · {l.family_name}</span>
                )}
              </td>
              <td className="r num">{qty(l.units)}</td>
              <td className="r num">{qty(l.m3)}</td>
              <td className="r num faint">{qty(l.m3_compressed)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {shortfall.length > 0 && (
        <p className={s.short}>
          Tus ores no cubren (se compran):{" "}
          {shortfall.map(([id, q]) => `${name(id)} ${qty(q)}`).join(" · ")}
        </p>
      )}

      {surplus.length > 0 && (
        <p className={s.surplus}>
          Excedente: {surplus.slice(0, 4).map(([id, q]) => `${name(id)} ${qty(q)}`).join(" · ")}
          {surplus.length > 4 && ` · y ${surplus.length - 4} más`}
        </p>
      )}

      <table className={`data ${s.totals}`}>
        <tbody>
          {r.margin_per_hour != null && (
            <tr>
              <td className="muted">Margen por hora de minado</td>
              <td className="r num">{isk(r.margin_per_hour)} /h</td>
            </tr>
          )}
          {r.margin_per_m3 != null && (
            <tr>
              <td className="muted">Margen por m³</td>
              <td className="r num">{r.margin_per_m3.toFixed(1)} /m³</td>
            </tr>
          )}
          {r.ore_market_value ? (
            <tr className="total">
              <td>Vender ese ore en vez de construir</td>
              <td className="r num">{isk(r.ore_market_value)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {!r.ore_market_value && (
        <p className={s.note}>
          Sin precios de ore en el snapshot actual: la valoración por ore y la comparación
          «vender vs construir» aparecerán cuando el workflow de datos publique precios de
          ore comprimido.
        </p>
      )}
    </div>
  );
}
