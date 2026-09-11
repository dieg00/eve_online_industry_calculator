"use client";

import { useMemo, useState } from "react";
import { isk, pct, qty } from "@/lib/format";
import type { ResolveResult } from "@/lib/types";
import s from "./ShoppingList.module.css";

/**
 * `leaves` + `leaf_cost` ya venían completos en el resultado y la UI solo
 * imprimía cuántas hojas había. Esto es lo que de verdad se lleva uno al juego:
 * qué comprar, cuánto y por cuánto.
 */
export default function ShoppingList({ r }: { r: ResolveResult }) {
  const [copied, setCopied] = useState<string | null>(null);

  const rows = useMemo(() => {
    return Object.entries(r.leaves)
      .map(([id, units]) => ({
        id,
        name: r.nodes[id]?.name ?? `#${id}`,
        units,
        cost: r.leaf_cost[id] ?? 0,
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [r.leaves, r.leaf_cost, r.nodes]);

  const total = rows.reduce((acc, x) => acc + x.cost, 0);

  async function copy(kind: "multibuy" | "csv") {
    // Multibuy de EVE: un "nombre<TAB>cantidad" por línea.
    const text =
      kind === "multibuy"
        ? rows.map((x) => `${x.name}\t${Math.ceil(x.units)}`).join("\n")
        : ["item,unidades,isk", ...rows.map((x) => `"${x.name}",${Math.ceil(x.units)},${Math.round(x.cost)}`)].join("\n");
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
        <span className="faint">{rows.length} items</span>
      </h2>

      <div className={s.actions}>
        <button className="btn btn-xs" onClick={() => copy("multibuy")}>
          {copied === "multibuy" ? "copiado ✓" : "copiar multibuy"}
        </button>
        <button className="btn btn-xs" onClick={() => copy("csv")}>
          {copied === "csv" ? "copiado ✓" : "copiar CSV"}
        </button>
        {copied === "error" && <span className="bad">el navegador bloqueó el portapapeles</span>}
      </div>

      <div className={s.scroll}>
        <table className="data">
          <thead>
            <tr>
              <th>Item</th>
              <th className="r">Unidades</th>
              <th className="r">ISK</th>
              <th className="r">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id} className={s.row}>
                <td>{x.name}</td>
                <td className="r num">{qty(Math.ceil(x.units))}</td>
                <td className="r num">{isk(x.cost)}</td>
                <td className="r num faint">{total > 0 ? pct(x.cost / total, 0) : ""}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Total materiales</td>
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
