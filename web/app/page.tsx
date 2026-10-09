"use client";

import { DEFAULT_QUERY, useCalculator } from "@/lib/hooks/useCalculator";
import { AppShell } from "@/components/AppShell";
import { ErrorScreen, LoadingScreen } from "@/components/LoadingScreen";
import { BuildPanel, PlacePanel } from "@/components/SetupPanel";
import { MiningSetup } from "@/components/MiningSetup";
import { ResultSummary } from "@/components/ResultSummary";
import { MiningPlanCard } from "@/components/MiningPlanCard";
import { DecisionTree } from "@/components/DecisionTree";
import { MobileBar } from "@/components/MobileBar";

export default function Page() {
  const c = useCalculator();
  const { out, result: r, state: st } = c;

  if (c.bootError)
    return (
      <AppShell query={null}>
        <ErrorScreen title="No se pudo arrancar el motor" message={c.bootError} onRetry={c.retry} />
      </AppShell>
    );

  if (!out && c.calcError)
    return (
      <AppShell query={null}>
        <ErrorScreen
          title="Ese enlace no se puede calcular"
          message={c.calcError}
          onRetry={() => c.setQuery(DEFAULT_QUERY)}
          retryLabel="Empezar de cero"
        />
      </AppShell>
    );

  if (!c.engine || !out || !r || !st)
    return (
      <AppShell query={null}>
        <LoadingScreen status={c.status} />
      </AppShell>
    );

  const systemName = st.system_id != null ? c.systems[String(st.system_id)]?.[0] ?? "" : "";

  return (
    <AppShell query={out.query}>
      <div className="layout">
        <div className="col-setup">
          <BuildPanel st={st} rootName={r.root_name} buildables={c.buildables} patch={c.patch} />
          <PlacePanel
            st={st}
            out={out}
            systems={c.systems}
            systemName={systemName}
            rigsDoc={c.rigsDoc}
            patch={c.patch}
          />
          <MiningSetup st={st} oresDoc={c.oresDoc} patch={c.patch} />
        </div>

        <div className="col-result">
          {c.calcError && (
            <div className="notice bad">
              No se pudo recalcular: {c.calcError}. Se muestra el último resultado válido.
            </div>
          )}
          <ResultSummary r={r} st={st} systemName={systemName} />
          <MiningPlanCard r={r} />
          <DecisionTree r={r} />
        </div>
      </div>
      <MobileBar r={r} />
    </AppShell>
  );
}
