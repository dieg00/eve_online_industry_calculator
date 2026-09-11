"use client";

import { Fragment, useMemo, useState } from "react";
import { isk, jobsLabel, qty } from "@/lib/format";
import { nodeHasOverride, type Overrides } from "@/lib/overrides";
import type { NodeResult, ResolveResult } from "@/lib/types";
import NodeOverride from "./NodeOverride";
import s from "./DecisionTree.module.css";

type Patch = Record<string, string | number | null>;

type Row = {
  key: string;
  id: string;
  node: NodeResult;
  depth: number;
  /** unidades consumidas por el padre (o la demanda del root) */
  units: number | null;
  /** ya se desglosó en otra rama: aquí se muestra pero no se re-expande */
  repeat: boolean;
  hasKids: boolean;
};

export default function DecisionTree({
  r,
  ov,
  onPatch,
}: {
  r: ResolveResult;
  ov: Overrides;
  onPatch: (p: Patch) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /** clave de la fila cuyo panel de ajustes está abierto */
  const [openRow, setOpenRow] = useState<string | null>(null);

  // En cuántos sitios se consume cada componente. En un Providence, 46 de 98
  // aparecen en más de una rama; antes desaparecían en silencio bajo el resto.
  const uses = useMemo(() => {
    const count: Record<string, number> = {};
    const done = new Set<string>();
    const walk = (id: string) => {
      count[id] = (count[id] ?? 0) + 1;
      if (done.has(id)) return;
      done.add(id);
      for (const c of Object.keys(r.nodes[id]?.children ?? {})) walk(c);
    };
    walk(String(r.root_type_id));
    return count;
  }, [r.nodes, r.root_type_id]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const expanded = new Set<string>();
    const walk = (id: string, depth: number, units: number | null, path: string) => {
      const node = r.nodes[id];
      if (!node) return;
      const first = !expanded.has(id);
      if (first) expanded.add(id);
      const kids = Object.entries(node.children ?? {});
      const hasKids = first && kids.length > 0;
      out.push({ key: path, id, node, depth, units, repeat: !first, hasKids });
      if (!hasKids || collapsed.has(path)) return;
      for (const [cid, q] of kids) walk(cid, depth + 1, q, `${path}/${cid}`);
    };
    walk(String(r.root_type_id), 0, r.root_demand, String(r.root_type_id));
    return out;
  }, [r.nodes, r.root_type_id, r.root_demand, collapsed]);

  const branches = useMemo(
    () => rows.filter((x) => x.hasKids).map((x) => x.key),
    [rows],
  );

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="panel">
      <h2 className="panel-title">
        Árbol de decisiones
        <span className={s.head}>
          <span className="faint">
            {Object.values(r.nodes).filter((n) => n.decision === "build").length} construir ·{" "}
            {Object.values(r.nodes).filter((n) => n.decision === "buy").length} comprar
            {r.flips.length > 0 && ` · ${r.flips.length} flips`}
          </span>
          <button className="btn btn-xs" onClick={() => setCollapsed(new Set())}>
            expandir todo
          </button>
          <button className="btn btn-xs" onClick={() => setCollapsed(new Set(branches))}>
            plegar todo
          </button>
        </span>
      </h2>

      <div className={s.scroll}>
        <table className="data">
          <thead>
            <tr>
              <th>Componente</th>
              <th className="r">Uds</th>
              <th className="r">ISK/ud</th>
              <th className="r">Instalación</th>
              <th aria-label="ajustes" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const n = row.node;
              const build = n.decision === "build";
              const unitCost = build ? n.real_unit_cost : n.marginal_unit_cost;
              const forced = nodeHasOverride(ov, n.type_id, n.blueprint_type_id);
              const shared = (uses[row.id] ?? 1) > 1;

              const open = openRow === row.key;

              return (
                <Fragment key={row.key}>
                <tr className={`${s.row} ${forced ? s.forced : ""}`}>
                  <td>
                    <div style={{ paddingLeft: row.depth * 14 }} className={s.nameCell}>
                      {row.hasKids ? (
                        <button
                          className={s.toggle}
                          onClick={() => toggle(row.key)}
                          aria-expanded={!collapsed.has(row.key)}
                          title={collapsed.has(row.key) ? "Desplegar" : "Plegar"}
                        >
                          {collapsed.has(row.key) ? "▸" : "▾"}
                        </button>
                      ) : (
                        <span className={s.toggle} aria-hidden="true" />
                      )}

                      <span className={s.name}>{n.name}</span>
                      <span className={`tag ${n.decision}`}>{n.decision}</span>
                      {n.flipped_to_buy && <span className="tag flip">flip→buy</span>}
                      {forced && <span className={s.forcedTag}>forzado</span>}
                      {n.invention_decryptor && (
                        <span className="tag inv">
                          {n.invention_decryptor}
                          {n.invention_probability != null &&
                            ` · P${Math.round(n.invention_probability * 100)}%`}
                          {n.effective_me != null && ` · ME${n.effective_me}`}
                        </span>
                      )}
                      {row.repeat && (
                        <span className={s.repeat} title="Su desglose está en la primera rama donde aparece">
                          desglosado arriba
                        </span>
                      )}
                      {!row.repeat && shared && (
                        <span className={s.shared} title="Se consume en varias ramas del árbol">
                          usado en {uses[row.id]} sitios
                        </span>
                      )}
                      <Meta node={n} />
                    </div>
                  </td>

                  <td className="r num">{row.units == null ? "" : qty(row.units)}</td>
                  <td className="r num">
                    {unitCost != null && isFinite(unitCost) ? isk(unitCost) : ""}
                  </td>
                  <td className="r num faint">{build ? isk(n.install_cost) : ""}</td>
                  <td className={s.actions}>
                    <button
                      className={`${s.ovBtn} ${open ? s.ovBtnOn : ""}`}
                      aria-expanded={open}
                      title={`Ajustes de ${n.name}`}
                      onClick={() => setOpenRow(open ? null : row.key)}
                    >
                      ⋯
                    </button>
                  </td>
                </tr>

                {open && (
                  <tr>
                    <td colSpan={5}>
                      <NodeOverride
                        node={n}
                        ov={ov}
                        onPatch={onPatch}
                        onClose={() => setOpenRow(null)}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Meta({ node: n }: { node: NodeResult }) {
  const bits: string[] = [];
  if (n.decision === "build") {
    if (n.jobs.length) bits.push(jobsLabel(n.jobs));
    if (n.structure_factor < 0.9999) bits.push(`rig ×${n.structure_factor.toFixed(3)}`);
  }
  const src = n.policy_source;
  if (src && src !== "default" && src !== "no-blueprint") bits.push(src);
  if (!bits.length) return null;
  return <div className={s.meta}>{bits.join(" · ")}</div>;
}
