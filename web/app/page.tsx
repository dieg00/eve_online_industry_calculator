"use client";

import { useEffect, useMemo, useState } from "react";
import { getEngine, type Buildable, type CalcOut, type Engine } from "@/lib/engine";
import { errorCause } from "@/lib/format";
import { base } from "@/lib/pyodide";
import { patchQuery } from "@/lib/query";
import { readOverrides } from "@/lib/overrides";
import type { ChangelogEntry, DataMeta, OresDoc, RigsDoc, SystemsMap } from "@/lib/types";
import ActiveOverrides from "@/components/ActiveOverrides";
import CostBreakdown from "@/components/CostBreakdown";
import DataFreshness from "@/components/DataFreshness";
import DecisionTree from "@/components/DecisionTree";
import MiningPanel from "@/components/MiningPanel";
import Sidebar from "@/components/Sidebar";
import ShareLink from "@/components/ShareLink";
import ShoppingList from "@/components/ShoppingList";
import SummaryBar from "@/components/SummaryBar";
import VersionBadge from "@/components/VersionBadge";
import Warnings from "@/components/Warnings";
import s from "./page.module.css";

const DEFAULT_QUERY = "t=20184&me=10&sys=30000142";

export default function Page() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [status, setStatus] = useState("Iniciando…");
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
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    let alive = true;
    getEngine(setStatus)
      .then((e) => {
        if (!alive) return;
        setEngine(e);
        setBuildables(e.buildables());
        setMeta(e.meta());
        setStatus("");
      })
      .catch((x) => alive && setBootError(errorCause(x)));

    const grab = <T,>(name: string, set: (v: T) => void) =>
      fetch(`${base()}/data/${name}`)
        .then((r) => r.json())
        .then((d) => alive && set(d))
        .catch(() => {});

    grab<{ systems: SystemsMap }>("systems.json", (d) => setSystems(d.systems));
    grab<RigsDoc>("rigs.json", setRigsDoc);
    grab<OresDoc>("ores.json", setOresDoc);
    grab<ChangelogEntry[]>("changelog.json", setChangelog);

    return () => {
      alive = false;
    };
  }, []);

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
        <div className={s.boot}>
          <span className="spinner" />
          {status || "Cargando…"}
        </div>
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
            rootName={r.root_name}
            treeGroups={out.tree_groups}
            treeCategories={out.tree_categories}
          />
          <ActiveOverrides ov={overrides} r={r} onPatch={patch} />
          <ShareLink query={out.query} />
        </div>

        <div className={s.detail}>
          {calcError && (
            <div className="banner">
              El cálculo falló y se muestra el anterior: {calcError}
            </div>
          )}

          <CostBreakdown r={r} />
          <ShoppingList r={r} />
          {r.mining_plan && <MiningPanel r={r} miningRate={st.mining_rate} />}
          <DecisionTree r={r} ov={overrides} onPatch={patch} />
          <Warnings warnings={r.warnings} />
          <DataFreshness meta={meta} />
          <VersionBadge entries={changelog} />
        </div>
      </div>
    </div>
  );
}
