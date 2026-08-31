"""Tests de la CLI. Los que resuelven de verdad usan data/ y se saltan si falta."""

from pathlib import Path

import pytest

from eveindustry.cli import main

DATA = Path(__file__).parents[1] / "data"
HAS_PRICES = (DATA / "prices.json").is_file()


def test_link_builds_state_string(capsys):
    rc = main(["link", "20184", "--me", "10", "--me-bp", "2049=4", "--system", "30000142"])
    out = capsys.readouterr().out.strip()
    assert rc == 0
    assert out == "t=20184&me=10&me.2049=4&sys=30000142"


def test_link_from_state_passthrough(capsys):
    main(["link", "--state", "t=20184&me=10&pol=buy"])
    assert capsys.readouterr().out.strip() == "t=20184&me=10&pol=buy"


def test_calc_requires_type_id():
    with pytest.raises(SystemExit):
        main(["calc"])


@pytest.mark.skipif(not HAS_PRICES, reason="data/prices.json no generado")
def test_calc_providence_runs(capsys):
    rc = main(["calc", "20184", "--me", "10", "--system", "30000142", "--tree-depth", "0"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "Providence (20183)" in out
    assert "coste total" in out
    assert "link: t=20184&me=10&sys=30000142" in out


@pytest.mark.skipif(not HAS_PRICES, reason="data/prices.json no generado")
def test_calc_minerals_policy_builds_components_buys_reactions(capsys):
    import json

    main(["calc", "20184", "--me", "10", "--system", "30000142",
          "--policy", "minerals", "--json"])
    doc = json.loads(capsys.readouterr().out)
    nodes = doc["nodes"]

    seal = nodes["57478"]          # Auto-Integrity Preservation Seal (manufacturing)
    assert seal["decision"] == "build"
    assert seal["policy_source"] == "minerals-build"

    # el modo compró cosas (reacciones + minerales)
    assert any(n["policy_source"] == "minerals-buy" for n in nodes.values())
    # y todo lo construido lo fue por ser manufacturing
    assert all(
        n["policy_source"] == "minerals-build"
        for n in nodes.values()
        if n["decision"] == "build"
    )


@pytest.mark.skipif(not HAS_PRICES, reason="data/prices.json no generado")
def test_calc_json_output(capsys):
    import json

    main(["calc", "20184", "--me", "10", "--system", "30000142", "--json"])
    doc = json.loads(capsys.readouterr().out)
    assert doc["root_type_id"] == 20183
    assert doc["total_cost"] > 0
    assert "nodes" in doc and "leaves" in doc


@pytest.mark.skipif(not DATA.joinpath("blueprints.json").is_file(), reason="sin dataset")
def test_expand_shows_components(capsys):
    rc = main(["expand", "20184", "--me", "10"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "Capital Cargo Bay" in out
    assert "Tritanium" in out
    assert "2597400" in out


@pytest.mark.skipif(not HAS_PRICES, reason="data/prices.json no generado")
def test_calc_state_and_flags_merge(capsys):
    # --state da el typeID; --system y --me-bp lo completan
    main([
        "calc", "--state", "t=20184&me=10",
        "--system", "30000142", "--tree-depth", "0",
    ])
    assert "Providence (20183)" in capsys.readouterr().out
