import json
from pathlib import Path


MINDMAP = Path(__file__).resolve().parents[1] / "data" / "mindmap.json"


def load_mindmap():
    return json.loads(MINDMAP.read_text(encoding="utf-8"))


def test_brace_connectors_keep_nodes_on_both_sides_when_present():
    data = load_mindmap()

    assert data["pageCount"] == len(data["slides"])

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

            left_items = []
            right_items = []

            for node in nodes:
                cy = node["y"] + node["h"] / 2
                if not brace_y - 0.05 <= cy <= brace_y + brace_h + 0.05:
                    continue

                dist_left = brace_x - (node["x"] + node["w"])
                dist_right = node["x"] - (brace_x + brace_w)

                if -0.05 <= dist_left < 0.15:
                    left_items.append(node)
                elif -0.15 <= dist_right < 0.05:
                    right_items.append(node)

            assert left_items, f"slide {slide['slide']} brace connector has no left-side nodes"
            assert right_items, f"slide {slide['slide']} brace connector has no right-side nodes"
