"use client";

import { useEffect, useMemo, useState } from "react";
import { bundledData, getEngine, type Buildable, type CalcOut, type Engine } from "@/lib/engine";
import { errorCause } from "@/lib/format";
import { patchQuery } from "@/lib/query";
import { readOverrides } from "@/lib/overrides";
import { getRecentItems, pushRecentItem, type RecentItem } from "@/lib/recentItems";
import type { ChangelogEntry, DataMeta, OreFamily, OresDoc, RigsDoc, SystemsMap } from "@/lib/types";
import ActiveOverrides from "@/components/ActiveOverrides";
import CostBreakdown from "@/components/CostBreakdown";
import DataFreshness from "@/components/DataFreshness";
import DecisionTree from "@/components/DecisionTree";
import MiningPanel from "@/components/MiningPanel";
import Sidebar from "@/components/Sidebar";
import ShareLink from "@/components/ShareLink";
import ShoppingList from "@/components/ShoppingList";
import SummaryBar from "@/components/SummaryBar";
import Verdict from "@/components/Verdict";
import VersionBadge from "@/components/VersionBadge";
import BootSteps from "@/components/BootSteps";
import Warnings from "@/components/Warnings";
import s from "./page.module.css";

const DEFAULT_QUERY = "t=20184&me=10&sys=30000142";

export default function Page() {
  const [engine, setEngine] = useState<Engine | null>(null);
  // Arranque y cálculo son fallos distintos: sin motor no hay nada que hacer,
  // pero un cálculo malo no puede llevarse por delante el formulario.
  const [bootError, setBootError] = useState<string | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  const [query, setQuery] = useState<string>(() => {
    if (typeof window !== "undefined" && window.location.search.length > 1)
      return window.location.search.slice(1);
    return DEFAULT_QUERY;
  });

  const [out, setOut] = useState<CalcOut | null>(null);
  const [buildables, setBuildables] = useState<Buildable[]>([]);
  const [systems, setSystems] = useState<SystemsMap>({});
  const [rigsDoc, setRigsDoc] = useState<RigsDoc | null>(null);
  const [oresDoc, setOresDoc] = useState<OresDoc | null>(null);
  const [meta, setMeta] = useState<DataMeta | null>(null);
  const [oreFamilies, setOreFamilies] = useState<OreFamily[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    let alive = true;
    getEngine()
      .then((e) => {
        if (!alive) return;
        setEngine(e);
        // los mismos documentos que ya bajó el motor, sin segunda descarga
        setSystems(e.docs.systems);
        setRigsDoc(e.docs.rigs);
        setOresDoc(e.docs.ores);
        setBuildables(e.buildables());
        setMeta(e.meta());
        setOreFamilies(e.oreFamilies());
      })
      .catch((x) => alive && setBootError(errorCause(x)));

    const changelog = bundledData("changelog.json");
    fetch(changelog.url, { cache: changelog.cache })
      .then((r) => r.json())
      .then((d: ChangelogEntry[]) => alive && setChangelog(d))
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  // localStorage se lee tras montar: el export estático no puede hidratar con él
  useEffect(() => setRecent(getRecentItems()), []);

  useEffect(() => {
    if (!engine) return;
    try {
      const res = engine.calc(query);
      setOut(res);
      setCalcError(null);
      window.history.replaceState(null, "", `?${res.query}`);
    } catch (x) {
      // Se conserva el último resultado bueno: el formulario sigue usable para
      // corregir lo que haya roto el cálculo.
      setCalcError(errorCause(x));
    }
  }, [engine, query]);

  // solo cuando cambia el item, no en cada recálculo
  const rootId = out?.result.root_type_id;
  const rootName = out?.result.root_name;
  useEffect(() => {
    if (rootId != null && rootName) setRecent(pushRecentItem({ id: rootId, name: rootName }));
  }, [rootId, rootName]);

  const patch = (p: Record<string, string | number | boolean | null>) =>
    setQuery((q) => patchQuery(q, p));

  const overrides = useMemo(() => readOverrides(out?.query ?? query), [out?.query, query]);

  const header = (
    <div className={s.header}>
      <h1>Calculadora de industria — EVE Online</h1>
      <p className={s.sub}>
        Coste real make-or-buy, con el coste de instalación acumulado en cada nivel.
      </p>
    </div>
  );

  if (bootError)
    return (
      <div className="wrap">
        {header}
        <div className="banner">No se pudo arrancar el motor: {bootError}</div>
        {/* recargar: la promesa del arranque fallido se queda guardada */}
        <button className="btn" onClick={() => location.reload()}>
          Reintentar
        </button>
      </div>
    );

  // Sin ningún resultado todavía. Si además el cálculo falló, es una URL
  // compartida con parámetros malos: no hay estado parseado con el que pintar el
  // formulario, así que al menos se ofrece una salida en vez de un spinner
  // eterno.
  if (!out && calcError)
    return (
      <div className="wrap">
        {header}
        <div className="banner">
          No se pudo calcular con los parámetros de la URL: {calcError}
        </div>
        <button className="btn" onClick={() => setQuery(DEFAULT_QUERY)}>
          empezar con el cálculo por defecto
        </button>
      </div>
    );

  // Shell durante la carga: sin motor no hay estado parseado que enseñar, pero
  // al menos la página no es un spinner a pantalla completa.
  if (!out)
    return (
      <div className="wrap">
        {header}
        <BootSteps />
        <div className={s.app}>
          <div className={s.controls}>
            <div className={s.skeleton} />
          </div>
          <div className={s.detail}>
            <div className={s.skeleton} />
          </div>
        </div>
      </div>
    );

  const r = out.result;
  const st = out.state;
  const systemName = st.system_id != null ? systems[String(st.system_id)]?.[0] ?? "" : "";

  return (
    <div className="wrap">
      {header}

      <div className={s.app}>
        <SummaryBar r={r} stale={calcError != null} />

        <div className={s.controls}>
          <Sidebar
            st={st}
            patch={patch}
            buildables={buildables}
            systems={systems}
            rigsDoc={rigsDoc}
            oresDoc={oresDoc}
            oreFamilies={oreFamilies}
            recent={recent}
            rootName={r.root_name}
            treeGroups={out.tree_groups}
            treeCategories={out.tree_categories}
          />
          <ActiveOverrides ov={overrides} r={r} onPatch={patch} />
          <ShareLink query={out.query} onReset={() => setQuery(DEFAULT_QUERY)} />
        </div>

        <div className={s.detail}>
          {calcError && (
            <div className="banner">
              El cálculo falló y se muestra el anterior: {calcError}
            </div>
          )}

          <Verdict r={r} systemName={systemName} miningRate={st.mining_rate} />
          <CostBreakdown r={r} />
          <ShoppingList r={r} st={st} mineable={out.mineable} patch={patch} />
          {r.mining_plan && (
            <MiningPanel
              r={r}
              miningRate={st.mining_rate}
              excluded={st.exclude_minerals.filter((id) => String(id) in r.leaves)}
            />
          )}
          <DecisionTree r={r} ov={overrides} onPatch={patch} />
          <Warnings warnings={r.warnings} />
          <DataFreshness meta={meta} />
          <VersionBadge entries={changelog} />
        </div>
      </div>
    </div>
  );
}
