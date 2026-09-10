"""Plan de minado: del BOM de minerales a la mezcla de ore (problema inverso).

FUNCIONES PURAS, sin I/O ni precios — corre en Pyodide como el resto del motor.

El resolvedor es **greedy** a propósito: el motor es cero-dependencias, así que
nada de programación lineal con scipy. En cada vuelta se atiende el mineral que
más m³ costaría conseguir por su cuenta (el cuello de botella), usando el ore que
más rinde de ese mineral por m³; los demás minerales de ese ore se acreditan como
efecto colateral. Después una pasada de **recorte** quita el exceso de batches que
las vueltas posteriores hayan dejado redundante.

Consecuencia realista y visible: minar Arkonor por su Megacyte deja Pyerite de
sobra. Eso sale en ``MiningPlan.surplus``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from eveindustry.model.ores import Ore

__all__ = ["MiningLine", "MiningPlan", "minerals_from_batches", "ore_mix_for"]


def minerals_from_batches(ore: Ore, batches: int, yield_rate: float) -> dict[int, int]:
    """Minerales que salen de reprocesar ``batches`` lotes de ``ore``."""
    if batches <= 0:
        return {}
    return {
        mineral: int(qty * batches * yield_rate)
        for mineral, qty in ore.minerals
    }


@dataclass(frozen=True)
class MiningLine:
    ore_type_id: int
    ore_name: str
    family_name: str
    batches: int
    units: int
    m3: float
    m3_compressed: float
    compressed_type_id: int | None
    minerals: dict[int, int]


@dataclass
class MiningPlan:
    yield_rate: float
    lines: list[MiningLine] = field(default_factory=list)
    targets: dict[int, int] = field(default_factory=dict)
    covered: dict[int, int] = field(default_factory=dict)
    surplus: dict[int, int] = field(default_factory=dict)
    shortfall: dict[int, int] = field(default_factory=dict)
    # campos, no properties: dataclasses.asdict() (que usa el bridge de la web)
    # solo serializa campos.
    total_m3: float = 0.0
    total_m3_compressed: float = 0.0

    def hours(self, m3_per_hour: float | None) -> float | None:
        if not m3_per_hour or m3_per_hour <= 0:
            return None
        return self.total_m3 / m3_per_hour


def _per_batch(ore: Ore, yield_rate: float) -> dict[int, float]:
    return {m: q * yield_rate for m, q in ore.minerals}


def ore_mix_for(
    targets: dict[int, int],
    ores: list[Ore],
    yield_rate: float = 0.5,
) -> MiningPlan:
    """Mezcla de ore que cubre ``targets`` (mineralTypeID -> unidades)."""
    plan = MiningPlan(yield_rate=yield_rate, targets=dict(targets))
    wanted = {m: q for m, q in targets.items() if q > 0}
    if not wanted or not ores or yield_rate <= 0:
        plan.shortfall = dict(wanted)
        return plan

    per_batch = {o.type_id: _per_batch(o, yield_rate) for o in ores}
    m3_per_batch = {o.type_id: o.volume * o.portion for o in ores}
    by_id = {o.type_id: o for o in ores}

    producible = set()
    for o in ores:
        producible |= o.mineral_ids()

    # Lo que ningún ore marcado produce se compra: fuera del greedy. El
    # shortfall se calcula una sola vez al final, desde wanted - covered.
    remaining = {m: q for m, q in wanted.items() if m in producible}

    batches: dict[int, int] = {}
    guard = 0
    while remaining and guard < 10_000:
        guard += 1
        # Para cada mineral corto: el ore que más rinde por m³, y cuánto m³
        # costaría cubrirlo solo con él. El cuello de botella es el peor.
        worst_mineral = None
        worst_cost = -1.0
        worst_ore = None
        for mineral, need in remaining.items():
            if need <= 0:
                continue
            best_eff, best_ore = 0.0, None
            for oid, pb in per_batch.items():
                got = pb.get(mineral, 0.0)
                if got <= 0:
                    continue
                eff = got / m3_per_batch[oid]      # mineral por m³
                if eff > best_eff:
                    best_eff, best_ore = eff, oid
            if best_ore is None:
                continue
            cost = need / best_eff
            if cost > worst_cost:
                worst_cost, worst_mineral, worst_ore = cost, mineral, best_ore

        if worst_ore is None:
            break

        got_per_batch = per_batch[worst_ore][worst_mineral]
        need_batches = max(1, math.ceil(remaining[worst_mineral] / got_per_batch))
        batches[worst_ore] = batches.get(worst_ore, 0) + need_batches

        for mineral, got in per_batch[worst_ore].items():
            if mineral in remaining:
                remaining[mineral] -= int(got * need_batches)
                if remaining[mineral] <= 0:
                    del remaining[mineral]

    _trim(batches, wanted, per_batch, m3_per_batch)

    covered: dict[int, int] = {}
    for oid, n in sorted(batches.items(), key=lambda kv: -m3_per_batch[kv[0]] * kv[1]):
        ore = by_id[oid]
        mins = minerals_from_batches(ore, n, yield_rate)
        for m, q in mins.items():
            covered[m] = covered.get(m, 0) + q
        plan.lines.append(
            MiningLine(
                ore_type_id=oid,
                ore_name=ore.name,
                family_name=ore.family_name,
                batches=n,
                units=n * ore.portion,
                m3=n * m3_per_batch[oid],
                m3_compressed=n * ore.portion * (ore.compressed_volume or ore.volume),
                compressed_type_id=ore.compressed_type_id,
                minerals=mins,
            )
        )

    plan.covered = covered
    plan.total_m3 = sum(line.m3 for line in plan.lines)
    plan.total_m3_compressed = sum(line.m3_compressed for line in plan.lines)
    plan.surplus = {
        m: covered[m] - wanted.get(m, 0)
        for m in covered
        if covered[m] > wanted.get(m, 0)
    }
    plan.shortfall = {
        m: q - covered.get(m, 0)
        for m, q in wanted.items()
        if q - covered.get(m, 0) > 0
    }
    return plan


def _trim(
    batches: dict[int, int],
    wanted: dict[int, int],
    per_batch: dict[int, dict[int, float]],
    m3_per_batch: dict[int, float],
) -> None:
    """Baja cada ore al mínimo de batches que sigue cubriendo todo, empezando por
    el que más m³ ocupa. Exacto y O(1) por ore: no hay que ir de uno en uno."""
    for oid in sorted(batches, key=lambda o: -m3_per_batch[o] * batches[o]):
        others: dict[int, float] = {}
        for other, n in batches.items():
            if other == oid:
                continue
            for m, got in per_batch[other].items():
                others[m] = others.get(m, 0.0) + got * n

        needed = 0
        for mineral, target in wanted.items():
            gap = target - others.get(mineral, 0.0)
            if gap <= 0:
                continue
            got = per_batch[oid].get(mineral, 0.0)
            if got <= 0:
                continue
            needed = max(needed, math.ceil(gap / got))
        batches[oid] = min(batches[oid], needed)

    for oid in [o for o, n in batches.items() if n <= 0]:
        del batches[oid]
