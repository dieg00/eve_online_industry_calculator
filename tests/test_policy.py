"""Tests de ``eveindustry.engine.policy``: prioridad type > category > activity > default."""

from eveindustry.engine.policy import NodePolicy, PolicyConfig


def test_default_is_auto():
    cfg = PolicyConfig()
    d = cfg.resolve(1, category_id=17, activity_name="manufacturing", has_blueprint=True)
    assert d.policy is NodePolicy.AUTO
    assert d.source == "default"


def test_by_activity_beats_default():
    cfg = PolicyConfig(by_activity={"reaction": NodePolicy.BUY})
    d = cfg.resolve(1, category_id=17, activity_name="reaction", has_blueprint=True)
    assert (d.policy, d.source) == (NodePolicy.BUY, "activity")


def test_by_category_beats_activity():
    cfg = PolicyConfig(
        by_category={4: NodePolicy.BUILD},
        by_activity={"manufacturing": NodePolicy.BUY},
    )
    d = cfg.resolve(1, category_id=4, activity_name="manufacturing", has_blueprint=True)
    assert (d.policy, d.source) == (NodePolicy.BUILD, "category")


def test_by_type_beats_everything():
    cfg = PolicyConfig(
        by_type={99: NodePolicy.BUY},
        by_category={4: NodePolicy.BUILD},
        by_activity={"manufacturing": NodePolicy.BUILD},
        default=NodePolicy.BUILD,
    )
    d = cfg.resolve(99, category_id=4, activity_name="manufacturing", has_blueprint=True)
    assert (d.policy, d.source) == (NodePolicy.BUY, "type")


def test_no_blueprint_forces_buy_even_if_build_requested():
    cfg = PolicyConfig(by_type={99: NodePolicy.BUILD})
    d = cfg.resolve(99, category_id=None, activity_name=None, has_blueprint=False)
    assert (d.policy, d.source) == (NodePolicy.BUY, "no-blueprint")


def test_minerals_passes_through_resolve_and_falls_to_buy_without_blueprint():
    # resolve() no evalúa MINERALS (lo hace pass1): lo devuelve tal cual...
    cfg = PolicyConfig(default=NodePolicy.MINERALS)
    d = cfg.resolve(1, category_id=17, activity_name="manufacturing", has_blueprint=True)
    assert d.policy is NodePolicy.MINERALS
    # ...salvo que no haya receta, donde el short-circuit ya fuerza compra.
    d2 = cfg.resolve(1, category_id=None, activity_name=None, has_blueprint=False)
    assert (d2.policy, d2.source) == (NodePolicy.BUY, "no-blueprint")
