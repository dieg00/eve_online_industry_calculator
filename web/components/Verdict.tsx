"use client";

import { hoursLabel, isk, iskShort, pct } from "@/lib/format";
import type { ResolveResult } from "@/lib/types";
import s from "./Verdict.module.css";

/**
 * El resultado en una frase y dos barras. Las cifras ya estaban en el desglose,
 * pero había que leer una tabla para saber si fabricar compensa: esto responde
 * primero y deja la tabla para el detalle.
 */
export default function Verdict({
  r,
  systemName,
  miningRate,
}: {
  r: ResolveResult;
  systemName: string;
  miningRate: number | null;
}) {
  const what = (
    <strong>
      {r.root_demand > 1 ? `${r.root_demand} × ` : ""}
      {r.root_name}
    </strong>
  );
  const where = systemName ? ` en ${systemName}` : "";
  const mining = r.mining_plan != null;
  const hours =
    mining && miningRate && miningRate > 0 ? r.mining_plan!.total_m3 / miningRate : null;

  let sentence: React.ReactNode;
  if (r.margin == null) {
    sentence = (
      <>
        Fabricar {what}
        {where} cuesta <strong className="num">{iskShort(r.total_cost)} ISK</strong>; no hay
        precio de venta en el snapshot para calcular el margen.
      </>
    );
  } else if (r.margin >= 0) {
    sentence = (
      <>
        Fabricar {what}
        {where} deja{" "}
        <strong className={`num ${s.good}`}>{iskShort(r.margin)} ISK</strong> de beneficio
        {r.margin_pct != null && (
          <>
            {" "}(<span className="num">{pct(r.margin_pct)}</span> sobre el coste)
          </>
        )}
        .
      </>
    );
  } else {
    sentence = (
      <>
        Fabricar {what}
        {where}{" "}
        <strong className={`num ${s.bad}`}>pierde {iskShort(-r.margin)} ISK</strong>
        {r.margin_pct != null && (
          <>
            {" "}(<span className="num">{pct(r.margin_pct)}</span>)
          </>
        )}
        .
      </>
    );
  }

  const tail: string[] = [];
  if (r.root_should_buy) tail.push("A estos precios sale más barato comprarlo hecho.");
  if (mining && r.mining_plan!.lines.length > 0) {
    const when = hours != null ? `, ${hoursLabel(hours)} de minado` : "";
    tail.push(
      r.cost_self_mined > 0
        ? `Tu ore cubre ${iskShort(r.cost_self_mined)} ISK del coste${when}.`
        : `Los minerales de tu ore van a coste cero${when}.`,
    );
  }

  // Barras: coste apilado por origen frente al ingreso neto, a la misma escala.
  const scale = Math.max(r.total_cost, r.revenue ?? 0, 1);
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;
  const segs: [string, number, string][] = mining
    ? [
        ["mined", r.cost_self_mined, "de tu ore"],
        ["minerals", r.cost_bought_minerals, "minerales comprados"],
        ["other", r.cost_bought_other, "resto comprado"],
      ]
    : [["minerals", r.total_material_cost, "materiales"]];
  segs.push(["install", r.total_install_cost, "instalación"]);
  if (r.total_invention_cost > 0) segs.push(["inv", r.total_invention_cost, "invención"]);

  return (
    <div className={`panel ${s.wrap}`}>
      <p className={s.sentence}>
        {sentence}
        {tail.length > 0 && <span className={s.tail}> {tail.join(" ")}</span>}
      </p>

      <div className={s.bars} aria-hidden="true">
        <div className={s.barRow}>
          <span className={s.k}>Coste</span>
          <span className={s.track}>
            {segs.map(([key, v]) => (
              <span key={key} className={`${s.seg} ${s[key]}`} style={{ width: w(v) }} />
            ))}
          </span>
          <span className={`${s.v} num`} title={`${isk(r.total_cost)} ISK`}>
            {iskShort(r.total_cost)}
          </span>
        </div>
        <div className={s.barRow}>
          <span className={s.k}>Ingreso</span>
          <span className={s.track}>
            <span className={`${s.seg} ${s.revenue}`} style={{ width: w(r.revenue ?? 0) }} />
          </span>
          <span className={`${s.v} num`} title={r.revenue != null ? `${isk(r.revenue)} ISK` : ""}>
            {iskShort(r.revenue)}
          </span>
        </div>
      </div>
      <p className={s.legend}>
        {segs.map(([key, , label]) => (
          <span key={key}>
            <i className={`${s.swatch} ${s[key]}`} />
            {label}
          </span>
        ))}
        <span>
          <i className={`${s.swatch} ${s.revenue}`} />
          ingreso neto tras comisiones
        </span>
      </p>
    </div>
  );
}
