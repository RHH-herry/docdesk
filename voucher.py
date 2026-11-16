"""记账凭证生成 + 人民币金额大写。

把结构化单据转成可导入财务软件的借贷凭证：
  借 费用/采购科目（不含税金额）
  借 进项税科目（税额）
  贷 往来科目（价税合计）
每份单据生成一张凭证，并在服务端做借贷平衡校验。纯标准库实现。
"""
from __future__ import annotations

import csv
import io
import re

DIGITS = "零壹贰叁肆伍陆柒捌玖"
SMALL_UNITS = ("", "拾", "佰", "仟")
BIG_UNITS = ("", "万", "亿", "兆")

COLUMNS = {
    "general": ["凭证日期", "凭证字", "凭证号", "摘要", "科目名称",
                "借方金额", "贷方金额", "发票号", "往来单位", "制单人", "来源文件"],
    "yonyou": ["日期", "凭证类别", "凭证号", "摘要", "科目编码", "科目名称",
               "借方", "贷方", "票号", "供应商", "制单人", "来源文件"],
    "kingdee": ["日期", "凭证字", "凭证号", "摘要", "科目代码", "科目名称",
                "借方金额", "贷方金额", "核算项目", "制单人", "来源文件"],
}
FORMAT_NAMES = {"general": "通用凭证", "yonyou": "用友", "kingdee": "金蝶"}


def _group4(n: int) -> str:
    """把 0~9999 转成中文，内部零压缩。"""
    out, zero_pending = "", False
    for pos in range(3, -1, -1):
        v = (n // (10 ** pos)) % 10
        if v == 0:
            if out:
                zero_pending = True
        else:
            if zero_pending:
                out += "零"
                zero_pending = False
            out += DIGITS[v] + SMALL_UNITS[pos]
    return out


def rmb_upper(amount) -> str:
    """人民币金额中文大写，如 1130.00 -> 壹仟壹佰叁拾元整。"""
    try:
        raw = float(amount)
    except (TypeError, ValueError):
        return "—"
    neg = raw < 0
    cents_total = int(round(abs(raw) * 100))
    yuan, cents = divmod(cents_total, 100)
    out = ""
    if yuan == 0:
        out = "" if cents else DIGITS[0] + "元整"
    else:
        groups = []
        rest = yuan
        while rest > 0:
            groups.append(rest % 10000)
            rest //= 10000
        segs = []
        for gi in range(len(groups) - 1, -1, -1):
            seg = _group4(groups[gi])
            if seg:
                segs.append(seg + BIG_UNITS[gi])
            elif segs and not segs[-1].endswith("零"):
                segs.append("零")
        out = ("".join(segs).rstrip("零") or DIGITS[0]) + "元"
        if cents == 0:
            out += "整"
    if cents and yuan:
        jiao, fen = divmod(cents, 10)
        if jiao:
            out += DIGITS[jiao] + "角"
        elif fen:
            out += "零"
        if fen:
            out += DIGITS[fen] + "分"
        else:
            out += "整"
    elif cents and not yuan:
        jiao, fen = divmod(cents, 10)
        if jiao:
            out += DIGITS[jiao] + "角"
        if fen:
            out += DIGITS[fen] + "分"
    if neg:
        out = "负" + out
    return out


def _num(value) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    s = str(value).replace(",", "").replace("¥", "").replace("￥", "")
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group()) if m else 0.0


def _field(d: dict, *patterns) -> str:
    for f in d.get("fields") or []:
        label = str(f.get("label") or "")
        if any(re.search(p, label, re.I) for p in patterns):
            v = str(f.get("value") or "").strip()
            if v:
                return v
    return ""


def _match_rule(rules: list[dict], scope: str, text: str) -> dict | None:
    """科目映射规则匹配：首个命中的规则生效（关键词大小写不敏感）。"""
    for r in rules or []:
        if str(r.get("scope") or "").strip() != scope:
            continue
        kw = str(r.get("keyword") or "").strip().lower()
        if kw and kw in (text or "").lower():
            return {"code": str(r.get("code") or "").strip(),
                    "name": str(r.get("name") or "").strip()}
    return None


def _total(d: dict) -> float:
    v = _num(_field(d, r"合计|总额|价税"))
    if v > 0:
        return v
    return sum(_num(it.get("amount")) for it in (d.get("line_items") or []))


def _date(d: dict) -> str:
    raw = _field(d, r"日期|开票|签发|date")
    m = re.search(r"(\d{4})\D{0,2}(\d{1,2})\D{0,2}(\d{1,2})", raw)
    if m:
        return "%s-%02d-%02d" % (m.group(1), int(m.group(2)), int(m.group(3)))
    return raw[:20]


