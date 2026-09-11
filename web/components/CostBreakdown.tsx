"use client";

import { isk, pct } from "@/lib/format";
import type { ResolveResult } from "@/lib/types";
import s from "./CostBreakdown.module.css";

/** Fila con barra de proporción: una regla monocroma, no un gráfico. */
function Row({
  label,
  value,
  total,
  indent,
  bar = true,
}: {
  label: string;
  value: number | null;
  total: number;
  indent?: boolean;
  bar?: boolean;
}) {
  const share = total > 0 && value != null ? value / total : null;
  return (
    <tr>
      <td className={indent ? s.indent : undefined}>
        <span className="muted">{label}</span>
        {bar && share != null && (
          <span className={s.track} aria-hidden="true">
            <span className={s.fill} style={{ width: `${Math.min(100, share * 100)}%` }} />
          </span>
        )}
      </td>
      <td className="r num">{isk(value)}</td>
      <td className={`r num ${s.pct}`}>{share == null ? "" : pct(share, 0)}</td>
    </tr>
  );
}

export default function CostBreakdown({ r }: { r: ResolveResult }) {
  const total = r.total_cost;

  return (
    <div className="panel">
      <h2 className="panel-title">
        Desglose del coste
        <span className="faint num">{isk(total)} ISK</span>
      </h2>

      <div className="tablewrap">
        <table className="data">
        <tbody>
          <Row label="Material (comprado + raw)" value={r.total_material_cost} total={total} />
          <Row label="Instalación (acumulada)" value={r.total_install_cost} total={total} />
          {r.total_invention_cost > 0 && (
            <Row label="Invención" value={r.total_invention_cost} total={total} />
          )}

          {r.mining_plan && (
            <>
              <Row label="· de tu ore" value={r.cost_self_mined} total={total} indent />
              <Row label="· minerales comprados" value={r.cost_bought_minerals} total={total} indent />
              <Row label="· resto comprado" value={r.cost_bought_other} total={total} indent />
            </>
          )}

          <tr className="total">
            <td>Coste total</td>
            <td className="r num">{isk(total)}</td>
            <td />
          </tr>
          <tr>
            <td className="muted">Coste unitario</td>
            <td className="r num">{isk(r.unit_cost)}</td>
            <td />
          </tr>
          <tr>
            <td className="muted">Comprar el item hecho (Jita sell)</td>
            <td className="r num">{isk(r.root_buy_price)}</td>
            <td />
          </tr>
          {r.revenue != null && (
            <tr>
              <td className="muted">Ingreso neto (Jita buy − fees)</td>
              <td className="r num">{isk(r.revenue)}</td>
              <td />
            </tr>
          )}
        </tbody>
        </table>
      </div>

      {r.root_should_buy && (
        <p className={s.note}>
          A estos precios sale más barato comprar el item entero que fabricarlo.
        </p>
      )}
    </div>
  );
}
