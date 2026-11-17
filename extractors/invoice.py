"""规则化发票 / 单据抽取器。

纯标准库实现,不依赖任何外部服务或模型,零成本、可离线运行。
覆盖中英文发票常见字段:发票号、日期、金额、税额、买卖方、税号等,
并尽力解析表格化的明细行。每个字段与明细行都会记录其在**原文中的来源行**,
供前端做对照校验(让用户核对抽取结果是否可信)。
"""

from __future__ import annotations

import re

from .base import ExtractResult, Extractor, Field, clean_number, first_match


class InvoiceExtractor(Extractor):
    name = "invoice-rules"

    def extract(self, text: str, filename: str = "") -> ExtractResult:
        text = text or ""
        fields: list[Field] = []

        # 文档类型判断
        doc_type = "通用单据"
        if re.search(r"发票|invoice", text, re.IGNORECASE):
            doc_type = "发票 / Invoice"
        elif re.search(r"合同|contract|agreement", text, re.IGNORECASE):
            doc_type = "合同 / Contract"
        elif re.search(r"单据|receipt|凭证|清单", text, re.IGNORECASE):
            doc_type = "单据 / Receipt"

        # 发票号
        fields.append(self._field(
            r"(?:发票号码|发票号|invoice\s*(?:no|number|#)?)\s*[:：]?\s*([A-Za-z0-9\-]{6,})",
            text, "发票号码", "invoice_no", 0.92, re.IGNORECASE))
        # 日期
        fields.append(self._field(
            r"(?:开票日期|日期|签发日期|issue\s*date|date)\s*[:：]?\s*"
            r"(\d{4}\s*[-/年.]\s*\d{1,2}\s*[-/月.]\s*\d{1,2})",
            text, "日期", "date", 0.85, re.IGNORECASE))
        # 价税合计 / 总金额
        # 中文发票常见格式：「价税合计（大写）…（小写）¥2120.00」，
        # 大写金额夹在中间会打断普通正则，故先单独匹配「（小写）」后的金额。
        total_field = self._field(
            r"(?:价税合计|合计金额|总金额|总计|金额合计|grand\s*total|total\s*amount|"
            r"amount\s*due|total\s*due|total)\s*[:：]?\s*[¥$￥]?\s*([\d,]+\.\d{2})",
            text, "价税合计", "total", 0.9, re.IGNORECASE)
        if total_field is None:
            total_field = self._field(
                r"[(（]?\s*小写\s*[)）]?\s*[¥￥$]?\s*([\d,]+\.\d{2})",
                text, "价税合计", "total", 0.88, re.IGNORECASE)
        fields.append(total_field)
        # 税额
        fields.append(self._field(
            r"(?:税额|增值税额|tax\s*amount|vat)\s*[:：]?\s*[¥$￥]?\s*([\d,]+\.\d{2})",
            text, "税额", "tax", 0.85, re.IGNORECASE))
        # 税率
        fields.append(self._field(
            r"(?:税率|tax\s*rate)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?\s*%)", text, "税率", "tax_rate", 0.8))
        # 销售方
        fields.append(self._field(
            r"(?:销售方|卖方|销货单位|售方|seller|vendor|company|issued\s*by)\s*[:：]?\s*([^\n]{2,40}?)(?:\n|$)",
            text, "销售方", "seller", 0.7, re.IGNORECASE))
        # 购买方
        fields.append(self._field(
            r"(?:购买方|买方|购货单位|购方|buyer|customer|bill\s*to|billed\s*to)\s*[:：]?\s*([^\n]{2,40}?)(?:\n|$)",
            text, "购买方", "buyer", 0.7, re.IGNORECASE))
        # 税号
        fields.append(self._field(
            r"(?:纳税人识别号|统一社会信用代码|税号|tax\s*id|taxpayer\s*id)\s*[:：]?\s*([A-Za-z0-9]{15,20})",
            text, "税号", "tax_id", 0.88, re.IGNORECASE))
        # 银行账号
        fields.append(self._field(
            r"(?:账号|银行账号|account\s*(?:no|number)?)\s*[:：]?\s*([0-9]{10,25})",
            text, "银行账号", "bank_account", 0.85, re.IGNORECASE))
        # 不含税金额（须在「价税合计」之外单独识别，供凭证拆分借贷）
        fields.append(self._field(
            r"(?:不含税金额|金额合计|净额|un taxed|net\s*amount|amount\s*excl)\s*[:：]?\s*[¥$￥]?\s*([\d,]+\.\d{2})",
            text, "不含税金额", "net_amount", 0.82, re.IGNORECASE))
        # 发票代码（旧版发票 10/12 位）
        fields.append(self._field(
            r"(?:发票代码|invoice\s*code)\s*[:：]?\s*(\d{10,12})",
            text, "发票代码", "invoice_code", 0.9, re.IGNORECASE))
        # 校验码（末尾 20 位）
        fields.append(self._field(
            r"(?:校验码|check\s*code)\s*[:：]?\s*([0-9 ]{20,25})",
            text, "校验码", "check_code", 0.8, re.IGNORECASE))
        # 开票人
        fields.append(self._field(
            r"(?:开票人|drawer|issued\s*by|开票员)\s*[:：]?\s*([^\n，,]{2,20})",
            text, "开票人", "drawer", 0.72, re.IGNORECASE))
        # 备注
        fields.append(self._field(
            r"(?:备注|remark|note)\s*[:：]\s*([^\n]{2,80})",
            text, "备注", "remark", 0.7, re.IGNORECASE))

        fields = [f for f in fields if f is not None]

        # 明细行
        line_items = self._parse_line_items(text)

        notes: list[str] = []
        if not fields:
            notes.append("未识别到结构化字段,可能是图片型 PDF 或非常规版式,建议启用本地解析引擎。")
        if not line_items:
            notes.append("未解析到表格明细行。")

        return ExtractResult(
            doc_type=doc_type,
            fields=fields,
            line_items=line_items,
            notes=notes,
        )

    def _field(self, pattern, text, label, key, confidence, flags=0) -> Field | None:
        """按正则抽取一个字段,并捕获其来源行。抽不到返回 None。"""
        m = re.search(pattern, text, flags)
        if not m:
            return None
        val = None
        for g in m.groups():
            if g:
                val = g.strip()
                break
        if val is None:
            val = m.group(0).strip()
        source = self._line_at(text, m.start())
        return Field(label, key, val, confidence, source=source)

    @staticmethod
    def _line_at(text: str, pos: int) -> str:
        """返回 text 中 pos 所在的那一行(用于对照高亮)。"""
        if pos < 0 or pos > len(text):
            return ""
        start = text.rfind("\n", 0, pos) + 1
        end = text.find("\n", pos)
        if end == -1:
            end = len(text)
        return text[start:end].strip()

    @staticmethod
    def _parse_line_items(text: str) -> list[dict]:
        items: list[dict] = []
        pattern = re.compile(
            r"([\u4e00-\u9fffA-Za-z0-9\/\-\u3000-\u303f\uff00-\uffef]{2,30})"
            r"\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"
        )
        for m in pattern.finditer(text):
            name, qty, price, amount = m.groups()
            line = InvoiceExtractor._line_at(text, m.start())
            items.append({
                "name": name.strip(),
                "qty": clean_number(qty),
                "unit_price": clean_number(price),
                "amount": clean_number(amount),
                "source": line,
            })
        # 去重(按名称+金额)
        seen = set()
        unique = []
        for it in items:
            key = (it["name"], it["amount"])
            if key not in seen:
                seen.add(key)
                unique.append(it)
        return unique[:50]
