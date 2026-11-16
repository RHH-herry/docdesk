"""文档智能台 - 抽取引擎包。

暴露两个抽取器:
- InvoiceExtractor : 纯规则 / 正则启发式,零依赖、零成本、离线可用
- OllamaExtractor  : 可选,调用本地 Ollama 模型做通用单据抽取(需本地跑 Ollama)
"""

from .base import ExtractResult, Extractor
from .invoice import InvoiceExtractor
from .llm import OllamaExtractor

__all__ = ["Extractor", "ExtractResult", "InvoiceExtractor", "OllamaExtractor"]
