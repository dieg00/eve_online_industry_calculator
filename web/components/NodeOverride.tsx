"use client";

import type { NodeResult } from "@/lib/types";
import type { Overrides } from "@/lib/overrides";
import s from "./NodeOverride.module.css";

type Patch = Record<string, string | number | null>;

/**
 * Ajustes de un nodo. Se pinta inline, como fila desplegada dentro de la tabla:
 * un panel flotante lo recortaría el contenedor con scroll del árbol.
 */
export default function NodeOverride({
  node,
  ov,
  onPatch,
  onClose,
}: {
  node: NodeResult;
  ov: Overrides;
  onPatch: (p: Patch) => void;
  onClose: () => void;
}) {
  const t = String(node.type_id);
  const bp = node.blueprint_type_id != null ? String(node.blueprint_type_id) : null;
  const pol = ov.policy[t] ?? "auto";
  const me = bp ? ov.me[bp] : undefined;
  const px = ov.price[t];
  const any = pol !== "auto" || me != null || px != null;

  return (
    <div className={s.panel} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className={s.group}>
        <span className={s.label}>Decisión</span>
        <div className={s.seg}>
          {(["auto", "build", "buy"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`btn btn-xs ${pol === v ? "btn-on" : ""}`}
              onClick={() => onPatch({ [`pol.${t}`]: v === "auto" ? null : v })}
            >
              {v === "auto" ? "Auto" : v === "build" ? "Construir" : "Comprar"}
            </button>
          ))}
        </div>
      </div>

      {bp && (
        <div className={s.group}>
          <label className={s.label} htmlFor={`me-${t}`}>
            ME de esta blueprint
          </label>
          <input
            id={`me-${t}`}
            type="number"
            min={0}
            max={10}
            step={1}
            value={me ?? ""}
            placeholder="por defecto"
            onChange={(e) =>
              onPatch({ [`me.${bp}`]: e.target.value === "" ? null : e.target.value })
            }
          />
        </div>
      )}

      <div className={s.group}>
        <label className={s.label} htmlFor={`px-${t}`}>
          Precio manual (ISK/ud)
        </label>
        <input
          id={`px-${t}`}
          type="number"
          min={0}
          step="any"
          value={px ?? ""}
          placeholder="precio del snapshot"
          onChange={(e) => onPatch({ [`px.${t}`]: e.target.value === "" ? null : e.target.value })}
        />
      </div>

      <div className={s.group}>
        {any && (
          <button
            type="button"
            className="btn btn-xs"
            onClick={() =>
              onPatch({
                [`pol.${t}`]: null,
                [`px.${t}`]: null,
                ...(bp ? { [`me.${bp}`]: null } : {}),
              })
            }
          >
            quitar overrides
          </button>
        )}
        <button type="button" className="btn btn-xs" onClick={onClose}>
          cerrar
        </button>
      </div>
    </div>
  );
}
