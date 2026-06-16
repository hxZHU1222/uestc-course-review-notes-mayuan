from __future__ import annotations

from common import DATA_DIR, build_auto_links, ensure_dirs, source_manifest, write_json
from extract_choice_questions import main as extract_choices
from extract_mindmap import main as extract_mindmap
from extract_short_questions import main as extract_short
from extract_word import main as extract_word


def main() -> dict:
    ensure_dirs()
    cards, coverage = extract_word()
    short_questions = extract_short()
    choice_questions = extract_choices()
    mindmap = extract_mindmap()
    auto_links = build_auto_links(cards, short_questions, choice_questions, mindmap)

    write_json(DATA_DIR / "short_questions.json", short_questions)
    write_json(DATA_DIR / "choice_questions.json", choice_questions)
    write_json(DATA_DIR / "mindmap.json", mindmap)
    write_json(DATA_DIR / "auto_links.json", auto_links)
    manual_path = DATA_DIR / "manual_links.json"
    if not manual_path.exists():
        write_json(manual_path, {})
    write_json(DATA_DIR / "source_manifest.json", source_manifest())

    summary = {
        "reciteCards": len(cards),
        "wordTotalParagraphs": coverage["totalParagraphs"],
        "wordCoveredParagraphs": coverage["coveredParagraphs"],
        "wordUncoveredParagraphs": len(coverage["uncoveredParagraphs"]),
        "shortQuestions": len(short_questions),
        "choiceQuestions": len(choice_questions),
        "choiceParseFailures": sum(1 for q in choice_questions if q.get("parseError")),
        "mindmapPages": mindmap["pageCount"],
        "mindmapNodes": mindmap["nodeCount"],
        "autoLinks": len(auto_links),
    }
    write_json(DATA_DIR / "build_summary.json", summary)
    return summary


if __name__ == "__main__":
    summary = main()
    for key, value in summary.items():
        print(f"{key}: {value}")
