from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from typing import Iterable


SITE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = SITE_ROOT.parent
DATA_DIR = SITE_ROOT / "data"
ASSET_MINDMAP_DIR = SITE_ROOT / "assets" / "mindmap"


SOURCE_NAMES = {
    "word": "马克思主义基本原理丨2024.docx",
    "short_pdf": "马原简答题部分题库-202206.pdf",
    "choice_docx": "题库rk 带答案.docx",
    "mindmap_pptx": "马原思维导图.pptx",
    "utiku_pdf": "优题库马原纯享版.pdf",
    "utiku_answer_pdf": "优题库答案.pdf",
}


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ASSET_MINDMAP_DIR.mkdir(parents=True, exist_ok=True)


def find_source(name: str) -> Path:
    filename = SOURCE_NAMES[name]
    candidates = [
        PROJECT_ROOT / "source" / filename,
        PROJECT_ROOT / "sources" / filename,
        PROJECT_ROOT / filename,
    ]
    for path in candidates:
        if path.exists():
            return path
    raise FileNotFoundError(f"Cannot find source file: {filename}")


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def compact_spaces(text: str) -> str:
    text = text.replace("\u3000", " ")
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\s+\n", "\n", text)
    text = re.sub(r"\n\s+", "\n", text)
    text = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", text)
    return text.strip()


def clean_text(text: str) -> str:
    return compact_spaces(text).replace("\n", " ").strip()


def extract_docx_paragraphs(path: Path) -> list[dict]:
    """Read document.xml directly so text boxes and plain paragraphs use one path."""
    import xml.etree.ElementTree as ET

    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    paragraphs: list[dict] = []
    for para in root.findall(".//w:p", ns):
        text = "".join(t.text or "" for t in para.findall(".//w:t", ns)).strip()
        if not text:
            continue
        ppr = para.find("w:pPr", ns)
        numbered = False
        if ppr is not None and ppr.find("w:numPr", ns) is not None:
            numbered = True
        paragraphs.append(
            {
                "index": len(paragraphs),
                "text": clean_text(text),
                "numbered": numbered,
            }
        )
    return paragraphs


def source_manifest() -> list[dict]:
    rows = []
    for key, filename in SOURCE_NAMES.items():
        try:
            path = find_source(key)
            rows.append(
                {
                    "key": key,
                    "name": filename,
                    "found": True,
                    "path": str(path.relative_to(PROJECT_ROOT)),
                    "size": path.stat().st_size,
                }
            )
        except FileNotFoundError:
            rows.append({"key": key, "name": filename, "found": False})
    return rows


def normalize_for_match(text: str) -> str:
    text = re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]+", "", text)
    return text.lower()


def extract_keywords(text: str) -> list[str]:
    pieces = re.split(r"[^\u4e00-\u9fffA-Za-z0-9]+", text)
    known_terms = [
        "马克思主义",
        "物质",
        "意识",
        "实践",
        "认识",
        "真理",
        "价值",
        "矛盾",
        "联系",
        "发展",
        "生产力",
        "生产关系",
        "经济基础",
        "上层建筑",
        "人民群众",
        "商品",
        "劳动",
        "价值规律",
        "剩余价值",
        "资本",
        "社会主义",
        "共产主义",
    ]
    stop = {
        "什么",
        "为什么",
        "如何",
        "关系",
        "表现",
        "作用",
        "意义",
        "特点",
        "基本",
        "概念",
        "原因",
        "内容",
    }
    out: list[str] = []
    for term in known_terms:
        if term in text:
            out.append(term)
    for piece in pieces:
        piece = piece.strip()
        if len(piece) >= 2 and piece not in stop:
            out.append(piece)
    seen = set()
    deduped = []
    for item in out:
        key = normalize_for_match(item)
        if key and key not in seen:
            seen.add(key)
            deduped.append(item)
    return deduped[:18]


def auto_link_text(text: str, cards: list[dict], limit: int = 4) -> list[str]:
    query = normalize_for_match(text)
    keywords = extract_keywords(text)
    scored: list[tuple[int, str]] = []
    for card in cards:
        hay = normalize_for_match(card.get("searchText", ""))
        title = normalize_for_match(card.get("title", ""))
        score = 0
        if query and (query in title or title in query):
            score += 12
        elif query and query in hay:
            score += 8
        for kw in keywords:
            nkw = normalize_for_match(kw)
            if len(nkw) >= 2 and nkw in hay:
                score += 2
            if len(nkw) >= 2 and nkw in title:
                score += 3
        if score:
            scored.append((score, card["id"]))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [card_id for score, card_id in scored[:limit] if score >= 2]


def build_auto_links(
    cards: list[dict], short_questions: Iterable[dict], choice_questions: Iterable[dict], mindmap: dict
) -> dict:
    links: dict[str, list[str]] = {}
    for item in short_questions:
        ids = auto_link_text(item.get("title", ""), cards, limit=4)
        item["linkedCardIds"] = ids
        if ids:
            links[item["id"]] = ids
    for item in choice_questions:
        ids = auto_link_text(item.get("stem", "") or item.get("raw", ""), cards, limit=3)
        item["linkedCardIds"] = ids
        if ids:
            links[item["id"]] = ids
    for slide in mindmap.get("slides", []):
        for node in slide.get("nodes", []):
            ids = auto_link_text(node.get("text", ""), cards, limit=4)
            node["linkedCardIds"] = ids
            if ids:
                links[node["id"]] = ids
    return links
