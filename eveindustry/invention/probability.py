"""Probabilidad de éxito de invención (plan §7)."""

from __future__ import annotations


def skill_multiplier(
    encryption_level: int,
    science1_level: int,
    science2_level: int,
) -> float:
    """``(1 + Enc/40) · (1 + (Sci1 + Sci2)/30)``.

    Con todo a V: ``1.125 · 1.3333… = 1.5`` (el máximo por skills).
    """
    return (1.0 + encryption_level / 40.0) * (
        1.0 + (science1_level + science2_level) / 30.0
    )


def invention_probability(
    base_probability: float,
    encryption_level: int = 5,
    science1_level: int = 5,
    science2_level: int = 5,
    decryptor_multiplier: float = 1.0,
) -> float:
    """P = base · skill_multiplier · decryptor_multiplier, acotada a [0, 1]."""
    p = (
        base_probability
        * skill_multiplier(encryption_level, science1_level, science2_level)
        * decryptor_multiplier
    )
    return max(0.0, min(1.0, p))
