from __future__ import annotations

import math
import re
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageFont

from common import ASSET_MINDMAP_DIR, DATA_DIR, clean_text, ensure_dirs, find_source, write_json


NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def get_slide_size(archive: zipfile.ZipFile) -> tuple[int, int]:
    root = ET.fromstring(archive.read("ppt/presentation.xml"))
    size = root.find(".//p:sldSz", NS)
    if size is None:
        return 12192000, 6858000
    return int(size.attrib.get("cx", 12192000)), int(size.attrib.get("cy", 6858000))


def shape_text(shape: ET.Element) -> str:
    return clean_text("\n".join(t.text or "" for t in shape.findall(".//a:t", NS)))


def shape_box(shape: ET.Element) -> tuple[int, int, int, int]:
    xfrm = shape.find(".//a:xfrm", NS)
    if xfrm is None:
        return 0, 0, 0, 0
    off = xfrm.find("a:off", NS)
    ext = xfrm.find("a:ext", NS)
    if off is None or ext is None:
        return 0, 0, 0, 0
    return (
        int(off.attrib.get("x", 0)),
        int(off.attrib.get("y", 0)),
        int(ext.attrib.get("cx", 0)),
        int(ext.attrib.get("cy", 0)),
    )


def slide_paths(archive: zipfile.ZipFile) -> list[str]:
    def key(path: str) -> int:
        match = re.search(r"slide(\d+)\.xml$", path)
        return int(match.group(1)) if match else 0

    paths = [n for n in archive.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)]
    return sorted(paths, key=key)


def font(size: int):
    candidates = [
        Path("C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/simhei.ttf"),
        Path("C:/Windows/Fonts/simsun.ttc"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def wrap_text(text: str, draw: ImageDraw.ImageDraw, fnt, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for ch in text:
        trial = current + ch
        bbox = draw.textbbox((0, 0), trial, font=fnt)
        if bbox[2] - bbox[0] <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = ch
    if current:
        lines.append(current)
    return lines[:5]


def render_slide(slide: dict, out_path: Path, slide_w: int, slide_h: int) -> None:
    width = 1800
    height = max(900, round(width * slide_h / slide_w))
    sx, sy = width / slide_w, height / slide_h
    image = Image.new("RGB", (width, height), "#fffdf8")
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width - 1, height - 1), outline="#dccbb7", width=2)
    title_font = font(30)
    body_font = font(22)
    palette = ["#f8efe2", "#e9f1ee", "#f2edf7", "#eef3fb", "#f9f3d8"]

    for idx, node in enumerate(slide["nodes"]):
        x = max(8, round(node["x_abs"] * sx))
        y = max(8, round(node["y_abs"] * sy))
        w = max(90, round(node["w_abs"] * sx))
        h = max(42, round(node["h_abs"] * sy))
        fill = palette[idx % len(palette)]
        outline = "#b9a993"
        radius = max(8, min(22, math.floor(min(w, h) / 5)))
        draw.rounded_rectangle((x, y, x + w, y + h), radius=radius, fill=fill, outline=outline, width=2)
        fnt = title_font if len(node["text"]) <= 12 and h > 60 else body_font
        lines = wrap_text(node["text"], draw, fnt, max(40, w - 18))
        line_h = fnt.size + 6
        start_y = y + max(8, (h - line_h * len(lines)) // 2)
        for j, line in enumerate(lines):
            draw.text((x + 10, start_y + j * line_h), line, fill="#222222", font=fnt)

    image.save(out_path)


def main() -> dict:
    ensure_dirs()
    pptx = find_source("mindmap_pptx")
    with zipfile.ZipFile(pptx) as archive:
        slide_w, slide_h = get_slide_size(archive)
        slides = []
        for slide_index, path in enumerate(slide_paths(archive), start=1):
            root = ET.fromstring(archive.read(path))
            nodes = []
            for shape in root.findall(".//p:sp", NS):
                text = shape_text(shape)
                if not text:
                    continue
                x, y, w, h = shape_box(shape)
                node = {
                    "id": f"M{slide_index:02d}-{len(nodes) + 1:03d}",
                    "slide": slide_index,
                    "text": text,
                    "x": round(x / slide_w, 5),
                    "y": round(y / slide_h, 5),
                    "w": round(w / slide_w, 5),
                    "h": round(h / slide_h, 5),
                    "x_abs": x,
                    "y_abs": y,
                    "w_abs": w,
                    "h_abs": h,
                    "linkedCardIds": [],
                }
                nodes.append(node)
            image_name = f"page-{slide_index:02d}.png"
            slide = {"slide": slide_index, "image": f"assets/mindmap/{image_name}", "nodes": nodes}
            render_slide(slide, ASSET_MINDMAP_DIR / image_name, slide_w, slide_h)
            for node in nodes:
                for key in ["x_abs", "y_abs", "w_abs", "h_abs"]:
                    node.pop(key, None)
            slides.append(slide)
    mindmap = {
        "source": "马原思维导图.pptx",
        "pageCount": len(slides),
        "nodeCount": sum(len(slide["nodes"]) for slide in slides),
        "slides": slides,
        "renderNote": "本环境无 LibreOffice，使用 PPTX XML 坐标和文本由 Pillow 离线重绘为 PNG。",
    }
    write_json(DATA_DIR / "mindmap.json", mindmap)
    return mindmap


if __name__ == "__main__":
    mindmap = main()
    print(f"mindmap_pages={mindmap['pageCount']} nodes={mindmap['nodeCount']}")
