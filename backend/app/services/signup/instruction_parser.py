"""
Parse instruction file (CSV hoặc TXT) thành "field rules" cho LLM agent đọc.

Hỗ trợ:
- CSV format chuẩn của team (cột: STT, Câu hỏi, Phân loại, Trả lời, VD thực tế…)
- TXT thuần — coi như free-form prompt, return as-is.
"""

from __future__ import annotations

import csv
import io
import logging
from typing import Any

logger = logging.getLogger(__name__)


def parse_instruction_text(content: str, filename: str = "") -> dict:
    """Trả về {kind: 'csv'|'text', rules: list[dict], raw: str}."""
    content = content or ""
    is_csv = filename.lower().endswith(".csv") or _looks_like_csv(content)
    if not is_csv:
        return {"kind": "text", "rules": [], "raw": content.strip()}
    rules = _parse_csv_rules(content)
    return {"kind": "csv", "rules": rules, "raw": content.strip()}


def _looks_like_csv(content: str) -> bool:
    head = content[:500]
    return "," in head and ("Câu hỏi" in head or "Question" in head or "Field" in head)


def _parse_csv_rules(content: str) -> list[dict]:
    rules: list[dict] = []
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    if not rows:
        return rules
    header = [c.strip().lower() for c in rows[0]]
    # Cố gắng map theo header tiếng Việt hoặc Anh
    col_q = _find_col(header, ["câu hỏi", "question", "field"])
    col_req = _find_col(header, ["phân loại", "required", "classification"])
    col_sample = _find_col(header, ["vd thực tế trả lời đã được duyệt", "vd", "ví dụ", "sample", "example"])
    col_note = _find_col(header, ["note", "ghi chú"])

    if col_q < 0:
        # Header không nhận diện được → fallback dùng row đầu là dữ liệu
        start = 0
    else:
        start = 1

    for row in rows[start:]:
        if not row or all(not c.strip() for c in row):
            continue
        # padding
        while len(row) < max(col_q, col_req, col_sample, col_note) + 1:
            row.append("")
        field = (row[col_q] if col_q >= 0 else (row[1] if len(row) > 1 else "")).strip()
        if not field:
            continue
        required = (row[col_req] if col_req >= 0 and col_req < len(row) else "").strip()
        sample = (row[col_sample] if col_sample >= 0 and col_sample < len(row) else "").strip()
        note = (row[col_note] if col_note >= 0 and col_note < len(row) else "").strip()
        rules.append({
            "field": field,
            "required": required,
            "sample": sample,
            "note": note,
        })
    return rules


def _find_col(header: list[str], keywords: list[str]) -> int:
    for i, h in enumerate(header):
        for kw in keywords:
            if kw in h:
                return i
    return -1


def build_field_rules_block(parsed: dict) -> str:
    """Build text block (Vietnamese) để nhúng vào prompt cho LLM agent."""
    if not parsed:
        return ""
    if parsed.get("kind") == "text":
        return parsed.get("raw", "").strip()
    rules = parsed.get("rules") or []
    if not rules:
        return ""
    lines = ["### Quy tắc điền form (do team quy định):"]
    for r in rules:
        parts = [f"- **{r['field']}**"]
        if r.get("required"):
            parts.append(f"({r['required']})")
        if r.get("sample"):
            parts.append(f"→ ví dụ giá trị duyệt: `{r['sample']}`")
        if r.get("note"):
            parts.append(f"[note: {r['note']}]")
        lines.append(" ".join(parts))
    return "\n".join(lines)
