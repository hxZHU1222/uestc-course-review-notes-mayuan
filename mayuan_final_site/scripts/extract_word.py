from __future__ import annotations

import re

from common import DATA_DIR, clean_text, ensure_dirs, extract_docx_paragraphs, find_source, write_json


MAJOR_CHAPTERS = [
    "导论",
    "世界的物质性及发展规律（辩证唯物主义）",
    "实践与认识及其发展规律（认识论）",
    "人类社会及其发展规律（历史唯物主义）",
    "资本主义的本质及规律",
    "社会主义的发展及其规律",
    "共产主义崇高理想及其最终实现",
]


def is_chinese_number_heading(text: str) -> bool:
    return bool(re.match(r"^[一二三四五六七八九十]+、", text))


def is_sentence_like(text: str) -> bool:
    if text.endswith(("。", "；")):
        return True
    if len(text) > 22 and any(mark in text for mark in "，；。"):
        return True
    if len(text) > 34 and "：" in text:
        return True
    return False


def is_title_candidate(row: dict) -> bool:
    text = row["text"]
    if row.get("numbered"):
        return False
    if text in MAJOR_CHAPTERS:
        return True
    if is_chinese_number_heading(text):
        return True
    if "⭐" in text:
        return True
    if text.endswith(("：", ":")) and len(text) <= 20:
        return True
    if len(text) <= 32 and not is_sentence_like(text):
        return True
    return False


def infer_level(texts: list[str]) -> str:
    stars = sum(text.count("⭐") for text in texts)
    if stars >= 2:
        return "A"
    if stars == 1:
        return "B"
    return "C"


def strip_stars(text: str) -> str:
    return clean_text(text.replace("⭐", ""))


def chapter_for_card(header_lines: list[str], title: str, fallback: str) -> str:
    for item in reversed(header_lines):
        cleaned = strip_stars(item)
        if cleaned in MAJOR_CHAPTERS:
            return cleaned
        if not is_chinese_number_heading(cleaned) and len(cleaned) > 4:
            return cleaned
    if title in MAJOR_CHAPTERS:
        return title
    return fallback


def build_cards(paragraphs: list[dict]) -> tuple[list[dict], dict]:
    cards: list[dict] = []
    current: dict | None = None
    latest_chapter = "导论"

    def close_current() -> None:
        nonlocal current, latest_chapter
        if not current:
            return
        title = strip_stars(current["title"])
        bullets = [strip_stars(x) for x in current["bullets"] if strip_stars(x)]
        if not bullets and current["header_lines"]:
            bullets = [strip_stars(x) for x in current["header_lines"] if strip_stars(x) != title]
        if not bullets:
            bullets = [title]
        all_texts = [current["title"], *current["header_lines"], *current["bullets"]]
        chapter = chapter_for_card(current["header_lines"], title, latest_chapter)
        if title in MAJOR_CHAPTERS:
            latest_chapter = title
        if chapter in MAJOR_CHAPTERS:
            latest_chapter = chapter
        card = {
            "id": f"K{len(cards) + 1:04d}",
            "title": title,
            "chapter": chapter,
            "day": (len(cards) // 15) + 1,
            "level": infer_level(all_texts),
            "kind": "背诵知识点",
            "sourceStart": current["sourceStart"],
            "sourceEnd": current["sourceEnd"],
            "bullets": bullets,
        }
        card["searchText"] = "\n".join([card["title"], *card["bullets"]])
        cards.append(card)
        current = None

    for row in paragraphs:
        text = row["text"]
        if is_title_candidate(row):
            if current is None:
                current = {
                    "title": text,
                    "header_lines": [],
                    "bullets": [],
                    "sourceStart": row["index"],
                    "sourceEnd": row["index"],
                }
            elif current["bullets"]:
                close_current()
                current = {
                    "title": text,
                    "header_lines": [],
                    "bullets": [],
                    "sourceStart": row["index"],
                    "sourceEnd": row["index"],
                }
            else:
                current["header_lines"].append(current["title"])
                current["title"] = text
                current["sourceEnd"] = row["index"]
        else:
            if current is None:
                current = {
                    "title": latest_chapter,
                    "header_lines": [],
                    "bullets": [],
                    "sourceStart": row["index"],
                    "sourceEnd": row["index"],
                }
            current["bullets"].append(text)
            current["sourceEnd"] = row["index"]

    close_current()

    covered = set()
    coverage_cards = []
    for card in cards:
        rng = range(card["sourceStart"], card["sourceEnd"] + 1)
        covered.update(rng)
        coverage_cards.append(
            {
                "cardId": card["id"],
                "title": card["title"],
                "sourceStart": card["sourceStart"],
                "sourceEnd": card["sourceEnd"],
            }
        )
    uncovered = [row for row in paragraphs if row["index"] not in covered]
    report = {
        "totalParagraphs": len(paragraphs),
        "coveredParagraphs": len(paragraphs) - len(uncovered),
        "uncoveredParagraphs": [{"index": row["index"], "text": row["text"]} for row in uncovered],
        "cards": coverage_cards,
        "notes": [
            "源文件实际位于 source/，脚本同时兼容 source/、sources/ 和项目根目录。",
            "连续章节标题会计入相邻卡片覆盖范围，避免遗漏；卡片标题仍使用知识点标题。",
        ],
    }
    return cards, report


def main() -> tuple[list[dict], dict]:
    ensure_dirs()
    paragraphs = extract_docx_paragraphs(find_source("word"))
    raw = [{"index": row["index"], "text": row["text"]} for row in paragraphs]
    cards, report = build_cards(paragraphs)
    write_json(DATA_DIR / "raw_word_paragraphs.json", raw)
    write_json(DATA_DIR / "recite_cards.json", cards)
    write_json(DATA_DIR / "coverage_report.json", report)
    return cards, report


if __name__ == "__main__":
    cards, report = main()
    print(f"recite_cards={len(cards)}")
    print(f"coverage={report['coveredParagraphs']}/{report['totalParagraphs']}")
