// Puente JS <-> motor Python. Carga los datos, arranca el intérprete y expone
// calc(query) -> ResolveResult. Una sola instancia por pestaña.

import { bootDone, bootStep, nextPaint, trackedFetch } from "./bootProgress";
import { base, getPyodide } from "./pyodide";
import type {
  DataMeta,
  OreFamily,
  OresDoc,
  ResolveResult,
  RigsDoc,
  SystemsMap,
} from "./types";

export type { ResolveResult } from "./types";

const BOOTSTRAP = `
import json, dataclasses
from eveindustry.model.dataset import dataset_from_docs
from eveindustry.state import (
    State, build_assumptions, price_override_map, resolve_security,
)
from eveindustry.engine.resolve import resolve
from eveindustry.prices.static_json import StaticJsonPriceProvider
from eveindustry.prices.overrides import OverridePriceProvider
from eveindustry.model.ores import OreCatalog

_DS = dataset_from_docs(json.loads(_BP_JSON), json.loads(_TYPES_JSON))
_PRICES_DOC = json.loads(_PRICES_JSON)
_INDICES_DOC = json.loads(_INDICES_JSON)
_RIGS_DOC = json.loads(_RIGS_JSON)
_SYSTEMS_DOC = json.loads(_SYSTEMS_JSON)
_ORES_DOC = json.loads(_ORES_JSON)

def _prices_for(st):
    base = StaticJsonPriceProvider(_PRICES_DOC)
    ov = price_override_map(st)
    return OverridePriceProvider(base, ov) if ov else base

def _state_dict(st):
    d = st.to_dict()
    d["security_effective"] = resolve_security(st, _SYSTEMS_DOC)
    return d

def calc(query):
    st = State.parse(query)
    a = build_assumptions(
        st, indices_doc=_INDICES_DOC, rigs_doc=_RIGS_DOC,
        systems_doc=_SYSTEMS_DOC, ores_doc=_ORES_DOC,
    )
    r = resolve(_DS, st.type_id, a, _prices_for(st))
    # minerales que tus ores marcados producen, ANTES de aplicar "este lo compro":
    # es lo que la lista de la compra necesita para ofrecer el toggle.
    mineable = []
    if a.mining is not None and a.mining.active:
        picked = a.ore_catalog.pick(a.mining.ore_families, a.mining.grade)
        mineable = sorted(a.ore_catalog.mineable_minerals(picked))
    groups, cats = set(), set()
    for tid in r.nodes:
        info = _DS.types.get(tid)
        if info is not None:
            groups.add(info.group_id)
            cats.add(info.category_id)
    return json.dumps({
        "result": dataclasses.asdict(r),
        "state": _state_dict(st),
        "query": st.to_query(),
        "tree_groups": sorted(groups),
        "tree_categories": sorted(cats),
        "mineable": mineable,
    }, default=str)

def normalize(query):
    st = State.parse(query)
    return json.dumps({"state": _state_dict(st), "query": st.to_query()}, default=str)

def meta():
    return json.dumps({
        "prices": _PRICES_DOC.get("meta", {}),
        "indices": _INDICES_DOC.get("meta", {}),
    })

_ASTEROID_FAMILIES = range(450, 470)   # las 16 familias clásicas del SDE

def ore_families():
    """Catálogo de familias de ore para el selector: qué minerales da cada una
    (del ore de grado base, por lote), y si es de asteroide o de luna/trig/otros."""
    cat = OreCatalog.from_doc(_ORES_DOC)
    rows = []
    for fid, name in cat.families.items():
        grades = cat.grades_by_family.get(fid) or {}
        if not grades:
            continue
        base = grades.get(1, grades[min(grades)])
        ore = cat.ores.get(base)
        minerals = sorted(ore.minerals, key=lambda mq: -mq[1]) if ore else []
        rows.append({
            "id": fid,
            "name": name,
            "asteroid": fid in _ASTEROID_FAMILIES,
            "minerals": [[m, _DS.type_name(m), q] for m, q in minerals],
        })
    rows.sort(key=lambda r: r["name"])
    return json.dumps(rows)

def buildables():
    rows = []
    for pid, bpid in _DS.blueprint_by_product.items():
        bp = _DS.blueprints.get(bpid)
        info = _DS.types.get(pid)
        if info is None:
            continue
        rows.append([pid, info.name, bp.activity_id if bp else 1, bpid])
    rows.sort(key=lambda r: r[1])
    return json.dumps(rows)
`;

// Precios/índices: si NEXT_PUBLIC_DATA_URL está definido (raw de la rama `data`),
// se leen de ahí en cada carga (se refrescan sin re-deploy). Si no, o si falla,
// se cae al copia bundleada en /data/. El resto (SDE recortado) va siempre
// bundleado porque cambia poco.
const RUNTIME_DATA =
  process.env.NEXT_PUBLIC_DATA_URL?.replace(/\/+$/, "") || "";

// Hash y tamaño de cada JSON de public/data/, calculados en build por
// next.config.ts. El hash va en la URL (`?v=`): así el navegador puede cachear
// los datos estáticos sin arriesgarse a servir el SDE de un deploy anterior.
// El tamaño alimenta la barra de progreso del arranque.
type DataEntry = { v: string; bytes: number };
const DATA_MANIFEST: Record<string, DataEntry> = (() => {
  try {
    return JSON.parse(process.env.NEXT_PUBLIC_DATA_MANIFEST ?? "{}");
  } catch {
    return {};
  }
})();

