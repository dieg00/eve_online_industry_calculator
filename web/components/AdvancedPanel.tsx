"use client";

// Ajustes que casi nunca se tocan: van colapsados para no abrumar.

import type { FormState } from "@/lib/engine";
import type { Patch } from "@/lib/hooks/useCalculator";
import { PctField } from "./NumField";

const LEVELS = [0, 1, 2, 3, 4, 5];

export function AdvancedPanel({ st, patch }: { st: FormState; patch: (p: Patch) => void }) {
  return (
    <details className="adv">
      <summary>Ajustes avanzados (impuestos, precios, seguridad, skills)</summary>
      <div className="body">
        <div className="field-row">
          <div className="field">
            <label htmlFor="tax">Tax de la instalación %</label>
            <PctField
              id="tax"
              value={st.facility_tax}
              def={null}
              placeholder="0,25 (NPC)"
              onCommit={(f) => patch({ tax: f == null ? null : String(f) })}
            />
          </div>
          <div className="field">
            <label htmlFor="sec">
              Seguridad para los rigs
              {st.security != null && (
                <>
                  <span className="spacer" />
                  <button type="button" className="btn ghost sm" onClick={() => patch({ sec: null })}>
                    usar la del sistema
                  </button>
                </>
              )}
            </label>
            <select
              id="sec"
              value={st.security ?? st.security_effective}
              onChange={(e) => {
                const v = e.target.value;
                patch({ sec: v === st.security_effective ? null : v });
              }}
            >
              <option value="highsec">Highsec ×1,0</option>
              <option value="lowsec">Lowsec ×1,9</option>
              <option value="nullsec">Null / WH ×2,1</option>
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="pin">Compras a precio</label>
            <select
              id="pin"
              value={st.input_price_kind}
              onChange={(e) => patch({ pin: e.target.value === "sell" ? null : e.target.value })}
            >
              <option value="sell">Jita sell (inmediato)</option>
              <option value="buy">Jita buy (con orden)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="pout">Vendes a precio</label>
            <select
              id="pout"
              value={st.output_price_kind}
              onChange={(e) => patch({ pout: e.target.value === "buy" ? null : e.target.value })}
            >
              <option value="buy">Jita buy (inmediato)</option>
              <option value="sell">Jita sell (con orden)</option>
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="broker">Broker fee %</label>
            <PctField
              id="broker"
              value={st.broker_fee}
              def={0.03}
              onCommit={(f) => patch({ broker: f == null ? null : String(f) })}
            />
          </div>
          <div className="field">
            <label htmlFor="stax">Sales tax %</label>
            <PctField
              id="stax"
              value={st.sales_tax}
              def={0.045}
              onCommit={(f) => patch({ stax: f == null ? null : String(f) })}
            />
          </div>
        </div>

        {st.invention && (
          <div className="field">
            <label>Skills de invención (encryption · ciencia 1 · ciencia 2)</label>
            <div className="field-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              {(
                [
                  ["enc", st.enc_level],
                  ["sci1", st.sci1_level],
                  ["sci2", st.sci2_level],
                ] as const
              ).map(([key, val]) => (
                <select
                  key={key}
                  aria-label={key}
                  value={val}
                  onChange={(e) => patch({ [key]: e.target.value === "5" ? null : e.target.value })}
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {key} {l}
                    </option>
                  ))}
                </select>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
