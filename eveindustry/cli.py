"""CLI del motor: ``eveindustry calc | link | expand``.

    eveindustry calc 20184 --me 10 --system 30000142
    eveindustry calc --state "t=20184&me=10&sys=30000142" --json
    eveindustry link 20184 --me 10 --system 30000142
    eveindustry expand 20184 --me 10            # modo expansión forzada (BOM)

Datos por defecto en ``data/`` (blueprints.json, types.json, rigs.json,
prices.json, indices.json). ``prices.json`` / ``indices.json`` los genera la
GitHub Action (``scripts/build_*.py``).
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys
from pathlib import Path

from eveindustry.engine.expand import expand_forced
from eveindustry.engine.resolve import ResolveResult, resolve
from eveindustry.model.dataset import load_dataset
from eveindustry.prices.base import PriceKind
from eveindustry.prices.overrides import OverridePriceProvider
from eveindustry.prices.static_json import StaticJsonPriceProvider
from eveindustry.state import State, build_assumptions, price_override_map


# --------------------------------------------------------------------------- #
# helpers de estado                                                           #
# --------------------------------------------------------------------------- #
def _state_from_args(args: argparse.Namespace) -> State:
    if args.state:
        st = State.parse(args.state)
    else:
        if args.type_id is None:
            raise SystemExit("error: falta el typeID (o --state)")
        st = State(type_id=args.type_id)

    if args.me is not None:
        st.default_me = args.me
    for item in args.me_bp or []:
        bp, _, me = item.partition("=")
        st.me_overrides[int(bp)] = float(me)
    if args.system is not None:
        st.system_id = args.system
    if args.security is not None:
        st.security = args.security
    if args.structure is not None:
        st.structure_type_id = args.structure
    for rid in args.rig or []:
        if rid not in st.rig_type_ids:
            st.rig_type_ids = (*st.rig_type_ids, rid)
    if args.facility_tax is not None:
        st.facility_tax = args.facility_tax
    for fid in args.ore or []:
        if fid not in st.ore_families:
            st.ore_families = (*st.ore_families, fid)
    if args.ore_grade is not None:
        st.ore_grade = args.ore_grade
    if args.reprocess_yield is not None:
        st.reprocess_yield = args.reprocess_yield
    if args.mineral_basis is not None:
        st.mineral_basis = args.mineral_basis
    if args.mining_rate is not None:
        st.mining_rate = args.mining_rate
    if args.demand is not None:
        st.demand = args.demand
    if args.invention:
        st.invention = True
    if args.policy is not None:
        from eveindustry.engine.policy import NodePolicy

        st.global_policy = NodePolicy(args.policy)
    for item in args.price or []:
        tid, _, px = item.partition("=")
        st.price_overrides[int(tid)] = float(px)
    for item in args.pol_type or []:
        tid, _, pol = item.partition("=")
        from eveindustry.engine.policy import NodePolicy

        st.policy_by_type[int(tid)] = NodePolicy(pol)
    return st


def _load_docs(data_dir: Path, indices_path: Path | None, rigs_path: Path | None):
    def _read(p: Path | None, default_name: str):
        path = p or (data_dir / default_name)
        return json.loads(path.read_text("utf-8")) if path.is_file() else None

    indices_doc = _read(indices_path, "indices.json")
    rigs_doc = _read(rigs_path, "rigs.json")
    systems_doc = _read(None, "systems.json")
    ores_doc = _read(None, "ores.json")
    return indices_doc, rigs_doc, systems_doc, ores_doc


def _prices(data_dir: Path, prices_path: Path | None, state: State):
    pp = prices_path or (data_dir / "prices.json")
    if not pp.is_file():
        raise SystemExit(
            f"error: no encuentro {pp}. Genera precios con "
            f"`python scripts/build_prices.py --types {data_dir}/types.json --out {pp}`"
        )
    provider = StaticJsonPriceProvider.from_file(pp)
    ov = price_override_map(state)
    return OverridePriceProvider(provider, ov) if ov else provider


# --------------------------------------------------------------------------- #
# impresión                                                                   #
# --------------------------------------------------------------------------- #
def _isk(x: float | None) -> str:
    return "—" if x is None else f"{x:,.0f}"


def _print_tree(r: ResolveResult, tid: int, depth: int, max_depth: int, seen: set) -> None:
    node = r.nodes.get(tid)
    if node is None or tid in seen:
        return
    seen.add(tid)
    pad = "    " + "  " * depth
    tag = node.decision.upper()
    extra = ""
    if node.decision == "build":
        extra = f"  jobs={node.jobs} install={_isk(node.install_cost)}"
        if node.invention_decryptor:
            extra += f"  [inv: {node.invention_decryptor} P={node.invention_probability:.2f} ME{node.effective_me}]"
    print(f"{pad}{node.name} ({tid})  {tag}{extra}")
    if depth >= max_depth:
        return
    for child_id in node.children:
        _print_tree(r, child_id, depth + 1, max_depth, seen)


# --------------------------------------------------------------------------- #
# subcomandos                                                                 #
# --------------------------------------------------------------------------- #
def cmd_calc(args: argparse.Namespace) -> int:
    data_dir = Path(args.data)
    state = _state_from_args(args)
    dataset = load_dataset(data_dir)
    indices_doc, rigs_doc, systems_doc, ores_doc = _load_docs(
        data_dir, _opt(args.indices), _opt(args.rigs)
    )
    if args.ore_preset and not state.ore_families and ores_doc:
        state.ore_families = tuple(ores_doc.get("secPresets", {}).get(args.ore_preset, ()))
    assumptions = build_assumptions(
        state, indices_doc=indices_doc, rigs_doc=rigs_doc,
        systems_doc=systems_doc, ores_doc=ores_doc,
    )
    prices = _prices(data_dir, _opt(args.prices), state)

    r = resolve(dataset, state.type_id, assumptions, prices)

    if args.json:
        print(json.dumps(dataclasses.asdict(r), default=str, indent=2))
        return 0

    _print_report_and_link(r, dataset, state, args.tree_depth)
    return 0


def _print_mining(r, dataset) -> None:
    mp = r.mining_plan
    tot = r.total_cost or 1.0
    print("\n  fuente del coste:")
    print(f"    minado propio       {_isk(r.cost_self_mined):>18}  "
          f"({r.cost_self_mined / tot * 100:4.1f}%)")
    print(f"    minerales comprados {_isk(r.cost_bought_minerals):>18}  "
          f"({r.cost_bought_minerals / tot * 100:4.1f}%)")
    print(f"    resto comprado      {_isk(r.cost_bought_other):>18}  "
          f"({r.cost_bought_other / tot * 100:4.1f}%)")
    print(f"    instalación         {_isk(r.total_install_cost):>18}  "
          f"({r.total_install_cost / tot * 100:4.1f}%)")

    print(f"\n  plan de minado ({mp.total_m3:,.0f} m³ / "
          f"{mp.total_m3_compressed:,.0f} m³ comprimido):")
    for line in mp.lines:
        print(f"    {line.ore_name:<24} {line.units:>13,} ud  {line.m3:>13,.0f} m³")
    if mp.shortfall:
        faltan = ", ".join(
            f"{dataset.type_name(t)} {q:,}" for t, q in sorted(mp.shortfall.items())
        )
        print(f"    tus ores NO cubren (se compran): {faltan}")
    if mp.surplus:
        sobra = ", ".join(
            f"{dataset.type_name(t)} {q:,}" for t, q in sorted(
                mp.surplus.items(), key=lambda kv: -kv[1])[:4]
        )
        print(f"    excedente: {sobra}")
    hours = mp.hours(None)
    if r.margin_per_hour is not None:
        print(f"    margen por hora de minado: {_isk(r.margin_per_hour)} ISK/h")
    if r.margin_per_m3 is not None:
        print(f"    margen por m³: {r.margin_per_m3:,.1f} ISK/m³")
    if r.ore_market_value is not None:
        print(f"    vender ese ore comprimido en vez de construir: "
              f"{_isk(r.ore_market_value)} ISK")


def _print_report_and_link(r, dataset, state, tree_depth):
    # versión limpia de _print_report + link
    n_build = sum(1 for n in r.nodes.values() if n.decision == "build")
    print(f"{r.root_name} ({r.root_type_id})  x{r.root_demand}")
    print(f"  build {n_build} / buy {len(r.nodes) - n_build} / hojas {len(r.leaves)}"
          f"   ({r.fixpoint_iterations} iter, {len(r.flips)} flips)\n")
    print(f"  coste total     {_isk(r.total_cost)} ISK")
    print(f"    material      {_isk(r.total_material_cost)}")
    print(f"    install       {_isk(r.total_install_cost)}")
    if r.total_invention_cost:
        print(f"    invención     {_isk(r.total_invention_cost)}")
    print(f"  coste unitario  {_isk(r.unit_cost)}\n")
    print(f"  precio compra (root)  {_isk(r.root_buy_price)}")
    if r.revenue is not None:
        pct = f"{r.margin_pct * 100:+.1f}%" if r.margin_pct is not None else "—"
        print(f"  ingreso (neto fees)   {_isk(r.revenue)}")
        print(f"  margen                {_isk(r.margin)}   ({pct})")
    if r.root_should_buy:
        print("  → la pasada 1 dice que sale más barato COMPRAR el root entero")

    if r.mining_plan is not None:
        _print_mining(r, dataset)

    if tree_depth > 0:
        print("\n  decisiones:")
        _print_tree(r, r.root_type_id, 0, tree_depth, set())
    if r.warnings:
        print(f"\n  {len(r.warnings)} warnings:")
        for w in r.warnings[:12]:
            print(f"    - {w}")
    print(f"\n  link: {state.to_query()}")


def cmd_link(args: argparse.Namespace) -> int:
    print(_state_from_args(args).to_query())
    return 0


def cmd_expand(args: argparse.Namespace) -> int:
    data_dir = Path(args.data)
    state = _state_from_args(args)
    dataset = load_dataset(data_dir)
    root = dataset.normalize_to_product(state.type_id)
    bp = dataset.blueprint_for_product(root)
    if bp is None:
        raise SystemExit(f"error: {root} no tiene blueprint")
    build_set = {m for m, _ in bp.materials}
    res = expand_forced(
        dataset, root, build_set=build_set,
        me_map=state.me_overrides, default_me=state.default_me,
        root_demand=state.demand,
    )
    print(f"{dataset.type_name(root)} ({root})  x{state.demand}  — expansión forzada 1 nivel\n")
    print("componentes:")
    for pid, node in res.built.items():
        if pid == root:
            continue
        print(f"  {dataset.type_name(pid):36s} demand={node.demand:<8d} runs={node.total_runs}")
    print("\nBOM (hojas):")
    for tid, qty in sorted(res.leaves.items(), key=lambda kv: -kv[1]):
        print(f"  {dataset.type_name(tid):36s} {qty}")
    for w in res.warnings:
        print(f"  aviso: {w}")
    return 0


def _opt(v: str | None) -> Path | None:
    return Path(v) if v else None


# --------------------------------------------------------------------------- #
# parser                                                                      #
# --------------------------------------------------------------------------- #
def _add_common(sp: argparse.ArgumentParser) -> None:
    sp.add_argument("type_id", nargs="?", type=int, help="typeID (producto o blueprint)")
    sp.add_argument("--state", help="estado serializado (t=...&me=...); anula el typeID posicional en parte")
    sp.add_argument("--me", type=float, help="ME por defecto")
    sp.add_argument("--me-bp", action="append", metavar="BPID=ME", help="ME por blueprint (repetible)")
    sp.add_argument("--system", type=int, help="solarSystemID para los índices de coste")
    sp.add_argument(
        "--security",
        choices=["highsec", "lowsec", "nullsec"],
        help="override de la banda de seguridad (por defecto se deriva del --system)",
    )
    sp.add_argument("--structure", type=int, metavar="TYPEID", help="typeID de la estructura")
    sp.add_argument("--rig", action="append", type=int, metavar="TYPEID", help="typeID de rig (repetible)")
    sp.add_argument("--facility-tax", type=float, metavar="FRAC", help="tax de instalación (fracción, p. ej. 0.001)")
    sp.add_argument("--ore", action="append", type=int, metavar="FAMILYID",
                    help="familia de ore que puedes minar (groupID, repetible)")
    sp.add_argument("--ore-preset", choices=["highsec", "lowsec", "nullsec"],
                    help="marca las familias tipicas de esa banda (orientativo)")
    sp.add_argument("--ore-grade", type=int, choices=[0, 1, 2, 3, 4],
                    help="grado del ore: 0=0-Grade, 1=base, 2=II, 3=III, 4=IV")
    sp.add_argument("--reprocess-yield", type=float, metavar="FRAC",
                    help="rendimiento de reprocesado (0.50 NPC ... ~0.906)")
    sp.add_argument("--mineral-basis", metavar="ore|zero|buy|ISK",
                    help="como valorar los minerales que minas tu (def: ore)")
    sp.add_argument("--mining-rate", type=float, metavar="M3H",
                    help="m3/hora de tu setup, para estimar horas de minado")
    sp.add_argument("--demand", type=int, help="unidades a producir (def 1)")
    sp.add_argument("--invention", action="store_true", help="activa la capa de invención")
    sp.add_argument(
        "--policy",
        choices=["auto", "build", "buy", "minerals"],
        help="política global (minerals = construir manufacturing, comprar reacciones)",
    )
    sp.add_argument("--pol-type", action="append", metavar="TYPEID=POL", help="política por typeID (repetible)")
    sp.add_argument("--price", action="append", metavar="TYPEID=ISK", help="override de precio (repetible)")
    sp.add_argument("--data", default="data", help="directorio de datos (def: data)")
    sp.add_argument("--prices", help="ruta a prices.json (def: <data>/prices.json)")
    sp.add_argument("--indices", help="ruta a indices.json (def: <data>/indices.json)")
    sp.add_argument("--rigs", help="ruta a rigs.json (def: <data>/rigs.json)")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="eveindustry", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("calc", help="resolver make-or-buy y mostrar coste/margen")
    _add_common(c)
    c.add_argument("--json", action="store_true", help="volcar ResolveResult como JSON")
    c.add_argument("--tree-depth", type=int, default=1, help="profundidad del árbol de decisiones (def 1, 0 = oculto)")
    c.set_defaults(func=cmd_calc)

    lk = sub.add_parser("link", help="imprimir el estado serializado (sin resolver)")
    _add_common(lk)
    lk.set_defaults(func=cmd_link)

    ex = sub.add_parser("expand", help="expansión forzada 1 nivel (BOM, modo regresión)")
    _add_common(ex)
    ex.set_defaults(func=cmd_expand)

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
