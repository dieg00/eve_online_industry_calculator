"use client";

import { relTime } from "@/lib/format";
import type { DataMeta } from "@/lib/types";
import s from "./DataFreshness.module.css";

const STALE_HOURS = 48;

/**
 * Antigüedad de los datos de mercado. `meta.builtAt` ya venía en los JSON pero
 * no cruzaba el puente: no había forma de saber si el margen era de hace dos
 * horas o de hace tres semanas.
 */
export default function DataFreshness({ meta }: { meta: DataMeta | null }) {
  if (!meta) return null;

  const prices = relTime(meta.prices?.builtAt);
  const indices = relTime(meta.indices?.builtAt);
  if (!prices && !indices) return null;

  const stale = Math.max(prices?.hours ?? 0, indices?.hours ?? 0) > STALE_HOURS;

  return (
    <p className={`${s.line} ${stale ? "warn" : ""}`}>
      {prices && (
        <span>
          Precios{meta.prices?.hub ? ` ${meta.prices.hub}` : ""}: {prices.text}
        </span>
      )}
      {prices && indices && <span className={s.sep}>·</span>}
      {indices && <span>Índices de coste: {indices.text}</span>}
      {stale && <span className={s.sep}>· los datos llevan sin refrescarse más de 48 h</span>}
    </p>
  );
}
