"use client";

// Ajustes que casi nunca se tocan: van colapsados para no abrumar.

import type { FormState } from "@/lib/engine";
import type { Patch } from "@/lib/hooks/useCalculator";

const LEVELS = [0, 1, 2, 3, 4, 5];

function pctField(
  id: string,
  label: string,
  value: number | null,
  def: number | null,
  placeholder: string,
  onChange: (frac: number | null) => void,
  step = 0.1,
) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={0}
        step={step}
        value={value != null ? +(value * 100).toFixed(3) : ""}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") return onChange(null);
          const frac = +v / 100;
          onChange(def != null && Math.abs(frac - def) < 1e-9 ? null : frac);
        }}
      />
    </div>
  );
}

export function AdvancedPanel({ st, patch }: { st: FormState; patch: (p: Patch) => void }) {
  return (
    <details className="adv">
      <summary>Ajustes avanzados (impuestos, precios, seguridad, skills)</summary>
      <div className="body">
        <div className="field-row">
          {pctField(
            "tax",
            "Tax de la instalación %",
            st.facility_tax,
            null,
            "0,25 (NPC)",
            (f) => patch({ tax: f == null ? null : String(f) }),
          )}
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
          {pctField("broker", "Broker fee %", st.broker_fee, 0.03, "3", (f) =>
            patch({ broker: f == null ? null : String(f) }),
          )}
          {pctField("stax", "Sales tax %", st.sales_tax, 0.045, "4,5", (f) =>
            patch({ stax: f == null ? null : String(f) }),
          )}
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
