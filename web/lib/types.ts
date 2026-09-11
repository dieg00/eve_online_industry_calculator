// Espejo de los dataclasses de eveindustry/engine/resolve.py y mining.py.
//
// OJO: el resultado llega por `dataclasses.asdict` + `json.dumps`, así que las
// claves de todos los dicts indexados por typeID salen como STRING, no como
// número. Los tipos de abajo lo reflejan a propósito.

export type Decision = "build" | "buy";

export type PolicySource =
  | "type"
  | "category"
  | "activity"
  | "default"
  | "no-blueprint"
  | "minerals-build"
  | "minerals-buy";

export type NodeResult = {
  type_id: number;
  name: string;
  decision: Decision;
  policy_source: PolicySource | string;
  marginal_unit_cost: number;

  // solo si se construye
  blueprint_type_id: number | null;
  demand: number;
  jobs: number[];
  produced: number;
  install_cost: number;
  real_unit_cost: number | null;
  structure_factor: number;
  /** child typeID (string) -> unidades consumidas */
  children: Record<string, number>;
  flipped_to_buy: boolean;

  // invención
  invention_decryptor: string | null;
  invention_probability: number | null;
  invention_cost_per_unit: number | null;
  effective_me: number | null;
};

export type MiningLine = {
  ore_type_id: number;
  ore_name: string;
  family_name: string;
  batches: number;
  units: number;
  m3: number;
  m3_compressed: number;
  compressed_type_id: number | null;
  /** mineral typeID (string) -> unidades */
  minerals: Record<string, number>;
};

export type MiningPlan = {
  yield_rate: number;
  lines: MiningLine[];
  /** mineral typeID (string) -> unidades */
  targets: Record<string, number>;
  covered: Record<string, number>;
  surplus: Record<string, number>;
  shortfall: Record<string, number>;
  total_m3: number;
  total_m3_compressed: number;
};

export type ResolveResult = {
  root_type_id: number;
  root_name: string;
  root_demand: number;

  total_cost: number;
  unit_cost: number;
  total_install_cost: number;
  total_material_cost: number;
  total_invention_cost: number;

  revenue: number | null;
  margin: number | null;
  margin_pct: number | null;

  root_should_buy: boolean;
  root_buy_price: number | null;

  /** typeID (string) -> NodeResult */
  nodes: Record<string, NodeResult>;
  /** typeID (string) -> unidades a comprar */
  leaves: Record<string, number>;
  /** typeID (string) -> coste total de esa hoja */
  leaf_cost: Record<string, number>;
  flips: number[];
  warnings: string[];
  fixpoint_iterations: number;

  // minado (solo si assumptions.mining está activo)
  mining_plan: MiningPlan | null;
  cost_self_mined: number;
  cost_bought_minerals: number;
  cost_bought_other: number;
  ore_market_value: number | null;
  margin_per_hour: number | null;
  margin_per_m3: number | null;
};

/** Cabeceras `meta` de los JSON de datos, para mostrar su antigüedad. */
export type DataMeta = {
  prices: { builtAt?: string; hub?: string; source?: string; typeCount?: number };
  indices: { builtAt?: string; source?: string; systemCount?: number };
};

// --- documentos auxiliares que la UI carga por su cuenta ---

export type RigInfo = {
  n: string;
  activity: "manufacturing" | "reaction";
  meBonus: number;
  groups: number[];
  categories: number[];
};

export type RigsDoc = {
  structures: Record<string, { n: string }>;
  rigs: Record<string, RigInfo>;
};

export type OresDoc = {
  families: Record<string, { n: string; grades: Record<string, number> }>;
  secPresets: Record<string, number[]>;
};

/** systems.json: systemID -> [nombre, security] */
export type SystemsMap = Record<string, [string, number]>;

/**
 * changelog.json: derivado de CHANGELOG.md por sync-assets.mjs, más reciente
 * primero. `entries[0].version` es la versión que corre ahora mismo — nunca
 * hay una entrada "Unreleased" que rompa esa asunción.
 */
export type ChangelogEntry = {
  version: string;
  date: string;
  highlights: string[];
};
