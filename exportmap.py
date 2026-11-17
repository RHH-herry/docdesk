"""客户模板导出：把结构化结果按客户 ERP 导入列映射导出 CSV / Excel。

列映射格式（前端存的模板）：
    {"header": "发票号码", "source": "发票号码", "fixed": ""}
    {"header": "部门编码", "source": "", "fixed": "BM01"}

source 规则：
  - 以 @ 开头为特殊值：@filename / @doc_type / @reviewed / @total / @net /
    @tax / @li_sum / @invoice_no / @seller / @buyer / @date / @upper /
    @case.name / @case.entity / @case.taxId / @case.period / @case.reviewer /
    @audit_count / @field:字段名
  - 普通文本按字段名做「完全匹配优先 → 子串匹配」查找
纯标准库 + openpyxl，数据不出本机。
"""
from __future__ import annotations

import csv
import io
import re

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from voucher import rmb_upper

NUMERIC_TOKENS = {"@total", "@net", "@tax", "@li_sum"}
HEADER_FILL = PatternFill("solid", fgColor="E9F2EF")
HEADER_FONT = Font(bold=True, color="0A574B")


def _num(value) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    m = re.search(r"-?\d+(?:\.\d+)?", str(value).replace(",", "").replace("¥", ""))
    return float(m.group()) if m else 0.0


def field_value(d: dict, label: str) -> str:
    """字段名精确匹配优先，其次子串匹配；返回首个非空值。"""
    fields = [f for f in (d.get("fields") or []) if isinstance(f, dict)]
    key = (label or "").strip().lower()
    if not key:
        return ""
    for f in fields:
        if str(f.get("label") or "").strip().lower() == key:
            return str(f.get("value") or "").strip()
    for f in fields:
        if key in str(f.get("label") or "").lower():
            v = str(f.get("value") or "").strip()
            if v:
                return v
    return ""


def match_field(d: dict, pattern: str) -> str:
    """按正则匹配字段名，取首个非空值（用于特殊 token）。"""
    for f in (d.get("fields") or []):
        if not isinstance(f, dict):
            continue
        if re.search(pattern, str(f.get("label") or ""), re.I):
            v = str(f.get("value") or "").strip()
            if v:
                return v
    return ""


def guess_source(header: str) -> str:
    """客户表头 → 推荐取值来源，供导入模板后自动匹配。"""
    h = (header or "").strip()
    if not h:
        return ""
    rules = [
        (r"发票代码|invoice.?code", "@field:发票代码"),
        (r"校验码|check.?code", "@field:校验码"),
        (r"开票人|开票员|drawer", "@field:开票人"),
        (r"发票号|票号|单据号|单号|编号|invoice.?no", "@invoice_no"),
        (r"销售方|供应商|卖方|收款方|往来单位", "@seller"),
        (r"购买方|买方|付款方|客户", "@buyer"),
        (r"日期|开票日|date", "@date"),
        (r"价税合计|含税金额|合计金额|total", "@total"),
        (r"税额|进项税|增值税", "@tax"),
        (r"大写", "@upper"),
        (r"不含税|净额|金额(?!合计)|net", "@net"),
        (r"文件名|来源文件", "@filename"),
        (r"单据类型|类型", "@doc_type"),
        (r"复核|审核状态", "@reviewed"),
        (r"会计期间|期间", "@case.period"),
        (r"我方主体|公司|主体", "@case.entity"),
        (r"税号|纳税人识别号", "@case.taxId"),
        (r"复核人|制单人", "@case.reviewer"),
        (r"案卷|客户名称", "@case.name"),
    ]
    for pattern, token in rules:
        if re.search(pattern, h, re.I):
            return token
    # 未命中特殊值：把客户表头本身当作单据字段名（前端可再手动调整）
    return h