def build_voucher(results: list[dict], cfg: dict | None = None) -> dict:
    """生成凭证行 + 统计。cfg 可配置项见 README。

    科目映射（v1.3.0）：cfg["mapping_rules"] = [
        {"scope": "subject", "keyword": "高尔夫", "code": "660201", "name": "销售费用—业务宣传费"},
        {"scope": "party",   "keyword": "太湖",   "code": "220202", "name": "应付账款—太湖公司"},
    ]
    scope=subject 按明细名称/文件名/销售方匹配借方费用科目；
    scope=party   按往来单位匹配贷方科目。首个命中生效。
    """
    cfg = cfg or {}
    fmt = cfg.get("format") if cfg.get("format") in COLUMNS else "general"
    expense_default = str(cfg.get("expense") or "管理费用").strip()
    tax_acc = str(cfg.get("tax") or "应交税费—应交增值税（进项税额）").strip()
    payable_default = str(cfg.get("payable") or "应付账款").strip()
    expense_code = str(cfg.get("expense_code") or "").strip()
    tax_code = str(cfg.get("tax_code") or "").strip()
    payable_code = str(cfg.get("payable_code") or "").strip()
    date_override = str(cfg.get("date") or "").strip()
    memo_tpl = str(cfg.get("memo") or "{销售方} {发票号}").strip()
    maker = str(cfg.get("maker") or "").strip()
    voucher_word = str(cfg.get("word") or "记").strip()
    rules = [r for r in (cfg.get("mapping_rules") or []) if isinstance(r, dict)]

    rows, skipped = [], []
    for idx, d in enumerate(results, 1):
        total = round(_total(d), 2)
        if total <= 0:
            skipped.append(d.get("filename") or "结果")
            continue
        tax = round(_num(_field(d, r"税额|tax")), 2)
        if tax <= 0 or tax >= total:
            tax = 0.0
        net = round(total - tax, 2)
        invoice_no = _field(d, r"发票|单号|编号|号码")
        seller = _field(d, r"销售方|卖方|收款方|供货|供应商|单位")
        buyer = _field(d, r"购买方|买方|付款方|采购方")
        date = date_override or _date(d)
        memo = (memo_tpl.replace("{销售方}", seller or "—")
                        .replace("{发票号}", invoice_no or "—")
                        .replace("{文件名}", d.get("filename") or "—")
                        .replace("{购买方}", buyer or "—")).strip() or "单据入账"

        # 科目映射：subject 匹配明细/文件/往来文本，party 匹配往来单位
        item_names = " ".join(str(it.get("name") or "") for it in (d.get("line_items") or []))
        subject_text = " ".join([d.get("filename") or "", seller, buyer, item_names]).lower()
        party_text = " ".join([seller, buyer, d.get("filename") or ""]).lower()
        exp_rule = _match_rule(rules, "subject", subject_text)
        pay_rule = _match_rule(rules, "party", party_text)
        expense_name = (exp_rule or {}).get("name") or expense_default
        expense_use_code = (exp_rule or {}).get("code") or expense_code
        payable_name = (pay_rule or {}).get("name") or payable_default
        payable_use_code = (pay_rule or {}).get("code") or payable_code

        base = {"date": date, "word": voucher_word, "no": idx, "summary": memo,
                "invoiceNo": invoice_no, "party": seller or buyer, "maker": maker,
                "source": d.get("filename") or "结果", "accountCode": ""}
        if net > 0:
            rows.append(dict(base, account=expense_name, accountCode=expense_use_code,
                             debit=net, credit=0.0))
        if tax > 0:
            rows.append(dict(base, account=tax_acc, accountCode=tax_code,
                             debit=tax, credit=0.0))
        rows.append(dict(base, account=payable_name, accountCode=payable_use_code,
                         debit=0.0, credit=total))

    debit = round(sum(r["debit"] for r in rows), 2)
    credit = round(sum(r["credit"] for r in rows), 2)
    return {
        "rows": rows,
        "format": fmt,
        "columns": COLUMNS[fmt],
        "formatName": FORMAT_NAMES[fmt],
        "stats": {
            "documents": len(results),
            "used": len(results) - len(skipped),
            "lines": len(rows),
            "debit": debit,
            "credit": credit,
            "balanced": abs(debit - credit) < 0.01,
            "skipped": skipped,
            "upper": rmb_upper(credit),
        },
    }


def _cell(r: dict, col: str, fmt: str) -> str:
    mapping = {
        "凭证日期": "date", "日期": "date", "凭证字": "word", "凭证类别": "word",
        "凭证号": "no", "摘要": "summary", "科目编码": "accountCode",
        "科目代码": "accountCode", "科目名称": "account", "核算项目": "party",
        "票号": "invoiceNo", "发票号": "invoiceNo", "往来单位": "party",
        "供应商": "party", "制单人": "maker", "来源文件": "source",
    }
    if col in ("借方金额", "贷方金额", "借方", "贷方"):
        val = r["debit"] if col.startswith("借") else r["credit"]
        return "%.2f" % val if val else ""
    key = mapping.get(col)
    return str(r.get(key, "") if key else "")


def voucher_preview(bundle: dict, limit: int = 80) -> dict:
    """给前端预览用：按当前格式的中文列头返回单元格矩阵。"""
    return {
        "columns": bundle["columns"],
        "cells": [[_cell(r, c, bundle["format"]) for c in bundle["columns"]]
                  for r in bundle["rows"][:limit]],
    }


def voucher_csv(bundle: dict, bom: bool = True) -> bytes:
    buf = io.StringIO(newline="")
    w = csv.writer(buf)
    w.writerow(bundle["columns"])
    for r in bundle["rows"]:
        w.writerow([_cell(r, c, bundle["format"]) for c in bundle["columns"]])
    text = ("\ufeff" if bom else "") + buf.getvalue()
    return text.encode("utf-8")
