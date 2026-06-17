import json
from pathlib import Path


MINDMAP = Path(__file__).resolve().parents[1] / "data" / "mindmap.json"


def load_mindmap():
    return json.loads(MINDMAP.read_text(encoding="utf-8"))


def test_slide_5_nodes_have_valid_normalized_geometry():
    data = load_mindmap()
    slide = next(item for item in data["slides"] if item["slide"] == 5)

    assert slide["nodes"]

    for node in slide["nodes"]:
        assert node["text"].strip()
        assert 0 <= node["x"] <= 1
        assert 0 <= node["y"] <= 1
        assert 0 < node["w"] <= 1
        assert 0 < node["h"] <= 1
        assert node["x"] + node["w"] <= 1.05
        assert node["y"] + node["h"] <= 1.05
