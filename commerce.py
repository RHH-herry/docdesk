"""商业化经营层：客户 / 案卷 / 工作量 / 计费汇总与对账单生成。

设计原则：
  - 纯本地计算，不联网；标准库 + openpyxl（与导出模块共用同一依赖）
  - 不改动单据抽取逻辑，只消费工作区里已有的 documents / audit / case
  - 所有金额口径统一：单据金额取「价税合计」，缺失才回退明细合计
"""
from __future__ import annotations

import csv
import io
import re

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

CASE_STATUS = {
    "active": "进行中",
    "review": "待复核",
    "delivered": "已交付",
    "archived": "已归档",
}
BILLING = {
    "per_doc": "按张计费",
    "monthly": "按月计费",
    "project": "项目计费",
}

HEADER_FILL = PatternFill("solid", fgColor="E9F2EF")
HEADER_FONT = Font(bold=True, color="0A574B")
TOTAL_FILL = PatternFill("solid", fgColor="F4F8F7")


def _list(value) -> list[dict]:
    return [x for x in (value or []) if isinstance(x, dict)]


def _num(value) -> float:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    m = re.search(r"-?\d+(?:\.\d+)?", str(value or "").replace(",", "").replace("¥", ""))
    return float(m.group()) if m else 0.0


def doc_amount(data: dict) -> float:
    """单据金额：价税合计优先，其次合计/总额，最后明细合计。"""
    fields = _list((data or {}).get("fields"))
    for pattern in (r"价税合计", r"合计|总额|金额"):
        hit = next((f for f in fields
                    if re.search(pattern, str(f.get("label") or ""), re.I)), None)
        if hit:
            v = _num(hit.get("value"))
            if v:
                return v
    return round(sum(_num(it.get("amount")) for it in _list((data or {}).get("line_items"))), 2)


def effective_cases(ws: dict) -> list[dict]:
    """兼容旧工作区：没有 cases 数组时，用当前 case 合成一个案卷。"""
    cases = [dict(c) for c in _list(ws.get("cases"))]
    current = ws.get("case") or {}
    active_id = str(ws.get("activeCaseId") or "")
    known = {str(c.get("id") or "") for c in cases}
    if current and active_id not in known:
        c = dict(current)
        c.setdefault("id", active_id or "case-active")
        c.setdefault("clientId", "")
        c.setdefault("period", str(current.get("period") or ""))
        c.setdefault("status", "active")
        cases.append(c)
    return cases


def case_docs(ws: dict, case_id: str) -> list[dict]:
    docs = _list(ws.get("documents"))
    if not case_id:
        return docs  # 旧数据未标记案卷，全部归入当前案卷
    return [d for d in docs if str(d.get("caseId") or "") == case_id]


def case_metrics(case: dict, docs: list[dict], audit: list[dict]) -> dict:
    n_docs = len(docs)
    reviewed = sum(1 for d in docs if d.get("reviewed"))
    amount = round(sum(doc_amount(d.get("data") or {}) for d in docs), 2)
    files = {str(d.get("name") or "") for d in docs}
    audit_count = sum(1 for a in audit if str(a.get("file") or "") in files)
    billing = str(case.get("billing") or "per_doc")
    rate = _num(case.get("rate"))
    fee = _num(case.get("fee"))
    revenue = round(n_docs * rate, 2) if billing == "per_doc" else round(fee, 2)
    status = str(case.get("status") or "active")
    return {
        "documents": n_docs,
        "reviewed": reviewed,
        "amount": amount,
        "auditCount": audit_count,
        "billing": billing,
        "billingLabel": BILLING.get(billing, billing),
        "rate": rate,
        "fee": fee,
        "revenue": revenue,
        "status": status,
        "statusLabel": CASE_STATUS.get(status, status),
        "progress": round(reviewed / n_docs * 100) if n_docs else 0,
    }


