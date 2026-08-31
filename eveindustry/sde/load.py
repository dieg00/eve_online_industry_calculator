"""Apertura del SDE en SQLite y consultas de bajo nivel.

Todo lo que se lee del SDE pasa por aquí. Las funciones devuelven estructuras
primitivas (dicts, listas, tuplas) para que ``trim`` no dependa de sqlite.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from pathlib import Path

from eveindustry.model.types import (
    ACTIVITY_INVENTION,
    ACTIVITY_MANUFACTURING,
    ACTIVITY_REACTION,
    ENCRYPTION_SKILL_IDS,
)

# Actividades que expandimos como "construibles" (plan, decisión D + C).
BUILDABLE_ACTIVITIES: tuple[int, ...] = (ACTIVITY_MANUFACTURING, ACTIVITY_REACTION)


def open_sde(path: str | Path) -> sqlite3.Connection:
    """Abre el SDE en modo solo-lectura. Falla si el fichero no existe."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"No encuentro el SDE en {p!r}")
    conn = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def sde_version(conn: sqlite3.Connection) -> str | None:
    """Intenta leer la versión del SDE. La convención de fuzzwork es una tabla
    ``version`` o ``sdeVersion``; si no está, devuelve ``None``."""
    for table, column in (("version", "version"), ("sdeVersion", "version")):
        try:
            row = conn.execute(f"SELECT {column} FROM {table} LIMIT 1").fetchone()
        except sqlite3.OperationalError:
            continue
        if row is not None:
            return str(row[0])
    return None


def iter_buildable_blueprints(
    conn: sqlite3.Connection,
    activities: tuple[int, ...] = BUILDABLE_ACTIVITIES,
) -> Iterator[dict]:
    """Un dict por (blueprintTypeID, activityID) construible.

    Campos: ``blueprint_type_id``, ``activity_id``, ``product_type_id``,
    ``produces_per_run``, ``max_production_limit``, ``base_time``,
    ``materials`` = lista de ``(material_type_id, base_qty)``.

    - ``produces_per_run`` sale de ``industryActivityProducts.quantity``.
    - ``max_production_limit`` de ``industryBlueprints`` (puede faltar para
      reacciones; en ese caso se deja en 0 y el motor lo trata como "sin tope").
    """
    placeholders = ",".join("?" for _ in activities)

    products = conn.execute(
        f"""
        SELECT iap.typeID          AS blueprint_type_id,
               iap.activityID      AS activity_id,
               iap.productTypeID   AS product_type_id,
               iap.quantity        AS produces_per_run,
               COALESCE(ib.maxProductionLimit, 0) AS max_production_limit,
               COALESCE(ia.time, 0)               AS base_time
        FROM industryActivityProducts iap
        LEFT JOIN industryBlueprints ib ON ib.typeID = iap.typeID
        LEFT JOIN industryActivity   ia ON ia.typeID = iap.typeID
                                       AND ia.activityID = iap.activityID
        WHERE iap.activityID IN ({placeholders})
        """,
        activities,
    ).fetchall()

    mats_by_key: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for row in conn.execute(
        f"""
        SELECT typeID AS blueprint_type_id,
               activityID AS activity_id,
               materialTypeID AS material_type_id,
               quantity AS base_qty
        FROM industryActivityMaterials
        WHERE activityID IN ({placeholders})
        ORDER BY typeID, materialTypeID
        """,
        activities,
    ).fetchall():
        key = (row["blueprint_type_id"], row["activity_id"])
        mats_by_key.setdefault(key, []).append(
            (row["material_type_id"], row["base_qty"])
        )

    for row in products:
        key = (row["blueprint_type_id"], row["activity_id"])
        yield {
            "blueprint_type_id": row["blueprint_type_id"],
            "activity_id": row["activity_id"],
            "product_type_id": row["product_type_id"],
            "produces_per_run": row["produces_per_run"],
            "max_production_limit": row["max_production_limit"],
            "base_time": row["base_time"],
            "materials": mats_by_key.get(key, []),
        }


