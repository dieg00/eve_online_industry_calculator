"use client";

// Árbol de decisiones: qué se fabrica y qué se compra en cada nivel. Los nodos
// se pliegan; por defecto se ve el root y su primer nivel.

import { useMemo, useState } from "react";
import type { NodeResult, ResolveResult } from "@/lib/engine";
import { isk, num } from "@/lib/format";

const MAX_DEPTH = 10;

function meta(n: NodeResult): string {
  if (n.decision === "build") {
    const jobs = n.jobs.length;
    const runs = n.jobs.reduce((a, b) => a + b, 0);
    const parts = [
      `${jobs} ${jobs === 1 ? "trabajo" : "trabajos"} · ${num(runs)} runs`,
      `instalación ${isk(n.install_cost)}`,
    ];
    if (n.real_unit_cost != null) parts.push(`${isk(n.real_unit_cost)} / ud`);
    if (n.structure_factor < 0.9999) parts.push(`rigs ×${n.structure_factor.toFixed(3)}`);
    return parts.join(" · ");
  }
  if (n.marginal_unit_cost != null && isFinite(n.marginal_unit_cost))
    return `${isk(n.marginal_unit_cost)} / ud`;
  return "";
}

export function DecisionTree({ r }: { r: ResolveResult }) {
  const rootId = String(r.root_type_id);
  const [open, setOpen] = useState<Set<string>>(() => new Set([rootId]));

  const rows = useMemo(() => {
    const out: React.ReactNode[] = [];
    const walk = (id: string, depth: number, path: string) => {
      const n = r.nodes[id];
      if (!n) return;
      const kids = n.decision === "build" ? Object.keys(n.children) : [];
      const isOpen = id === rootId || open.has(id);
      out.push(
        <div className="node" key={path} style={{ paddingLeft: depth * 18 }}>
          <button
            type="button"
            className={`tgl ${kids.length ? "" : "leaf"}`}
            aria-label={isOpen ? "plegar" : "desplegar"}
            onClick={() =>
              setOpen((s) => {
                const next = new Set(s);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
          >
            {isOpen ? "▾" : "▸"}
          </button>
          <div className="main">
            <span className="name">{n.name}</span>
            {n.decision === "build" ? (
              <span className="tag build">Fabricar</span>
            ) : (
              <span className="tag buy">Comprar</span>
            )}
            {n.flipped_to_buy && <span className="tag flip">lote pequeño → comprar</span>}
            {n.invention_decryptor && (
              <span className="tag inv">
                {n.invention_decryptor} · {((n.invention_probability ?? 0) * 100).toFixed(0)} % · ME{" "}
                {n.effective_me}
              </span>
            )}
            <span className="meta">{meta(n)}</span>
          </div>
        </div>,
      );
      if (!isOpen || depth >= MAX_DEPTH) return;
      for (const k of kids) walk(k, depth + 1, `${path}/${k}`);
    };
    walk(rootId, 0, rootId);
    return out;
  }, [r, rootId, open]);

  const expandAll = () => setOpen(new Set(Object.keys(r.nodes)));
  const collapseAll = () => setOpen(new Set([rootId]));

  return (
    <section className="panel" aria-labelledby="h-tree">
      <div className="panel-head">
        <h2 id="h-tree">Árbol de producción</h2>
        <span className="spacer" />
        <button type="button" className="btn ghost sm" onClick={expandAll}>
          desplegar todo
        </button>
        <button type="button" className="btn ghost sm" onClick={collapseAll}>
          plegar
        </button>
      </div>
      <div className="tree">{rows}</div>
    </section>
  );
}
