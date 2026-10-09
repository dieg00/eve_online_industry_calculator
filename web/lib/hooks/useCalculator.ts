"use client";

// Estado de la calculadora: arranque del motor, carga de los JSON de apoyo,
// query-string canónico y resultado. El formato del query lo define
// eveindustry/state.py; aquí solo se parchean parámetros sueltos.

import { useCallback, useEffect, useState } from "react";
import {
  getEngine,
  type Buildable,
  type CalcOut,
  type Engine,
  type FormState,
  type ResolveResult,
} from "@/lib/engine";
import { loadDoc, type OresDoc, type RigsDoc, type SystemsDoc } from "@/lib/data";
import { patchQuery } from "@/lib/query";

export const DEFAULT_QUERY = "t=20184&me=10&sys=30000142";

export type Patch = Record<string, string | number | boolean | null | undefined>;

export type Calculator = {
  engine: Engine | null;
  status: string;
  bootError: string | null;
  calcError: string | null;
  query: string;
  patch: (p: Patch) => void;
  setQuery: (q: string) => void;
  out: CalcOut | null;
  result: ResolveResult | null;
  state: FormState | null;
  buildables: Buildable[];
  systems: SystemsDoc["systems"];
  rigsDoc: RigsDoc | null;
  oresDoc: OresDoc | null;
  retry: () => void;
};

function initialQuery(): string {
  if (typeof window !== "undefined" && window.location.search.length > 1)
    return window.location.search.slice(1);
  return DEFAULT_QUERY;
}

export function useCalculator(): Calculator {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [status, setStatus] = useState("Iniciando…");
  const [bootError, setBootError] = useState<string | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>(initialQuery);
  const [out, setOut] = useState<CalcOut | null>(null);
  const [buildables, setBuildables] = useState<Buildable[]>([]);
  const [systems, setSystems] = useState<SystemsDoc["systems"]>({});
  const [rigsDoc, setRigsDoc] = useState<RigsDoc | null>(null);
  const [oresDoc, setOresDoc] = useState<OresDoc | null>(null);
  const [attempt, setAttempt] = useState(0);

  // arranque: motor + JSON de apoyo (en paralelo)
  useEffect(() => {
    let alive = true;
    setBootError(null);
    getEngine(setStatus)
      .then((e) => {
        if (!alive) return;
        setEngine(e);
        setBuildables(e.buildables());
        setStatus("");
      })
      .catch((x) => alive && setBootError(String(x)));
    loadDoc<SystemsDoc>("systems.json")
      .then((d) => alive && setSystems(d.systems))
      .catch(() => {});
    loadDoc<RigsDoc>("rigs.json")
      .then((d) => alive && setRigsDoc(d))
      .catch(() => {});
    loadDoc<OresDoc>("ores.json")
      .then((d) => alive && setOresDoc(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [attempt]);

  // cada cambio del query recalcula y deja la URL canónica
  useEffect(() => {
    if (!engine) return;
    try {
      const res = engine.calc(query);
      setOut(res);
      setCalcError(null);
      window.history.replaceState(null, "", `?${res.query}`);
    } catch (x) {
      setCalcError(String(x));
    }
  }, [engine, query]);

  // navegación atrás/adelante del navegador
  useEffect(() => {
    const onPop = () => setQuery(initialQuery());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const patch = useCallback((p: Patch) => setQuery((q) => patchQuery(q, p)), []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    engine,
    status,
    bootError,
    calcError,
    query,
    patch,
    setQuery,
    out,
    result: out?.result ?? null,
    state: out?.state ?? null,
    buildables,
    systems,
    rigsDoc,
    oresDoc,
    retry,
  };
}