def iter_invention(conn: sqlite3.Connection) -> Iterator[dict]:
    """Un dict por blueprint T2 invencionable.

    Campos: ``t2_blueprint_type_id``, ``t1_blueprint_type_id``,
    ``base_probability``, ``base_runs`` (runs del BPC T2), ``datacores`` =
    ``[(typeID, qty), ...]``, ``encryption_skill_id``, ``science_skill_ids``.
    """
    # T1 bp -> T2 bp (+ runs base del BPC T2)
    t2_of: dict[int, tuple[int, int]] = {}
    for row in conn.execute(
        "SELECT typeID, productTypeID, quantity FROM industryActivityProducts "
        "WHERE activityID = ?",
        (ACTIVITY_INVENTION,),
    ):
        t2_of[row["typeID"]] = (row["productTypeID"], row["quantity"])

    prob: dict[int, float] = {}
    for row in conn.execute(
        "SELECT typeID, probability FROM industryActivityProbabilities WHERE activityID = ?",
        (ACTIVITY_INVENTION,),
    ):
        prob[row["typeID"]] = float(row["probability"])

    datacores: dict[int, list[tuple[int, int]]] = {}
    for row in conn.execute(
        "SELECT typeID, materialTypeID, quantity FROM industryActivityMaterials "
        "WHERE activityID = ? ORDER BY typeID, materialTypeID",
        (ACTIVITY_INVENTION,),
    ):
        datacores.setdefault(row["typeID"], []).append(
            (row["materialTypeID"], row["quantity"])
        )

    skills: dict[int, list[int]] = {}
    for row in conn.execute(
        "SELECT typeID, skillID FROM industryActivitySkills WHERE activityID = ?",
        (ACTIVITY_INVENTION,),
    ):
        skills.setdefault(row["typeID"], []).append(row["skillID"])

    for t1_bp, (t2_bp, base_runs) in t2_of.items():
        skill_ids = skills.get(t1_bp, [])
        enc = next((s for s in skill_ids if s in ENCRYPTION_SKILL_IDS), None)
        sci = tuple(s for s in skill_ids if s not in ENCRYPTION_SKILL_IDS)
        yield {
            "t2_blueprint_type_id": t2_bp,
            "t1_blueprint_type_id": t1_bp,
            "base_probability": prob.get(t1_bp, 0.0),
            "base_runs": base_runs,
            "datacores": datacores.get(t1_bp, []),
            "encryption_skill_id": enc,
            "science_skill_ids": sci,
        }


def load_solar_systems(conn: sqlite3.Connection) -> dict[int, dict]:
    """``{solarSystemID: {name, security}}`` para el selector de sistema del UI."""
    out: dict[int, dict] = {}
    for row in conn.execute(
        "SELECT solarSystemID, solarSystemName, security FROM mapSolarSystems"
    ):
        out[row["solarSystemID"]] = {
            "name": row["solarSystemName"],
            "security": round(float(row["security"] or 0.0), 2),
        }
    return out


def load_type_info(conn: sqlite3.Connection, type_ids: set[int]) -> dict[int, dict]:
    """``{typeID: {name, group_id, category_id, volume}}`` para los ids pedidos."""
    if not type_ids:
        return {}

    out: dict[int, dict] = {}
    ids = list(type_ids)
    chunk = 900  # límite de variables por sentencia en SQLite
    for start in range(0, len(ids), chunk):
        batch = ids[start : start + chunk]
        placeholders = ",".join("?" for _ in batch)
        for row in conn.execute(
            f"""
            SELECT it.typeID     AS type_id,
                   it.typeName   AS name,
                   it.groupID    AS group_id,
                   ig.categoryID AS category_id,
                   COALESCE(it.volume, 0.0) AS volume
            FROM invTypes it
            LEFT JOIN invGroups ig ON ig.groupID = it.groupID
            WHERE it.typeID IN ({placeholders})
            """,
            batch,
        ).fetchall():
            out[row["type_id"]] = {
                "name": row["name"],
                "group_id": row["group_id"],
                "category_id": row["category_id"],
                "volume": row["volume"],
            }
    return out
