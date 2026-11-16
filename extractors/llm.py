"""可选:基于本地 Ollama 的通用单据抽取器。

仅在用户本地运行了 Ollama 并拉取了模型(如 qwen2.5)时才可用,
调用本机 11434 端口,不向外发送任何数据 —— 零云端成本、隐私友好。
依赖标准库 urllib,无需额外安装 requests。
"""

from __future__ import annotations

import json
import urllib.request

from .base import ExtractResult, Extractor, Field

DEFAULT_MODEL = "qwen2.5:7b"
OLLAMA_URL = "http://localhost:11434/api/generate"

PROMPT = (
    "你是一个票据/单据信息抽取引擎。从下面的单据文本中抽取结构化字段,"
    "只输出一个 JSON 对象,字段包括:doc_type, invoice_no, date, total, tax, "
    "tax_rate, seller, buyer, tax_id, bank_account, line_items(数组,每项含 "
    "name/qty/unit_price/amount)。没有的字段填空字符串。不要输出任何解释。\n\n"
    "文本:\n<<<\n{text}\n>>>"
)


class OllamaExtractor(Extractor):
    name = "ollama"

    def __init__(self, model: str = DEFAULT_MODEL, url: str = OLLAMA_URL):
        self.model = model
        self.url = url

    def available(self) -> bool:
        try:
            req = urllib.request.Request(self.url.replace("/generate", ""), method="GET")
            with urllib.request.urlopen(req, timeout=2) as resp:
                return resp.status == 200
        except Exception:
            return False

    def extract(self, text: str, filename: str = "") -> ExtractResult:
        payload = {
            "model": self.model,
            "prompt": PROMPT.format(text=(text or "")[:6000]),
            "format": "json",
            "stream": False,
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.url, data=data, headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                out = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # 本地模型不可用
            return ExtractResult(
                doc_type="通用单据",
                fields=[],
                notes=[f"本地 Ollama 调用失败: {exc}。可改用规则抽取器。"],
            )

        raw = out.get("response", "")
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return ExtractResult(
                doc_type="通用单据",
                fields=[],
                notes=["Ollama 返回内容不是合法 JSON,请检查模型输出格式。"],
            )

        fields = [
            Field(label, key, str(value), 0.95)
            for key, label in [
                ("invoice_no", "发票号码"),
                ("date", "日期"),
                ("total", "价税合计"),
                ("tax", "税额"),
                ("tax_rate", "税率"),
                ("seller", "销售方"),
                ("buyer", "购买方"),
                ("tax_id", "税号"),
                ("bank_account", "银行账号"),
            ]
            if (value := data.get(key))
        ]
        return ExtractResult(
            doc_type=data.get("doc_type", "通用单据"),
            fields=fields,
            line_items=data.get("line_items", []),
            notes=[],
        )