def summarize(ws: dict) -> dict:
    clients = _list(ws.get("clients"))
    cases = effective_cases(ws)
    docs = _list(ws.get("documents"))
    audit = _list(ws.get("audit"))
    clients_by_id = {str(c.get("id") or ""): c for c in clients}

    case_rows = []
    for case in cases:
        cid = str(case.get("id") or "")
        client = clients_by_id.get(str(case.get("clientId") or ""), {})
        row = {
            "id": cid,
            "name": str(case.get("name") or "未命名案卷"),
            "clientId": str(case.get("clientId") or ""),
            "clientName": str(client.get("name") or "未分配客户"),
            "period": str(case.get("period") or ""),
            "note": str(case.get("note") or ""),
            "createdAt": str(case.get("createdAt") or ""),
            "deliveredAt": str(case.get("deliveredAt") or ""),
        }
        row.update(case_metrics(case, case_docs(ws, cid), audit))
        case_rows.append(row)

    client_rows = []
    for client in clients:
        cid = str(client.get("id") or "")
        own = [r for r in case_rows if r["clientId"] == cid]
        client_rows.append({
            "id": cid,
            "name": str(client.get("name") or "未命名客户"),
            "industry": str(client.get("industry") or ""),
            "contact": str(client.get("contact") or ""),
            "cases": len(own),
            "documents": sum(r["documents"] for r in own),
            "amount": round(sum(r["amount"] for r in own), 2),
            "revenue": round(sum(r["revenue"] for r in own), 2),
        })
    unassigned = [r for r in case_rows if not r["clientId"]]
    if unassigned:
        client_rows.append({
            "id": "", "name": "未分配客户", "industry": "", "contact": "",
            "cases": len(unassigned),
            "documents": sum(r["documents"] for r in unassigned),
            "amount": round(sum(r["amount"] for r in unassigned), 2),
            "revenue": round(sum(r["revenue"] for r in unassigned), 2),
        })

    by_period: dict[str, dict] = {}
    for row in case_rows:
        key = row["period"][:7] or (row["deliveredAt"][:7] or "未分期")
        item = by_period.setdefault(key, {"period": key, "cases": 0, "documents": 0, "revenue": 0.0})
        item["cases"] += 1
        item["documents"] += row["documents"]
        item["revenue"] = round(item["revenue"] + row["revenue"], 2)

    total_docs = len(docs)
    reviewed = sum(1 for d in docs if d.get("reviewed"))
    kpi = {
        "clients": len(clients),
        "cases": len(cases),
        "activeCases": sum(1 for r in case_rows if r["status"] in ("active", "review")),
        "deliveredCases": sum(1 for r in case_rows if r["status"] in ("delivered", "archived")),
        "documents": total_docs,
        "reviewed": reviewed,
        "reviewRate": round(reviewed / total_docs * 100) if total_docs else 0,
        "amount": round(sum(r["amount"] for r in case_rows), 2),
        "revenue": round(sum(r["revenue"] for r in case_rows), 2),
    }
    recent = sorted(case_rows, key=lambda r: r["deliveredAt"] or r["createdAt"] or "", reverse=True)[:8]
    return {
        "kpi": kpi,
        "cases": sorted(case_rows, key=lambda r: r["period"] or "", reverse=True),
        "clients": sorted(client_rows, key=lambda r: r["revenue"], reverse=True),
        "byPeriod": sorted(by_period.values(), key=lambda r: r["period"], reverse=True)[:12],
        "recent": recent,
    }


STATEMENT_HEADERS = [
    "客户名称", "案卷名称", "会计期间", "单据份数", "已复核份数", "单据金额合计",
    "计费方式", "单价/月费", "计费金额", "案卷状态", "交付日期", "备注",
]


def statement_rows(ws: dict, client_id: str = "", period: str = "") -> list[list]:
    data = summarize(ws)
    rows = []
    for r in data["cases"]:
        if client_id and r["clientId"] != client_id:
            continue
        if period and not r["period"].startswith(period):
            continue
        rows.append([
            r["clientName"], r["name"], r["period"], r["documents"], r["reviewed"],
            r["amount"], r["billingLabel"], r["rate"] or r["fee"], r["revenue"],
            r["statusLabel"], r["deliveredAt"], r["note"],
        ])
    if rows:
        rows.append([
            "合计", "", "", sum(r[3] for r in rows), sum(r[4] for r in rows),
            round(sum(_num(r[5]) for r in rows), 2), "", "",
            round(sum(_num(r[8]) for r in rows), 2), "", "", "",
        ])
    return rows


def _csv_cell(value) -> str:
    s = "" if value is None else str(value)
    return '"' + s.replace('"', '""') + '"' if re.search(r'[",\n]', s) else s


def statement_csv(ws: dict, client_id: str = "", period: str = "") -> bytes:
    lines = [",".join(_csv_cell(h) for h in STATEMENT_HEADERS)]
    for row in statement_rows(ws, client_id, period):
        lines.append(",".join(
            ("%.2f" % v) if isinstance(v, float) else _csv_cell(v) for v in row))
    return ("\ufeff" + "\n".join(lines) + "\n").encode("utf-8")


def statement_xlsx(ws: dict, client_id: str = "", period: str = "") -> bytes:
    rows = statement_rows(ws, client_id, period)
    wb = Workbook()
    sheet = wb.active
    sheet.title = "服务对账单"
    sheet.append(STATEMENT_HEADERS)
    for row in rows:
        sheet.append(row)
    for cell in sheet[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center")
    if rows:
        for cell in sheet[sheet.max_row]:
            cell.fill = TOTAL_FILL
            cell.font = Font(bold=True)
    for i, header in enumerate(STATEMENT_HEADERS, 1):
        sheet.column_dimensions[get_column_letter(i)].width = min(
            32, max(11, len(header) * 2 + 4))
        if any(isinstance(r[i - 1], (int, float)) for r in rows):
            for ri in range(2, sheet.max_row + 1):
                sheet.cell(ri, i).number_format = "0.00"
    sheet.freeze_panes = "A2"
    if rows:
        sheet.auto_filter.ref = "A1:%s%d" % (get_column_letter(len(STATEMENT_HEADERS)), sheet.max_row - 1)
    bio = io.BytesIO()
    wb.save(bio)
    return bio.getvalue()
