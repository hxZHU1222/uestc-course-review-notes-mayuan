from __future__ import annotations

import re

from common import DATA_DIR, clean_text, ensure_dirs, find_source, write_json


def chapter_for_number(number: int) -> str:
    if number <= 3:
        return "导论"
    if number <= 15:
        return "第一章 世界的物质性及发展规律"
    if number <= 34:
        return "第二章 实践与认识及其发展规律"
    if number <= 49:
        return "第三章 人类社会及其发展规律"
    return "第四章 资本主义的本质及规律"


def extract_pdf_text(path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def parse_short_questions(text: str) -> list[dict]:
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"(?<!\d)(\d{1,2})\.\s*", r"\n\1. ", text)
    matches = list(re.finditer(r"(?:^|\n)(\d{1,2})\.\s*(.*?)(?=\n\d{1,2}\.\s*|$)", text, re.S))
    questions: list[dict] = []
    for match in matches:
        number = int(match.group(1))
        if not 1 <= number <= 61:
            continue
        block = clean_text(match.group(2))
        page_match = re.search(r"P\s*(\d+)", block, re.I)
        page_hint = f"P{page_match.group(1)}" if page_match else ""
        exams = re.findall(r"【([^】]+)】", block)
        exam_years: list[str] = []
        for item in exams:
            exam_years.extend([part.strip() for part in re.split(r"[、,，]", item) if part.strip()])
        title = re.sub(r"P\s*\d+", "", block, flags=re.I)
        title = re.sub(r"【[^】]+】", "", title)
        title = clean_text(title)
        questions.append(
            {
                "id": f"SQ{number:03d}",
                "number": number,
                "title": title,
                "pageHint": page_hint,
                "examYears": exam_years,
                "chapter": chapter_for_number(number),
                "level": "A" if exam_years else "B",
                "linkedCardIds": [],
            }
        )
    questions.sort(key=lambda x: x["number"])
    return questions[:61]


def main() -> list[dict]:
    ensure_dirs()
    questions = parse_short_questions(extract_pdf_text(find_source("short_pdf")))
    write_json(DATA_DIR / "short_questions.json", questions)
    return questions


if __name__ == "__main__":
    questions = main()
    print(f"short_questions={len(questions)}")
