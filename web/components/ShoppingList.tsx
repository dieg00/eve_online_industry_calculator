"use client";

import { useMemo, useState } from "react";
import type { FormState } from "@/lib/engine";
import { isk, pct, qty } from "@/lib/format";
import type { ResolveResult } from "@/lib/types";
import s from "./ShoppingList.module.css";

type Patch = Record<string, string | number | boolean | null>;

type Row = {
  id: string;
  name: string;
  units: number;
  cost: number;
  /** "mined" | "bought" según el motor */
  mined: boolean;
  /** tus ores lo producen: se puede alternar minar/comprar */
  mineable: boolean;
};

/**
 * `leaves` + `leaf_cost` ya venían completos en el resultado y la UI solo
 * imprimía cuántas hojas había. Esto es lo que de verdad se lleva uno al juego:
 * qué comprar, cuánto y por cuánto — y, con minado activo, qué sale de tu ore
 * y qué no. Cada mineral que tus ores producen se puede pasar a "lo compro"
 * (`nomine` en la URL) y el margen se recalcula.
 */
export default function ShoppingList({
  r,
  st,
  mineable,
  patch,
}: {
  r: ResolveResult;
  st: FormState;
  mineable: number[];
  patch: (p: Patch) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const mining = r.mining_plan != null;

  const rows = useMemo<Row[]>(() => {
    const can = new Set(mineable.map(String));
    return Object.entries(r.leaves)
      .map(([id, units]) => ({
        id,
        name: r.nodes[id]?.name ?? `#${id}`,
        units,
        cost: r.leaf_cost[id] ?? 0,
        mined: r.leaf_source?.[id] === "mined",
        mineable: can.has(id),
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [r.leaves, r.leaf_cost, r.leaf_source, r.nodes, mineable]);

  const total = rows.reduce((acc, x) => acc + x.cost, 0);
  const minedRows = rows.filter((x) => x.mined);
  const boughtRows = rows.filter((x) => !x.mined);
  const minedCost = minedRows.reduce((acc, x) => acc + x.cost, 0);

  function setMine(id: string, mine: boolean) {
    const cur = new Set(st.exclude_minerals.map(String));
    if (mine) cur.delete(id);
    else cur.add(id);
    patch({ nomine: [...cur].join(",") || null });
  }

  async function copy(kind: "multibuy" | "csv") {
    // Multibuy de EVE: un "nombre<TAB>cantidad" por línea. Solo lo que se
    // compra: lo que sale de tu ore no va al mercado.
    const text =
      kind === "multibuy"
        ? boughtRows.map((x) => `${x.name}\t${Math.ceil(x.units)}`).join("\n")
        : [
            mining ? "item,unidades,isk,origen" : "item,unidades,isk",
            ...rows.map((x) =>
              [
                `"${x.name}"`,
                Math.ceil(x.units),
                Math.round(x.cost),
                ...(mining ? [x.mined ? "minado" : "comprado"] : []),
              ].join(","),
            ),
          ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied("error");
      setTimeout(() => setCopied(null), 2000);
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="panel">
      <h2 className="panel-title">
        Lista de la compra
        <span className="faint">
          {mining
            ? `${boughtRows.length} a comprar · ${minedRows.length} de tu ore`
            : `${rows.length} items`}
        </span>
      </h2>

      <div className={s.actions}>
        <button className="btn btn-xs" onClick={() => copy("multibuy")} disabled={boughtRows.length === 0}>
          {copied === "multibuy" ? "copiado ✓" : mining ? "copiar multibuy (lo que compras)" : "copiar multibuy"}
        </button>
        <button className="btn btn-xs" onClick={() => copy("csv")}>
          {copied === "csv" ? "copiado ✓" : "copiar CSV"}
        </button>
        {copied === "error" && <span className="bad">el navegador bloqueó el portapapeles</span>}
      </div>

      {mining && (
        <p className={s.hint}>
          Los minerales que tus ores producen salen como <span className={`${s.src} ${s.mined}`}>minado</span>.
          Pulsa «lo compro» en cualquiera para comprarlo en Jita en vez de minarlo; el margen se recalcula.
        </p>
      )}

      <div className={s.scroll}>
        <table className="data">
          <thead>
            <tr>
              <th>Item</th>
              {mining && <th>Origen</th>}
              <th className="r">Unidades</th>
              <th className="r">ISK</th>
              <th className="r">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id} className={s.row}>
                <td>{x.name}</td>
                {mining && (
                  <td className={s.srcCell}>
                    <span className={`${s.src} ${x.mined ? s.mined : s.bought}`}>
                      {x.mined ? "minado" : "comprado"}
                    </span>
                    {x.mineable && (
                      <button
                        className={`btn btn-xs ${s.toggle}`}
                        title={
                          x.mined
                            ? "Comprarlo en el mercado en vez de minarlo"
                            : "Sacarlo de tu ore en vez de comprarlo"
                        }
                        onClick={() => setMine(x.id, !x.mined)}
                      >
                        {x.mined ? "lo compro" : "lo mino"}
                      </button>
                    )}
                  </td>
                )}
                <td className="r num">{qty(Math.ceil(x.units))}</td>
                <td className="r num">{isk(x.cost)}</td>
                <td className="r num faint">{total > 0 ? pct(x.cost / total, 0) : ""}</td>
              </tr>
            ))}
            {mining && minedRows.length > 0 && (
              <tr className={s.sub}>
                <td className="muted">De tu ore</td>
                <td />
                <td />
                <td className="r num">{isk(minedCost)}</td>
                <td className="r num faint">{total > 0 ? pct(minedCost / total, 0) : ""}</td>
              </tr>
            )}
            {mining && (
              <tr className={s.sub}>
                <td className="muted">A comprar</td>
                <td />
                <td />
                <td className="r num">{isk(total - minedCost)}</td>
                <td className="r num faint">{total > 0 ? pct((total - minedCost) / total, 0) : ""}</td>
              </tr>
            )}
            <tr className="total">
              <td>Total materiales</td>
              {mining && <td />}
              <td />
              <td className="r num">{isk(total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
