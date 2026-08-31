// Puente JS <-> motor Python. Carga los datos, arranca el intérprete y expone
// calc(query) -> ResolveResult. Una sola instancia por pestaña.

import { base, getPyodide } from "./pyodide";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResolveResult = any;

const BOOTSTRAP = `
import json, dataclasses
from eveindustry.model.dataset import dataset_from_docs
from eveindustry.state import State, build_assumptions, price_override_map
from eveindustry.engine.resolve import resolve
from eveindustry.prices.static_json import StaticJsonPriceProvider
from eveindustry.prices.overrides import OverridePriceProvider

_DS = dataset_from_docs(json.loads(_BP_JSON), json.loads(_TYPES_JSON))
_PRICES_DOC = json.loads(_PRICES_JSON)
_INDICES_DOC = json.loads(_INDICES_JSON)
_RIGS_DOC = json.loads(_RIGS_JSON)

def _prices_for(st):
    base = StaticJsonPriceProvider(_PRICES_DOC)
    ov = price_override_map(st)
    return OverridePriceProvider(base, ov) if ov else base

def calc(query):
    st = State.parse(query)
    a = build_assumptions(st, indices_doc=_INDICES_DOC, rigs_doc=_RIGS_DOC)
    r = resolve(_DS, st.type_id, a, _prices_for(st))
    return json.dumps({
        "result": dataclasses.asdict(r),
        "state": st.to_dict(),
        "query": st.to_query(),
    }, default=str)

def normalize(query):
    st = State.parse(query)
    return json.dumps({"state": st.to_dict(), "query": st.to_query()}, default=str)

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

async function grab(...urls: string[]): Promise<string> {
  let lastErr: unknown;
  for (const u of urls) {
    if (!u) continue;
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (r.ok) return r.text();
      lastErr = new Error(`${u}: HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("sin URLs");
}

const bundled = (name: string) => `${base()}/data/${name}`;
const fresh = (name: string) => (RUNTIME_DATA ? `${RUNTIME_DATA}/${name}` : "");

export type Buildable = [id: number, name: string, activityId: number, bpId: number];

export type Engine = {
  calc: (query: string) => { result: ResolveResult; state: FormState; query: string };
  normalize: (query: string) => { state: FormState; query: string };
  buildables: () => Buildable[];
};

let cached: Engine | null = null;
let inflight: Promise<Engine> | null = null;

export function getEngine(onStatus?: (s: string) => void): Promise<Engine> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = (async () => {
    const py = await getPyodide(onStatus);
    onStatus?.("Cargando datos del SDE y precios…");
    const [bp, types, prices, indices, rigs] = await Promise.all([
      grab(bundled("blueprints.json")),
      grab(bundled("types.json")),
      grab(fresh("prices.json"), bundled("prices.json")),
      grab(fresh("indices.json"), bundled("indices.json")),
      grab(bundled("rigs.json")),
    ]);
    py.globals.set("_BP_JSON", bp);
    py.globals.set("_TYPES_JSON", types);
    py.globals.set("_PRICES_JSON", prices);
    py.globals.set("_INDICES_JSON", indices);
    py.globals.set("_RIGS_JSON", rigs);

    onStatus?.("Compilando el motor…");
    py.runPython(BOOTSTRAP);
    const pyCalc = py.globals.get("calc");
    const pyNorm = py.globals.get("normalize");
    const pyBuildables = py.globals.get("buildables");

    cached = {
      calc: (q: string) => JSON.parse(pyCalc(q)),
      normalize: (q: string) => JSON.parse(pyNorm(q)),
      buildables: () => JSON.parse(pyBuildables()),
    };
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
  security: "highsec" | "lowsec" | "nullsec";
  facility_tax: number | null;
  global_policy: "auto" | "build" | "buy";
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
