"use client";

import { clearAllPatch, countOverrides, type Overrides } from "@/lib/overrides";
import { isk } from "@/lib/format";
import type { ResolveResult } from "@/lib/types";
import s from "./ActiveOverrides.module.css";

type Patch = Record<string, string | number | null>;

/** Los overrides viven en la URL; sin esta lista es fácil olvidarse de uno puesto. */
export default function ActiveOverrides({
  ov,
  r,
  onPatch,
}: {
  ov: Overrides;
  r: ResolveResult | null;
  onPatch: (p: Patch) => void;
}) {
  const n = countOverrides(ov);
  if (n === 0) return null;

  const name = (id: string) => r?.nodes[id]?.name ?? `#${id}`;

  // El ME se indexa por blueprint, que no suele estar en `nodes`; se busca el
  // nodo que la usa para poder nombrarla.
  const bpName = (bpId: string) => {
    const hit = Object.values(r?.nodes ?? {}).find(
      (x) => String(x.blueprint_type_id) === bpId,
    );
    return hit ? `${hit.name} (BP)` : `BP #${bpId}`;
  };

  return (
    <div className="panel">
      <h2 className="panel-title">
        Overrides activos
        <button className="btn btn-xs" onClick={() => onPatch(clearAllPatch(ov))}>
          limpiar todo
        </button>
      </h2>

      <ul className={s.list}>
        {Object.entries(ov.policy).map(([id, v]) => (
          <Item
            key={`pol${id}`}
            text={`${name(id)}: ${v === "build" ? "construir" : "comprar"}`}
            onClear={() => onPatch({ [`pol.${id}`]: null })}
          />
        ))}
        {Object.entries(ov.me).map(([id, v]) => (
          <Item
            key={`me${id}`}
            text={`${bpName(id)}: ME ${v}`}
            onClear={() => onPatch({ [`me.${id}`]: null })}
          />
        ))}
        {Object.entries(ov.price).map(([id, v]) => (
          <Item
            key={`px${id}`}
            text={`${name(id)}: ${isk(v)} ISK/ud`}
            onClear={() => onPatch({ [`px.${id}`]: null })}
          />
        ))}
      </ul>
    </div>
  );
}

function Item({ text, onClear }: { text: string; onClear: () => void }) {
  return (
    <li className={s.item}>
      <span className={s.text}>{text}</span>
      <button className={s.x} onClick={onClear} title="Quitar">
        ×
      </button>
    </li>
  );
}
