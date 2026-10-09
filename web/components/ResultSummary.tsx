"use client";

// El resultado en una frase, tres cifras y dos barras. El detalle técnico del
// motor queda plegado al final.

import type { FormState, ResolveResult } from "@/lib/engine";
import { isk, iskShort, pct } from "@/lib/format";

function verdict(r: ResolveResult, systemName: string): React.ReactNode {
  const where = systemName ? ` en ${systemName}` : "";
  const what = (
    <strong>
      {r.root_demand > 1 ? `${r.root_demand} × ` : ""}
      {r.root_name}
    </strong>
  );
  if (r.margin == null)
    return (
      <>
        Fabricar {what}
        {where} cuesta <strong>{iskShort(r.total_cost)} ISK</strong>. No hay precio de mercado
        para calcular el margen.
      </>
    );
  const tail = r.root_should_buy ? " Sale más barato comprarlo hecho." : "";
  if (r.margin >= 0)
    return (
      <>
        Fabricar {what}
        {where} deja <strong>{iskShort(r.margin)} ISK</strong> de beneficio (
        {pct(r.margin_pct)} sobre el coste).{tail}
      </>
    );
  return (
    <>
      Fabricar {what}
      {where} <strong>pierde {iskShort(-r.margin)} ISK</strong> ({pct(r.margin_pct)}).{tail}
    </>
  );
}

export function ResultSummary({
  r,
  st,
  systemName,
}: {
  r: ResolveResult;
  st: FormState;
  systemName: string;
}) {
  const tone = r.margin == null ? "" : r.margin >= 0 ? "good" : "bad";
  const scale = Math.max(r.total_cost, r.revenue ?? 0, 1);
  const w = (v: number) => `${Math.max(0, (v / scale) * 100)}%`;
  const mining = !!r.mining_plan;
  const matBought = mining ? r.cost_bought_minerals : r.total_material_cost;
  const matOther = mining ? r.cost_bought_other : 0;
  const built = Object.values(r.nodes).filter((n) => n.decision === "build").length;
  const bought = Object.values(r.nodes).filter((n) => n.decision === "buy").length;

  return (
    <section className="panel summary" id="resultado" aria-labelledby="h-result">
      <div className="panel-head">
        <h2 id="h-result">Resultado</h2>
        <span className="hint">
          {built} se fabrican · {bought} se compran · {Object.keys(r.leaves).length} materiales
        </span>
      </div>

      <p className="verdict">{verdict(r, systemName)}</p>

      <div className="kpis">
        <div className="kpi">
          <div className="k">Margen</div>
          <div className={`v big ${tone}`}>{iskShort(r.margin)}</div>
          <div className="s">{r.margin_pct != null ? `${pct(r.margin_pct)} sobre el coste` : "sin precio de venta"}</div>
        </div>
        <div className="kpi">
          <div className="k">Coste total</div>
          <div className="v">{iskShort(r.total_cost)}</div>
          <div className="s">{isk(r.unit_cost)} / ud</div>
        </div>
        <div className="kpi">
          <div className="k">Ingreso neto</div>
          <div className="v">{iskShort(r.revenue)}</div>
          <div className="s">
            {r.root_buy_price != null ? `comprado hecho: ${iskShort(r.root_buy_price)} / ud` : "tras comisiones"}
          </div>
        </div>
      </div>

      <div className="bars" aria-hidden>
        <div className="bar-row">
          <span className="k">Coste</span>
          <div className="bar">
            {mining && <span className="seg-mined" style={{ width: w(r.cost_self_mined) }} />}
            <span className="seg-minerals" style={{ width: w(matBought) }} />
            {mining && <span className="seg-other" style={{ width: w(matOther) }} />}
            <span className="seg-install" style={{ width: w(r.total_install_cost) }} />
            {r.total_invention_cost > 0 && (
              <span className="seg-inv" style={{ width: w(r.total_invention_cost) }} />
            )}
          </div>
          <span className="v">{iskShort(r.total_cost)}</span>
        </div>
        <div className="bar-row">
          <span className="k">Ingreso</span>
          <div className="bar">
            <span className="seg-revenue" style={{ width: w(r.revenue ?? 0) }} />
          </div>
          <span className="v">{iskShort(r.revenue)}</span>
        </div>
      </div>
      <div className="legend">
        {mining && (
          <span>
            <i className="seg-mined" />de tu ore
          </span>
        )}
        <span>
          <i className="seg-minerals" />
          {mining ? "minerales comprados" : "materiales"}
        </span>
        {mining && (
          <span>
            <i className="seg-other" />resto comprado
          </span>
        )}
        <span>
          <i className="seg-install" />instalación
        </span>
        {r.total_invention_cost > 0 && (
          <span>
            <i className="seg-inv" />invención
          </span>
        )}
      </div>

      <table className="breakdown">
        <tbody>
          <tr>
            <td className="k">Materiales</td>
            <td>{isk(r.total_material_cost)}</td>
          </tr>
          {mining && (
            <>
              <tr className="sub">
                <td className="k">de tu ore</td>
                <td>{isk(r.cost_self_mined)}</td>
              </tr>
              <tr className="sub">
                <td className="k">minerales comprados</td>
                <td>{isk(r.cost_bought_minerals)}</td>
              </tr>
              <tr className="sub">
                <td className="k">resto comprado</td>
                <td>{isk(r.cost_bought_other)}</td>
              </tr>
            </>
          )}
          <tr>
            <td className="k">Instalación (todos los trabajos)</td>
            <td>{isk(r.total_install_cost)}</td>
          </tr>
          {r.total_invention_cost > 0 && (
            <tr>
              <td className="k">Invención</td>
              <td>{isk(r.total_invention_cost)}</td>
            </tr>
          )}
          <tr className="total">
            <td className="k">Coste total</td>
            <td>{isk(r.total_cost)}</td>
          </tr>
          <tr>
            <td className="k">Coste por unidad</td>
            <td>{isk(r.unit_cost)}</td>
          </tr>
          <tr className="sep">
            <td className="k">
              Ingreso neto ({st.output_price_kind === "buy" ? "Jita buy" : "Jita sell"} − comisiones)
            </td>
            <td>{isk(r.revenue)}</td>
          </tr>
          <tr>
            <td className="k">Comprar el item hecho ({st.input_price_kind === "sell" ? "Jita sell" : "Jita buy"})</td>
            <td>{isk(r.root_buy_price)}</td>
          </tr>
        </tbody>
      </table>

      {r.root_should_buy && (
        <div className="notice warn">
          A estos precios sale más barato comprar {r.root_name} hecho que fabricarlo.
        </div>
      )}

      <details className="tech">
        <summary>Detalles técnicos</summary>
        <div className="body">
          {r.flips.length} nodos pasaron a comprar al ver el coste real del lote ·{" "}
          {r.fixpoint_iterations} iteraciones del punto fijo.
          {r.warnings.length > 0 && (
            <ul>
              {r.warnings.slice(0, 20).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </section>
  );
}
