"""Los 8 decryptors de T2 + "sin decryptor".

Valores de ``dgmTypeAttributes`` del SDE de fuzzwork (verificados):
``inventionPropabilityMultiplier`` / ``inventionMEModifier`` /
``inventionTEModifier`` / ``inventionMaxRunModifier``.

Nota: el brief menciona "18 decryptors". En el SDE actual hay 8 (grupo 1304). Los
"Sleeper/Ancient" son para invención de T3 y quedan fuera de v1.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Decryptor:
    type_id: int | None          # None = sin decryptor
    name: str
    probability_multiplier: float
    me_modifier: int
    te_modifier: int
    run_modifier: int


NO_DECRYPTOR = Decryptor(None, "Sin decryptor", 1.0, 0, 0, 0)

DECRYPTORS: tuple[Decryptor, ...] = (
    NO_DECRYPTOR,
    Decryptor(34201, "Accelerant Decryptor", 1.2, 2, 10, 1),
    Decryptor(34202, "Attainment Decryptor", 1.8, -1, 4, 4),
    Decryptor(34203, "Augmentation Decryptor", 0.6, -2, 2, 9),
    Decryptor(34204, "Parity Decryptor", 1.5, 1, -2, 3),
    Decryptor(34205, "Process Decryptor", 1.1, 3, 6, 0),
    Decryptor(34206, "Symmetry Decryptor", 1.0, 1, 8, 2),
    Decryptor(34207, "Optimized Attainment Decryptor", 1.9, 1, -2, 2),
    Decryptor(34208, "Optimized Augmentation Decryptor", 0.9, 2, 0, 7),
)


def from_sde_rows(rows: list[dict]) -> tuple[Decryptor, ...]:
    """Construye la tabla desde filas ``{type_id,name,prob,me,te,runs}`` (para
    regenerar si CCP cambia valores). Siempre antepone ``NO_DECRYPTOR``."""
    out = [NO_DECRYPTOR]
    for r in rows:
        out.append(
            Decryptor(
                type_id=int(r["type_id"]),
                name=r["name"],
                probability_multiplier=float(r["prob"]),
                me_modifier=int(r["me"]),
                te_modifier=int(r["te"]),
                run_modifier=int(r["runs"]),
            )
        )
    return tuple(out)