type Source = { url: string; cache: RequestCache };

/** URL de un JSON de /data/ y cómo pedirlo: versionado → caché normal del
 *  navegador; sin versión (manifiesto ausente) → revalidar siempre. */
export function bundledData(name: string): Source {
  const v = DATA_MANIFEST[name]?.v;
  return {
    url: `${base()}/data/${name}${v ? `?v=${v}` : ""}`,
    cache: v ? "default" : "no-cache",
  };
}

// Los precios del día se piden siempre frescos.
const fresh = (name: string): Source | null =>
  RUNTIME_DATA ? { url: `${RUNTIME_DATA}/${name}`, cache: "no-store" } : null;

async function grab(name: string, ...sources: (Source | null)[]): Promise<string> {
  let lastErr: unknown;
  for (const src of sources) {
    if (!src) continue;
    try {
      const r = await trackedFetch(src.url, { cache: src.cache }, name);
      if (r.ok) return r.text();
      lastErr = new Error(`${src.url}: HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("sin URLs");
}

const DATA_FILES = [
  "blueprints.json",
  "types.json",
  "prices.json",
  "indices.json",
  "rigs.json",
  "systems.json",
  "ores.json",
];

export type Buildable = [id: number, name: string, activityId: number, bpId: number];

export type CalcOut = {
  result: ResolveResult;
  state: FormState;
  query: string;
  tree_groups: number[];
  tree_categories: number[];
  /** minerales que tus ores marcados producen (antes de excluir); vacío sin minado */
  mineable: number[];
};

export type Engine = {
  calc: (query: string) => CalcOut;
  normalize: (query: string) => { state: FormState; query: string };
  buildables: () => Buildable[];
  meta: () => DataMeta;
  oreFamilies: () => OreFamily[];
  /** Los mismos JSON que recibe Python, ya parseados para la UI: así la página
   *  no los descarga una segunda vez. */
  docs: { systems: SystemsMap; rigs: RigsDoc; ores: OresDoc };
};

let cached: Engine | null = null;
let inflight: Promise<Engine> | null = null;

export function getEngine(): Promise<Engine> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = (async () => {
    const py = await getPyodide();
    // los precios frescos de la rama `data` pesan como su copia empaquetada
    const expected = DATA_FILES.reduce((a, f) => a + (DATA_MANIFEST[f]?.bytes ?? 0), 0);
    bootStep("data", expected);
    const [bp, types, prices, indices, rigs, systems, ores] = await Promise.all([
      grab("blueprints.json", bundledData("blueprints.json")),
      grab("types.json", bundledData("types.json")),
      grab("prices.json", fresh("prices.json"), bundledData("prices.json")),
      grab("indices.json", fresh("indices.json"), bundledData("indices.json")),
      grab("rigs.json", bundledData("rigs.json")),
      grab("systems.json", bundledData("systems.json")),
      grab("ores.json", bundledData("ores.json")),
    ]);
    py.globals.set("_BP_JSON", bp);
    py.globals.set("_TYPES_JSON", types);
    py.globals.set("_PRICES_JSON", prices);
    py.globals.set("_INDICES_JSON", indices);
    py.globals.set("_RIGS_JSON", rigs);
    py.globals.set("_SYSTEMS_JSON", systems);
    py.globals.set("_ORES_JSON", ores);

    // runPython es síncrono y bloquea la pestaña: sin ceder un frame antes, el
    // paso "Preparar el motor" nunca llega a pintarse.
    bootStep("compile");
    await nextPaint();
    py.runPython(BOOTSTRAP);
    const pyCalc = py.globals.get("calc");
    const pyNorm = py.globals.get("normalize");
    const pyBuildables = py.globals.get("buildables");
    const pyMeta = py.globals.get("meta");
    const pyOreFamilies = py.globals.get("ore_families");

    cached = {
      calc: (q: string) => JSON.parse(pyCalc(q)),
      normalize: (q: string) => JSON.parse(pyNorm(q)),
      buildables: () => JSON.parse(pyBuildables()),
      meta: () => JSON.parse(pyMeta()),
      oreFamilies: () => JSON.parse(pyOreFamilies()),
      docs: {
        systems: JSON.parse(systems).systems,
        rigs: JSON.parse(rigs),
        ores: JSON.parse(ores),
      },
    };
    bootDone();
    return cached;
  })();

  return inflight;
}

// Espejo mínimo del dict que devuelve State.to_dict() en Python.
export type FormState = {
  type_id: number;
  demand: number;
  default_me: number;
  me_overrides: Record<string, number>;
  system_id: number | null;
  structure_type_id: number | null;
  rig_type_ids: number[];
  security: "highsec" | "lowsec" | "nullsec" | null;   // null = derivada del sistema
  ore_families: number[];
  ore_grade: number;
  reprocess_yield: number;
  mineral_basis: string;
  mining_rate: number | null;
  exclude_minerals: number[];   // minerales que compras aunque tu ore los dé (nomine)
  security_effective: "highsec" | "lowsec" | "nullsec";
  facility_tax: number | null;
  global_policy: "auto" | "build" | "buy" | "minerals";
  policy_by_type: Record<string, string>;
  policy_by_category: Record<string, string>;
  policy_by_activity: Record<string, string>;
  invention: boolean;
  enc_level: number;
  sci1_level: number;
  sci2_level: number;
  input_price_kind: string;
  output_price_kind: string;
  broker_fee: number;
  sales_tax: number;
  price_overrides: Record<string, number>;
};
