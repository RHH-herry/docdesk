"""抽取器基类与数据结构。仅依赖标准库。"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Field:
    """一个被抽取的字段。"""

    label: str
    key: str
    value: str
    confidence: float = 0.0  # 0.0 - 1.0
    source: str = ""  # 该字段在原文中匹配到的来源行（用于对照校验）

    def to_dict(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "key": self.key,
            "value": self.value,
            "confidence": round(self.confidence, 2),
            "source": self.source,
        }


@dataclass
class ExtractResult:
    """一次抽取的结果。"""

    doc_type: str
    fields: list[Field] = field(default_factory=list)
    line_items: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "doc_type": self.doc_type,
            "fields": [f.to_dict() for f in self.fields],
            "line_items": self.line_items,
            "notes": self.notes,
        }


class Extractor:
    """抽取器接口。子类实现 ``extract``。"""

    name: str = "base"

    def extract(self, text: str, filename: str = "") -> ExtractResult:
        raise NotImplementedError


def first_match(pattern: str, text: str, flags: int = 0) -> str | None:
    """返回第一个正则匹配的非空捕获组。"""
    m = re.search(pattern, text, flags)
    if not m:
        return None
    for group in m.groups():
        if group:
            return group.strip()
    return m.group(0).strip()


def clean_number(raw: str) -> str:
    """把金额类字符串规整为纯数字(保留小数点与负号)。"""
    if not raw:
        return ""
    raw = raw.replace(",", "").replace("，", "")
    raw = re.sub(r"[^\d.\-]", "", raw)
    return raw
