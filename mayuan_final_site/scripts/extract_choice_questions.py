from __future__ import annotations

import re

from common import DATA_DIR, clean_text, ensure_dirs, extract_docx_paragraphs, find_source, write_json


def split_blocks(paragraphs: list[dict]) -> list[list[str]]:
    blocks: list[list[str]] = []
    current: list[str] = []
    for row in paragraphs:
        text = row["text"]
        if re.match(r"^\[\s*\d+\s*\]", text):
            if current:
                blocks.append(current)
            current = [text]
        elif current:
            current.append(text)
    if current:
        blocks.append(current)
    return blocks


def parse_block(block: list[str]) -> dict:
    raw = "\n".join(block)
    header = block[0]
    meta = re.match(r"^\[\s*(\d+)\s*\]\s*章节[:：]\s*(.*?)\s*难度[:：]\s*([^\s]+)", header)
    number = int(meta.group(1)) if meta else len(block)
    chapter = clean_text(meta.group(2)) if meta else ""
    difficulty = clean_text(meta.group(3)) if meta else ""
    body = "\n".join(block[1:])

    first_option = re.search(r"(?:^|\n)A[:：]", body)
    stem = clean_text(body[: first_option.start()] if first_option else body)
    options: dict[str, str] = {}
    for letter in "ABCD":
        pattern = rf"(?:^|\n){letter}[:：]\s*(.*?)(?=\n[A-D][:：]|\n正确答案[:：]|$)"
        opt = re.search(pattern, body, re.S)
        if opt:
            options[letter] = clean_text(opt.group(1))
    answer_match = re.search(r"正确答案[:：]\s*([A-D]+)", raw, re.I)
    answer = answer_match.group(1).upper() if answer_match else ""
    parse_errors = []
    if not meta:
        parse_errors.append("meta")
    if not stem:
        parse_errors.append("stem")
    if len(options) < 4:
        parse_errors.append("options")
    if not answer:
        parse_errors.append("answer")
    return {
        "id": f"Q{number:04d}",
        "number": number,
        "chapter": chapter,
        "difficulty": difficulty,
        "stem": stem,
        "options": options,
        "answer": answer,
        "raw": raw,
        "linkedCardIds": [],
        "parseError": bool(parse_errors),
        "parseErrorFields": parse_errors,
    }


def main() -> list[dict]:
    ensure_dirs()
    paragraphs = extract_docx_paragraphs(find_source("choice_docx"))
    questions = [parse_block(block) for block in split_blocks(paragraphs)]
    write_json(DATA_DIR / "choice_questions.json", questions)
    return questions


if __name__ == "__main__":
    questions = main()
    failed = sum(1 for q in questions if q["parseError"])
    print(f"choice_questions={len(questions)} failed={failed}")
