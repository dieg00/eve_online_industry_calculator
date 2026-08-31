"""Estado de un cálculo, serializable a/desde un string tipo query-string.

Un enlace = un cálculo reproducible (plan §restricciones). El mismo formato lo
produce y consume el frontend. ``State`` es dato plano; ``build_assumptions``
lo traduce a lo que come el motor.

Formato (todo opcional salvo ``t``):

    t=20183 d=1 me=10 me.2049=2 sys=30000142 struct=35825 rigs=37180,37181
    sec=nullsec tax=0.001 pol=auto pol.34562=buy polact.reaction=buy
    inv=1 enc=5 sci1=5 sci2=5 pin=sell pout=buy broker=0.03 stax=0.045
    px.34=6.10

Los ``px.<typeID>`` son overrides de precio (se aplican con ``OverridePriceProvider``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import unquote, urlencode

from eveindustry.engine.policy import NodePolicy, PolicyConfig
from eveindustry.invention.cost import InventionParams
from eveindustry.model.assumptions import Assumptions, Valuation
from eveindustry.model.costconfig import CostConstants, CostIndices
from eveindustry.model.structure import RigCatalog, StructureConfig
from eveindustry.prices.base import PriceKind

_SEC = {"highsec", "lowsec", "nullsec"}


@dataclass
class State:
    type_id: int
    demand: int = 1
    default_me: float = 0.0
    me_overrides: dict[int, float] = field(default_factory=dict)   # blueprintTypeID -> ME

    system_id: int | None = None
    structure_type_id: int | None = None
    rig_type_ids: tuple[int, ...] = ()
    security: str = "highsec"
    facility_tax: float | None = None

    global_policy: NodePolicy = NodePolicy.AUTO
    policy_by_type: dict[int, NodePolicy] = field(default_factory=dict)
    policy_by_category: dict[int, NodePolicy] = field(default_factory=dict)
    policy_by_activity: dict[str, NodePolicy] = field(default_factory=dict)

    invention: bool = False
    enc_level: int = 5
    sci1_level: int = 5
    sci2_level: int = 5

    input_price_kind: PriceKind = PriceKind.SELL
    output_price_kind: PriceKind = PriceKind.BUY
    broker_fee: float = 0.03
    sales_tax: float = 0.045

    price_overrides: dict[int, float] = field(default_factory=dict)  # typeID -> ISK

    # ---------------------------------------------------------------- parse
    @classmethod
    def parse(cls, text: str) -> State:
        pairs: dict[str, str] = {}
        multi: dict[str, dict[str, str]] = {}
        for chunk in text.replace("&", " ").split():
            if "=" not in chunk:
                continue
            key, _, val = chunk.partition("=")
            val = unquote(val)
            if "." in key:
                prefix, sub = key.split(".", 1)
                multi.setdefault(prefix, {})[sub] = val
            else:
                pairs[key] = val

        if "t" not in pairs:
            raise ValueError("falta 't' (typeID) en el estado")

        st = cls(type_id=int(pairs["t"]))
        st.demand = int(pairs.get("d", 1))
        st.default_me = float(pairs.get("me", 0.0))
        st.me_overrides = {int(k): float(v) for k, v in multi.get("me", {}).items()}

        st.system_id = int(pairs["sys"]) if "sys" in pairs else None
        st.structure_type_id = int(pairs["struct"]) if "struct" in pairs else None
        if pairs.get("rigs"):
            st.rig_type_ids = tuple(int(x) for x in pairs["rigs"].split(","))
        st.security = pairs.get("sec", "highsec")
        if st.security not in _SEC:
            raise ValueError(f"sec inválido: {st.security!r}")
        st.facility_tax = float(pairs["tax"]) if "tax" in pairs else None

        st.global_policy = NodePolicy(pairs.get("pol", "auto"))
        st.policy_by_type = {
            int(k): NodePolicy(v) for k, v in multi.get("pol", {}).items()
        }
        st.policy_by_category = {
            int(k): NodePolicy(v) for k, v in multi.get("polcat", {}).items()
        }
        st.policy_by_activity = {
            k: NodePolicy(v) for k, v in multi.get("polact", {}).items()
        }

        st.invention = pairs.get("inv", "0") in ("1", "true", "yes")
        st.enc_level = int(pairs.get("enc", 5))
        st.sci1_level = int(pairs.get("sci1", 5))
        st.sci2_level = int(pairs.get("sci2", 5))

        st.input_price_kind = PriceKind(pairs.get("pin", "sell"))
        st.output_price_kind = PriceKind(pairs.get("pout", "buy"))
        st.broker_fee = float(pairs.get("broker", 0.03))
        st.sales_tax = float(pairs.get("stax", 0.045))

        st.price_overrides = {
            int(k): float(v) for k, v in multi.get("px", {}).items()
        }
        return st

    # ------------------------------------------------------------ serialize
    def to_query(self) -> str:
        p: list[tuple[str, str]] = [("t", str(self.type_id))]
        if self.demand != 1:
            p.append(("d", str(self.demand)))
        if self.default_me:
            p.append(("me", _num(self.default_me)))
        for bp, me in sorted(self.me_overrides.items()):
            p.append((f"me.{bp}", _num(me)))
        if self.system_id is not None:
            p.append(("sys", str(self.system_id)))
        if self.structure_type_id is not None:
            p.append(("struct", str(self.structure_type_id)))
        if self.rig_type_ids:
            p.append(("rigs", ",".join(str(r) for r in self.rig_type_ids)))
        if self.security != "highsec":
            p.append(("sec", self.security))
        if self.facility_tax is not None:
            p.append(("tax", _num(self.facility_tax)))
        if self.global_policy is not NodePolicy.AUTO:
            p.append(("pol", self.global_policy.value))
        for tid, pol in sorted(self.policy_by_type.items()):
            p.append((f"pol.{tid}", pol.value))
        for cid, pol in sorted(self.policy_by_category.items()):
            p.append((f"polcat.{cid}", pol.value))
        for act, pol in sorted(self.policy_by_activity.items()):
            p.append((f"polact.{act}", pol.value))
        if self.invention:
            p.append(("inv", "1"))
            if self.enc_level != 5:
                p.append(("enc", str(self.enc_level)))
            if self.sci1_level != 5:
                p.append(("sci1", str(self.sci1_level)))
            if self.sci2_level != 5:
                p.append(("sci2", str(self.sci2_level)))
        if self.input_price_kind is not PriceKind.SELL:
            p.append(("pin", self.input_price_kind.value))
        if self.output_price_kind is not PriceKind.BUY:
            p.append(("pout", self.output_price_kind.value))
        if self.broker_fee != 0.03:
            p.append(("broker", _num(self.broker_fee)))
        if self.sales_tax != 0.045:
            p.append(("stax", _num(self.sales_tax)))
        for tid, px in sorted(self.price_overrides.items()):
            p.append((f"px.{tid}", _num(px)))
        return urlencode(p, safe=",")

    def __str__(self) -> str:  # pragma: no cover - conveniencia
        return self.to_query()

    # -------------------------------------------------------------- dict (UI)
    def to_dict(self) -> dict:
        """JSON-friendly, para hidratar el formulario del frontend."""
        return {
            "type_id": self.type_id,
            "demand": self.demand,
            "default_me": self.default_me,
            "me_overrides": {str(k): v for k, v in self.me_overrides.items()},
            "system_id": self.system_id,
            "structure_type_id": self.structure_type_id,
            "rig_type_ids": list(self.rig_type_ids),
            "security": self.security,
            "facility_tax": self.facility_tax,
            "global_policy": self.global_policy.value,
            "policy_by_type": {str(k): v.value for k, v in self.policy_by_type.items()},
            "policy_by_category": {
                str(k): v.value for k, v in self.policy_by_category.items()
            },
            "policy_by_activity": {k: v.value for k, v in self.policy_by_activity.items()},
            "invention": self.invention,
            "enc_level": self.enc_level,
            "sci1_level": self.sci1_level,
            "sci2_level": self.sci2_level,
            "input_price_kind": self.input_price_kind.value,
            "output_price_kind": self.output_price_kind.value,
            "broker_fee": self.broker_fee,
            "sales_tax": self.sales_tax,
            "price_overrides": {str(k): v for k, v in self.price_overrides.items()},
        }


def _num(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else repr(x)


def price_override_map(state: State) -> dict[int, dict[str, float]]:
    """``{typeID: {"buy":v,"sell":v,"adjusted":v,"average":v}}`` para
    ``OverridePriceProvider``. Un override manual fija todas las variantes."""
    return {
        tid: {"buy": v, "sell": v, "adjusted": v, "average": v}
        for tid, v in state.price_overrides.items()
    }


# --------------------------------------------------------------------------- #
# State -> objetos del motor                                                  #
# --------------------------------------------------------------------------- #
def build_assumptions(
    state: State,
    *,
    indices_doc: dict | None = None,
    rigs_doc: dict | None = None,
) -> Assumptions:
    """Traduce el estado a ``Assumptions``.

    ``indices_doc`` = ``indices.json`` ya parseado (para resolver ``sys`` y las
    constantes). ``rigs_doc`` = ``rigs.json`` (para estructura + rigs).
    """
    indices = CostIndices()
    constants = CostConstants()
    if indices_doc:
        constants = CostConstants.from_doc(indices_doc)
        if state.system_id is not None:
            row = indices_doc.get("systems", {}).get(str(state.system_id))
            if row is not None:
                indices = CostIndices.from_system_doc(row)

    rig_catalog = RigCatalog.from_doc(rigs_doc) if rigs_doc else RigCatalog.empty()

    tax = state.facility_tax if state.facility_tax is not None else constants.facility_tax
    structure = StructureConfig(
        structure_type_id=state.structure_type_id,
        rig_type_ids=state.rig_type_ids,
        security=state.security,
        facility_tax=tax,
    )

    policy = PolicyConfig(
        by_type=dict(state.policy_by_type),
        by_category=dict(state.policy_by_category),
        by_activity=dict(state.policy_by_activity),
        default=state.global_policy,
    )

    invention = None
    if state.invention:
        invention = InventionParams(
            encryption_level=state.enc_level,
            science1_level=state.sci1_level,
            science2_level=state.sci2_level,
        )

    return Assumptions(
        me_map=dict(state.me_overrides),
        default_me=state.default_me,
        structure=structure,
        rig_catalog=rig_catalog,
        indices=indices,
        constants=constants,
        valuation=Valuation(
            input_price_kind=state.input_price_kind,
            output_price_kind=state.output_price_kind,
            broker_fee=state.broker_fee,
            sales_tax=state.sales_tax,
        ),
        invention=invention,
        policy=policy,
        root_demand=state.demand,
    )
