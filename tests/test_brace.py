import json
from pathlib import Path


MINDMAP = Path(__file__).resolve().parents[1] / "data" / "mindmap.json"


def load_mindmap():
    return json.loads(MINDMAP.read_text(encoding="utf-8"))


def test_brace_connectors_have_parent_and_children_when_present():
    data = load_mindmap()

    assert data["slides"]

    for slide in data["slides"]:
        nodes = slide["nodes"]
        lines = slide["lines"]
        for line in lines:
            if "brace" not in line["type"].lower() and "bracket" not in line["type"].lower():
                continue

            brace_x = min(line["x1"], line["x2"])
            brace_w = abs(line["x2"] - line["x1"])
            brace_y = min(line["y1"], line["y2"])
            brace_h = abs(line["y2"] - line["y1"])

            parent = None
            min_dist = 999
            for node in nodes:
                dist = brace_x - (node["x"] + node["w"])
                vertically_overlaps = node["y"] <= brace_y + brace_h and node["y"] + node["h"] >= brace_y
                if -0.05 <= dist < min_dist and vertically_overlaps:
                    min_dist = dist
                    parent = node

            children = []
            for node in nodes:
                cy = node["y"] + node["h"] / 2
                dist = node["x"] - (brace_x + brace_w)
                if -0.05 <= dist < 0.15 and brace_y - 0.05 <= cy <= brace_y + brace_h + 0.05:
                    children.append(node)

            assert parent is not None, f"slide {slide['slide']} brace connector has no parent"
            assert children, f"slide {slide['slide']} brace connector has no children"
