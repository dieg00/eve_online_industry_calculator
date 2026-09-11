"use client";

import { isk, iskShort, pct } from "@/lib/format";
import type { ResolveResult } from "@/lib/types";
import s from "./SummaryBar.module.css";

/**
 * Cabecera fija con las tres cifras que se miran mientras se tocan los
 * controles. Va primera en el DOM, así que en móvil los resultados salen antes
 * que el formulario sin recolocar nada con `order`.
 */
export default function SummaryBar({
  r,
  stale,
}: {
  r: ResolveResult;
  stale?: boolean;
}) {
  const marginClass = r.margin == null ? "" : r.margin >= 0 ? "good" : "bad";

  return (
    <div className={`${s.bar} ${stale ? s.stale : ""}`}>
      <div className={s.root}>
        <span className={s.rootName}>{r.root_name}</span>
        <span className="faint num">×{r.root_demand}</span>
      </div>

      <div className={s.stats}>
        <Stat label="Coste unitario" value={isk(r.unit_cost)} title={`${isk(r.unit_cost)} ISK`} />
        {/* con una sola unidad el total es el unitario: no se repite */}
        {r.root_demand > 1 && (
          <Stat label="Coste total" value={iskShort(r.total_cost)} title={`${isk(r.total_cost)} ISK`} />
        )}
        {r.margin != null ? (
          <Stat
            label={`Margen${r.margin_pct != null ? ` · ${pct(r.margin_pct)}` : ""}`}
            value={iskShort(r.margin)}
            title={`${isk(r.margin)} ISK`}
            tone={marginClass}
          />
        ) : (
          <Stat label="Margen" value="—" title="sin precio de venta en el snapshot" />
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  title,
  tone = "",
}: {
  label: string;
  value: string;
  title?: string;
  tone?: string;
}) {
  return (
    <div className={s.stat}>
      <span className={s.label}>{label}</span>
      <span className={`${s.value} num ${tone}`} title={title}>
        {value}
      </span>
    </div>
  );
}
