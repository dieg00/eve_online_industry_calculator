"use client";

import { hoursLabel, isk, qty } from "@/lib/format";
import type { ResolveResult } from "@/lib/types";
import s from "./MiningPanel.module.css";

export default function MiningPanel({
  r,
  miningRate,
  excluded,
}: {
  r: ResolveResult;
  /** m³/h del setup, para estimar horas aunque no haya margen */
  miningRate: number | null;
  /** typeIDs de minerales que podrías minar pero has decidido comprar (nomine) */
  excluded: number[];
}) {
  const mp = r.mining_plan;
  if (!mp) return null;

  const name = (id: string) => r.nodes[id]?.name ?? `#${id}`;

  // Antes las horas se derivaban de rebote (`margin / margin_per_hour`), así que
  // poner m³/h sin precio de venta del root no producía nada visible.
  const rate = miningRate && miningRate > 0 ? miningRate : null;
  const hours = rate != null ? mp.total_m3 / rate : null;

  const shortfall = Object.entries(mp.shortfall).sort((a, b) => b[1] - a[1]);
  const surplus = Object.entries(mp.surplus).sort((a, b) => b[1] - a[1]);
  const maxM3 = Math.max(...mp.lines.map((l) => l.m3), 1);

  return (
    <div className="panel">
      <h2 className="panel-title">
        Plan de minado
        <span className="faint num">
          {qty(mp.total_m3)} m³ · {qty(mp.total_m3_compressed)} m³ comprimido
          {hours != null && ` · ${hoursLabel(hours)}`}
        </span>
      </h2>

      {mp.lines.length === 0 ? (
        <p className={s.note}>Ninguno de tus ores produce los minerales que hacen falta.</p>
      ) : (
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>Ore</th>
                <th className={s.barCol} />
                <th className="r">Unidades</th>
                <th className="r">m³</th>
                <th className="r">m³ comp.</th>
                {rate != null && <th className="r">Horas</th>}
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
                  <td className={s.barCol}>
                    <span className={s.track} aria-hidden="true">
                      <span className={s.fill} style={{ width: `${(l.m3 / maxM3) * 100}%` }} />
                    </span>
                  </td>
                  <td className="r num">{qty(l.units)}</td>
                  <td className="r num">{qty(l.m3)}</td>
                  <td className="r num faint">{qty(l.m3_compressed)}</td>
                  {rate != null && <td className="r num faint">{hoursLabel(l.m3 / rate)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(shortfall.length > 0 || excluded.length > 0) && (
        <table className={`data ${s.buy}`}>
          <thead>
            <tr>
              <th>Se compra en el mercado</th>
              <th className="r">Unidades</th>
              <th>Por qué</th>
            </tr>
          </thead>
          <tbody>
            {shortfall.map(([id, q]) => (
              <tr key={id}>
                <td>{name(id)}</td>
                <td className="r num">{qty(q)}</td>
                <td className="warn">tus ores no lo dan</td>
              </tr>
            ))}
            {excluded.map((id) => (
              <tr key={`x-${id}`}>
                <td>{name(String(id))}</td>
                <td className="r num faint">{qty(r.leaves[String(id)] ?? null)}</td>
                <td className="muted">has elegido comprarlo</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {surplus.length > 0 && (
        <p className={s.surplus}>
          Te sobrará: {surplus.slice(0, 4).map(([id, q]) => `${name(id)} ${qty(q)}`).join(" · ")}
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