def resolve_cell(d: dict, spec: dict, case: dict, audit_count: int = 0):
    fixed = str((spec or {}).get("fixed") or "").strip()
    if fixed:
        return fixed
    src = str((spec or {}).get("source") or "").strip()
    if not src:
        return ""
    if src.startswith("@field:"):
        return field_value(d, src[7:])
    if src.startswith("@case."):
        key = src[6:]
        return str(case.get(key) or "")
    if src in ("@filename", "@file"):
        return str(d.get("filename") or "")
    if src == "@doc_type":
        return str(d.get("doc_type") or "")
    if src == "@reviewed":
        return "已复核" if d.get("reviewed") else "待复核"
    if src == "@audit_count":
        return audit_count
    if src == "@invoice_no":
        return match_field(d, r"发票号|单号|编号|号码")
    if src == "@seller":
        return match_field(d, r"销售方|卖方|收款方|供货|供应商")
    if src == "@buyer":
        return match_field(d, r"购买方|买方|付款方|采购方")
    if src == "@date":
        return match_field(d, r"日期|开票|签发")
    if src == "@upper":
        total = _num(next((f.get("value") for f in (d.get("fields") or [])
                           if isinstance(f, dict) and re.search(
                               r"合计|总额|价税", str(f.get("label") or ""))), 0))
        return rmb_upper(total)
    if src in NUMERIC_TOKENS:
        total = _num(next((f.get("value") for f in (d.get("fields") or [])
                           if isinstance(f, dict) and re.search(
                               r"合计|总额|价税", str(f.get("label") or ""))), 0))
        tax = _num(field_value(d, "税额"))
        li_sum = sum(_num(it.get("amount")) for it in (d.get("line_items") or [])
                     if isinstance(it, dict))
        if src == "@total":
            return round(total or li_sum + tax, 2)
        if src == "@tax":
            return round(tax, 2)
        if src == "@li_sum":
            return round(li_sum, 2)
        return round(total - tax if total and tax else (li_sum or total), 2)
    if src.startswith("@"):
        return ""
    return field_value(d, src)


def build_table(results: list[dict], case: dict, columns: list[dict],
                audit: list[dict] | None = None) -> tuple[list[str], list[list]]:
    cols = [c for c in (columns or []) if isinstance(c, dict) and str(c.get("header") or "").strip()]
    headers = [str(c.get("header")).strip() for c in cols]
    n_audit = len([a for a in (audit or []) if isinstance(a, dict)])
    rows = [[resolve_cell(d, c, case, n_audit) for c in cols]
            for d in (results or []) if isinstance(d, dict)]
    return headers, rows


def custom_csv(results: list[dict], case: dict, columns: list[dict],
               audit: list[dict] | None = None, bom: bool = True) -> bytes:
    headers, rows = build_table(results, case, columns, audit)
    buf = io.StringIO(newline="")
    w = csv.writer(buf)
    w.writerow(headers)
    for row in rows:
        w.writerow([("%.2f" % v) if isinstance(v, float) else v for v in row])
    return (("\ufeff" if bom else "") + buf.getvalue()).encode("utf-8")


def custom_xlsx(results: list[dict], case: dict, columns: list[dict],
                audit: list[dict] | None = None, total_row: bool = False) -> bytes:
    headers, rows = build_table(results, case, columns, audit)
    wb = Workbook()
    ws = wb.active
    ws.title = "客户模板"
    ws.append(headers)
    for row in rows:
        ws.append(row)
    if total_row and rows:
        sums = []
        for i, h in enumerate(headers):
            vals = [r[i] for r in rows if isinstance(r[i], (int, float)) and not isinstance(r[i], bool)]
            sums.append(round(sum(vals), 2) if vals else "")
        ws.append(["合计" if i == 0 else v for i, v in enumerate(sums)])
        for cell in ws[ws.max_row]:
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
    for cell in ws[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center")
    for i, h in enumerate(headers, 1):
        width = min(38, max(12, len(str(h)) * 2 + 6))
        ws.column_dimensions[get_column_letter(i)].width = width
        if any(isinstance(r[i - 1], (int, float)) and not isinstance(r[i - 1], bool) for r in rows):
            for ri in range(2, ws.max_row + 1):
                ws.cell(ri, i).number_format = "0.00"
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = "A1:%s%d" % (get_column_letter(len(headers)), ws.max_row)
    bio = io.BytesIO()
    wb.save(bio)
    return bio.getvalue()
