"""文档智能台 - 后端服务。

技术栈:FastAPI + pypdf + openpyxl,纯本地运行,零云端成本。
- GET  /            返回美观的前端页面
- POST /api/extract 上传 PDF / Word / Excel / HTML / JSON / CSV / TXT / 图片,
                    返回结构化抽取结果(含逐页原文、字段页码定位、解析警告);
                    扫描 PDF 与图片自动走本地 OCR(Windows 内置引擎 / RapidOCR)
- POST /api/export  结果导出 .xlsx(汇总 / 字段 / 明细 / 交付信息)
- POST /api/export-custom 按客户 ERP 模板列映射导出 CSV / Excel(含表头自动匹配)
- POST /api/package 一键交付 ZIP(Excel + CSV + 核对报告 + 凭证 + 原始文本 + 说明)
- POST /api/voucher 记账凭证(通用 / 用友 / 金蝶列头,借贷平衡校验)
- /api/workspace*  本机磁盘工作区(SQLite):自动落盘、时间点快照、一键回滚
- POST /api/commerce/summary 客户 / 案卷 / 工作量 / 计费经营汇总
- POST /api/commerce/statement 服务对账单(JSON / CSV / Excel)
- GET  /api/health  健康检查(含本地 Ollama 可用性)
"""

from __future__ import annotations

import asyncio
import csv
import hashlib
import io
import json
import os
import re
import time
import zipfile
from collections import OrderedDict
from datetime import datetime
from html.parser import HTMLParser
from xml.etree import ElementTree as ET
from urllib.parse import quote

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pypdf import PdfReader
from starlette.concurrency import run_in_threadpool

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from extractors import InvoiceExtractor, OllamaExtractor
from store import (create_snapshot, delete_snapshot, get_snapshot, list_snapshots,
                   load_workspace, restore_snapshot, save_workspace, workspace_status)
from voucher import build_voucher, rmb_upper, voucher_csv, voucher_preview
from ocr import engine_status, ocr_image_bytes, ocr_pdf_pages, ocr_text_is_usable
from exportmap import build_table, custom_csv, custom_xlsx, guess_source
from commerce import summarize as commerce_summarize, statement_csv, statement_rows, statement_xlsx

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
BRAND_DIR = os.path.join(STATIC_DIR, "brand")

app = FastAPI(title="文档智能台 DocIntel")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/brand", StaticFiles(directory=BRAND_DIR), name="brand")

# ---------------------------------------------------------------------------
# 安全与性能基线（v1.7）
# ---------------------------------------------------------------------------
MAX_UPLOAD_BYTES = int(os.environ.get("DOCINTEL_MAX_UPLOAD_MB", "40")) * 1024 * 1024
MAX_TEXT_CHARS = int(os.environ.get("DOCINTEL_MAX_TEXT_CHARS", "2_000_000"))
ALLOWED_EXT = {
    ".pdf", ".docx", ".xlsx", ".html", ".htm", ".json", ".csv",
    ".txt", ".md", ".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff",
}
# 解析结果 LRU 缓存：同一文件重复上传不重复解析（按内容哈希）
_PARSE_CACHE: "OrderedDict[str, tuple[float, dict]]" = OrderedDict()
_PARSE_CACHE_MAX = 24
_PARSE_LOCK = asyncio.Lock()
# 健康检查缓存：Ollama 探测有 2s 超时，避免每次 health 都阻塞
_HEALTH_CACHE: dict = {"at": 0.0, "data": None}
_HEALTH_TTL = 5.0


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """统一加安全响应头；拦截明显恶意请求。"""
    # 请求体大小上限（上传走 /api/extract 单独校验，这里挡其他 JSON 接口）
    length = request.headers.get("content-length")
    if length:
        try:
            if int(length) > MAX_UPLOAD_BYTES and request.url.path != "/api/extract":
                return JSONResponse({"detail": "请求体过大"}, status_code=413)
        except ValueError:
            pass
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
        "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; "
        "base-uri 'none'; form-action 'self'"
    )
    return response


def _validate_upload(filename: str, raw: bytes) -> None:
    """上传前置校验：扩展名白名单 + 体积上限 + 非空。"""
    ext = os.path.splitext((filename or "").lower())[1]
    if ext not in ALLOWED_EXT:
        raise HTTPException(
            status_code=415,
            detail=f"不支持的文件类型 {ext or '(无扩展名)'}；"
                   f"允许：{', '.join(sorted(ALLOWED_EXT))}",
        )
    if not raw:
        raise HTTPException(status_code=400, detail="文件为空")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"文件过大（{len(raw) // 1024 // 1024}MB），上限 "
                   f"{MAX_UPLOAD_BYTES // 1024 // 1024}MB",
        )


def _cache_get(key: str):
    hit = _PARSE_CACHE.get(key)
    if hit:
        _PARSE_CACHE.move_to_end(key)
        return hit[1]
    return None


def _cache_put(key: str, value: dict) -> None:
    _PARSE_CACHE[key] = (time.monotonic(), value)
    _PARSE_CACHE.move_to_end(key)
    while len(_PARSE_CACHE) > _PARSE_CACHE_MAX:
        _PARSE_CACHE.popitem(last=False)


def _decode(raw: bytes) -> str:
    """按常见中文编码依次尝试解码。"""
    for enc in ("utf-8-sig", "utf-8", "gb18030", "gbk", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


class _TextHTMLParser(HTMLParser):
    """把 HTML 转成按块分行、无标签的纯文本（忽略脚本/样式）。"""

    BLOCK = {"p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6",
             "section", "article", "table", "thead", "tbody", "td", "th"}
    SKIP = {"script", "style", "noscript"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip += 1
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip:
            self._skip -= 1
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)

    def text(self) -> str:
        raw = "".join(self.parts)
        lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in raw.split("\n")]
        return "\n".join(ln for ln in lines if ln)


def _docx_text(raw: bytes) -> str:
    """用标准库读 .docx 的 word/document.xml，按段落还原文本。"""
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    lines = []
    for para in root.iter():
        if not para.tag.endswith("}p"):
            continue
        chunks = [node.text or "" for node in para.iter() if node.tag.endswith("}t")]
        line = "".join(chunks).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def _xlsx_pages(raw: bytes) -> list[dict]:
    """把 .xlsx 每个工作表转成一页 TSV 文本。"""
    wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    pages: list[dict] = []
    try:
        for ws in wb.worksheets:
            rows = []
            for row in ws.iter_rows(values_only=True):
                cells = ["" if v is None else str(v) for v in row]
                while cells and cells[-1] == "":
                    cells.pop()
                if any(c.strip() for c in cells):
                    rows.append("\t".join(cells))
            pages.append({"page": len(pages) + 1, "label": ws.title,
                          "text": "\n".join(rows)})
    finally:
        wb.close()
    return pages


def read_document(raw: bytes, filename: str) -> dict:
    """读取上传文件，返回 {text, pages, source_type, warnings}。

    支持 PDF(逐页) / DOCX / XLSX / HTML / JSON / CSV / TXT / MD，
    仅用标准库与已有依赖，不引入新包。pages 仅在多页时返回，
    避免单页文档重复传输全文。
    """
    lower = (filename or "").lower()
    warnings: list[str] = []
    pages: list[dict] = []
    source_type = "text"
    text = ""
    ocr_used = False

    if lower.endswith(".pdf"):
        source_type = "pdf"
        try:
            reader = PdfReader(io.BytesIO(raw))
            for i, page in enumerate(reader.pages, 1):
                pages.append({"page": i, "label": "", "text": page.extract_text() or ""})
            text = "\n".join(p["text"] for p in pages)
        except Exception as exc:
            warnings.append(f"PDF 解析失败：{exc}")
            pages, text = [], ""
        if pages:
            empty = [p["page"] for p in pages if not p["text"].strip()]
            if empty and len(empty) == len(pages):
                # 整本无文本层 → 扫描件，逐页栅格化后本地 OCR
                try:
                    texts = ocr_pdf_pages(raw)
                    for p, t in zip(pages, texts):
                        p["text"] = t
                    text = "\n".join(p["text"] for p in pages)
                    if ocr_text_is_usable(text):
                        ocr_used = True
                        warnings.append(
                            f"该 PDF 为扫描件，已使用本地 OCR 识别 {len(pages)} 页，"
                            "字段准确性请以原文对照和人工核对为准。")
                    else:
                        warnings.append("扫描件 OCR 未识别到可用文字，请检查扫描质量或清晰度。")
                except RuntimeError as exc:
                    warnings.append(f"该 PDF 未检测到文本层（扫描件）。{exc}")
            elif empty:
                # 部分页缺失文本层（如扫描附件页），仅对这些页 OCR
                try:
                    texts = ocr_pdf_pages(raw, only_pages=empty)
                    changed = 0
                    for p in pages:
                        if not p["text"].strip():
                            t = texts[p["page"] - 1]
                            if t:
                                p["text"] = t
                                changed += 1
                    if changed:
                        text = "\n".join(p["text"] for p in pages)
                        ocr_used = True
                        warnings.append(f"已对 {changed} 页扫描内容使用本地 OCR 识别。")
                except RuntimeError:
                    pass  # 引擎不可用时保持原样，由通用提示兜底
    elif lower.endswith((".png", ".jpg", ".jpeg", ".bmp", ".webp")):
        source_type = "image"
        ext = os.path.splitext(lower)[1] or ".png"
        try:
            text = ocr_image_bytes(raw, ext)
            if ocr_text_is_usable(text):
                ocr_used = True
            else:
                warnings.append("图片中未识别到可用文字，请检查图片清晰度。")
        except RuntimeError as exc:
            warnings.append(f"图片 OCR 失败：{exc}。Windows 可在「设置→时间和语言→语言」"
                            "添加中文语言包；或 pip 安装 rapidocr-onnxruntime 后重试。")
    elif lower.endswith(".docx"):
        source_type = "docx"
        try:
            text = _docx_text(raw)
        except Exception as exc:
            text = ""
            warnings.append(f"Word 文档解析失败：{exc}（旧版 .doc 请另存为 .docx）")
    elif lower.endswith((".xlsx", ".xlsm")):
        source_type = "xlsx"
        try:
            pages = _xlsx_pages(raw)
            text = "\n\n".join(p["text"] for p in pages)
        except Exception as exc:
            pages, text = [], ""
            warnings.append(f"Excel 解析失败：{exc}（旧版 .xls 请另存为 .xlsx）")
    elif lower.endswith((".html", ".htm")):
        source_type = "html"
        parser = _TextHTMLParser()
        parser.feed(_decode(raw))
        text = parser.text()
    elif lower.endswith(".json"):
        source_type = "json"
        decoded = _decode(raw)
        try:
            text = json.dumps(json.loads(decoded), ensure_ascii=False, indent=2)
        except Exception:
            text = decoded
    elif lower.endswith(".csv"):
        source_type = "csv"
        try:
            reader = csv.reader(io.StringIO(_decode(raw)))
            text = "\n".join("\t".join(cells) for cells in reader if cells)
        except Exception:
            text = _decode(raw)
    elif lower.endswith((".doc", ".xls")):
        source_type = "legacy"
        warnings.append("旧版 .doc / .xls 为二进制格式，请另存为 .docx / .xlsx 后重试。")
    else:
        text = _decode(raw)

    if not text.strip() and not warnings:
        warnings.append("未能从文件中读取到文本内容（可能是空文件或不受支持的二进制格式）。")
    if len(pages) <= 1:
        pages = []  # 单页不重复传输，前端回退到 raw_text
    return {"text": text, "pages": pages, "source_type": source_type,
            "warnings": warnings, "ocr_used": ocr_used}


def locate_page(source: str, pages: list[dict]) -> int:
    """按字段来源行定位它所在的页（1-based，0 表示未定位）。"""
    s = (source or "").strip()
    if not s or not pages:
        return 0
    for p in pages:
        if s in (p.get("text") or ""):
            return p["page"]
    head = s[:10]
    if head:
        for p in pages:
            if head in (p.get("text") or ""):
                return p["page"]
    return 0


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/favicon.ico")
def favicon_ico():
    return FileResponse(os.path.join(BRAND_DIR, "favicon.ico"))


@app.get("/style.css")
def style_css():
    return FileResponse(os.path.join(STATIC_DIR, "style.css"))


@app.get("/app.js")
def app_js():
    return FileResponse(os.path.join(STATIC_DIR, "app.js"))


HEADER_FILL = PatternFill("solid", fgColor="0E7C6B")
HEADER_FONT = Font(color="FFFFFF", bold=True, size=11)
SUM_FILL = PatternFill("solid", fgColor="E8F4F0")
SUM_FONT = Font(bold=True, color="0B5F52")


def as_number(value):
    """金额文本转数值，让 Excel 能直接求和；非数值原样保留。"""
    if value is None or value == "":
        return ""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value
    s = str(value).strip().replace(",", "").replace("¥", "").replace("￥", "")
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    if not m:
        return str(value)
    try:
        return float(m.group())
    except ValueError:
        return str(value)


def _finish_sheet(ws, widths, money_cols=(), pct_cols=()):
    """统一表头样式、冻结首行、筛选器、列宽与数字格式。"""
    for cell in ws[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 23
    ws.freeze_panes = "A2"
    if ws.max_row > 1:
        ws.auto_filter.ref = ws.dimensions
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows(min_row=2):
        for col in money_cols:
            cell = row[col - 1]
            if isinstance(cell.value, (int, float)):
                cell.number_format = "#,##0.00"
        for col in pct_cols:
            cell = row[col - 1]
            if isinstance(cell.value, (int, float)):
                cell.number_format = '0"%"'


INFO_FILL = PatternFill("solid", fgColor="EEF3F6")
INFO_FONT = Font(bold=True, color="2C313C")


def _normalize_results(payload: dict) -> list[dict]:
    results = payload.get("results")
    if not results and payload.get("data"):
        results = [payload["data"]]
    return [d for d in (results or []) if isinstance(d, dict)]


def _total_of(d: dict) -> float:
    """单据价税合计，缺失时回退明细合计。"""
    tf = next((f for f in (d.get("fields") or [])
               if re.search(r"合计|总额|价税", str(f.get("label") or ""), re.I)), None)
    v = as_number(tf.get("value")) if tf else ""
    if isinstance(v, (int, float)) and v > 0:
        return float(v)
    return sum(x for x in (as_number(it.get("amount")) for it in (d.get("line_items") or []))
               if isinstance(x, (int, float)))


def _field_value(d: dict, *patterns) -> str:
    """按字段名正则取第一个非空值，供交付清单使用。"""
    for f in d.get("fields") or []:
        label = str(f.get("label") or "")
        if any(re.search(p, label, re.I) for p in patterns):
            v = str(f.get("value") or "").strip()
            if v:
                return v
    return ""


def _build_workbook(payload: dict) -> Workbook:
    """生成可交付的 .xlsx：汇总 / 字段 / 明细 / 交付信息 四张工作表。

    交付信息包含案卷元数据与人工修正留痕，让导出结果可作为正式交付底稿。
    纯本地生成，零云端调用。
    """
    results = _normalize_results(payload)
    case = payload.get("case") or {}
    audit = [a for a in (payload.get("audit") or []) if isinstance(a, dict)]

    wb = Workbook()
    ws_s = wb.active
    ws_s.title = "汇总"
    ws_s.append(["文件", "单据类型", "字段数", "明细行", "明细合计", "价税合计",
                 "异常项", "解析警告", "复核", "结论"])
    ws_f = wb.create_sheet("字段")
    ws_f.append(["文件", "页", "字段", "值", "置信度", "原文出处"])
    ws_l = wb.create_sheet("明细")
    ws_l.append(["文件", "页", "名称", "数量", "单价", "金额"])
    ws_i = wb.create_sheet("交付信息")

    grand_li = 0.0
    grand_total = 0.0
    reviewed_n = 0
    for d in results:
        name = d.get("filename") or "结果"
        fields = d.get("fields") or []
        items = d.get("line_items") or []
        checks = [c for c in (d.get("checks") or []) if isinstance(c, dict)]

        li_sum = sum(v for v in (as_number(it.get("amount")) for it in items)
                     if isinstance(v, (int, float)))
        total_field = next((f for f in fields
                            if re.search(r"合计|总额|价税|金额|total|amount",
                                         str(f.get("label") or ""), re.I)), None)
        total_val = as_number(total_field.get("value")) if total_field else 0
        total_num = total_val if isinstance(total_val, (int, float)) else 0
        grand_li += li_sum
        grand_total += total_num
        if d.get("reviewed"):
            reviewed_n += 1

        warns = [c.get("label") for c in checks if c.get("status") == "warn"]
        parsed_warns = d.get("warnings") or []
        if checks:
            verdict = "需复核（%d 项）" % len(warns) if warns else "通过"
        else:
            verdict = "未校验"
        ws_s.append([
            name, d.get("doc_type") or "通用单据", len(fields), len(items),
            li_sum, total_num,
            "；".join(str(w) for w in warns) or "—",
            len(parsed_warns), "已复核" if d.get("reviewed") else "待复核", verdict,
        ])

        for f in fields:
            conf = f.get("confidence")
            try:
                conf_pct = round(float(conf) * 100) if conf is not None else ""
            except (TypeError, ValueError):
                conf_pct = ""
            ws_f.append([name, f.get("page") or "", f.get("label"), f.get("value"),
                         conf_pct, f.get("source") or ""])
        for it in items:
            ws_l.append([name, it.get("page") or "", it.get("name"),
                         as_number(it.get("qty")), as_number(it.get("unit_price")),
                         as_number(it.get("amount"))])

    if results:
        ws_s.append(["合计", "", "", "", grand_li, grand_total, "", "", "", ""])
        for cell in ws_s[ws_s.max_row]:
            cell.fill = SUM_FILL
            cell.font = SUM_FONT
        ws_l.append(["合计", "", "", "", "", grand_li])
        for cell in ws_l[ws_l.max_row]:
            cell.fill = SUM_FILL
            cell.font = SUM_FONT

    _finish_sheet(ws_s, [30, 18, 9, 9, 15, 15, 34, 11, 10, 16], money_cols=(5, 6))
    _finish_sheet(ws_f, [30, 6, 20, 30, 10, 46], pct_cols=(5,))
    _finish_sheet(ws_l, [30, 6, 28, 10, 14, 15], money_cols=(5, 6))

    info_rows = [
        ["文档台 · 单据结构化工作台｜交付信息"],
        ["案卷名称", case.get("name") or "—"],
        ["我方主体", case.get("entity") or "—"],
        ["我方税号", case.get("taxId") or "—"],
        ["会计期间", case.get("period") or "—"],
        ["复核人", case.get("reviewer") or "—"],
        ["生成时间", datetime.now().strftime("%Y-%m-%d %H:%M:%S")],
        ["文件总数", len(results)],
        ["已复核", reviewed_n],
        ["明细合计（不含税）", grand_li],
        ["价税合计", grand_total],
        ["备注", case.get("note") or "—"],
        [],
        ["修改记录（人工修正留痕）"],
        ["时间", "文件", "字段", "原值", "新值"],
    ]
    audit_head = len(info_rows)  # 「时间/文件/字段/原值/新值」表头所在行
    for a in audit:
        info_rows.append([a.get("time") or "", a.get("file") or "",
                          a.get("field") or "", a.get("old") or "", a.get("new") or ""])
    for row in info_rows:
        ws_i.append(row)
    for cell in ws_i[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
    for cell in ws_i[audit_head]:
        cell.fill = INFO_FILL
        cell.font = INFO_FONT
    ws_i.column_dimensions["A"].width = 24
    ws_i.column_dimensions["B"].width = 34
    ws_i.column_dimensions["C"].width = 24
    ws_i.column_dimensions["D"].width = 30
    ws_i.column_dimensions["E"].width = 30
    for row in ws_i.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="center", wrap_text=True)
    return wb


@app.post("/api/export")
async def export_xlsx(payload: dict):
    """导出可交付的 .xlsx（汇总 / 字段 / 明细 / 交付信息）。纯本地、零云端。"""
    bio = io.BytesIO()
    _build_workbook(payload).save(bio)
    return Response(
        bio.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=docdesk_export.xlsx"},
    )


@app.post("/api/export-custom")
async def api_export_custom(payload: dict):
    """按客户 ERP 模板列映射导出：CSV / Excel / JSON 预览 / 表头自动匹配。"""
    mode = payload.get("mode") or "csv"
    if mode == "guess":
        headers = [str(h).strip() for h in (payload.get("headers") or [])
                   if str(h or "").strip()]
        return JSONResponse({"columns": [
            {"header": h, "source": guess_source(h), "fixed": ""} for h in headers]})
    results = _normalize_results(payload)
    case = payload.get("case") or {}
    audit = [a for a in (payload.get("audit") or []) if isinstance(a, dict)]
    columns = [c for c in (payload.get("columns") or []) if isinstance(c, dict)]
    if not columns:
        return JSONResponse({"error": "未配置列映射"}, status_code=400)
    if mode == "json":
        headers, rows = build_table(results, case, columns, audit)
        return JSONResponse({"headers": headers, "rows": rows[:80], "total": len(rows)})
    name = _safe_name(case.get("name") or "文档台", "文档台")
    if mode == "xlsx":
        return Response(
            custom_xlsx(results, case, columns, audit,
                        total_row=bool(payload.get("totalRow"))),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition":
                     "attachment; filename*=UTF-8''%s.xlsx" % _encode_filename(name)},
        )
    return Response(
        custom_csv(results, case, columns, audit),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition":
                 "attachment; filename*=UTF-8''%s.csv" % _encode_filename(name)},
    )


def _safe_name(value: str, default: str) -> str:
    return re.sub(r'[\\/:*?"<>|\r\n\t]+', "_", str(value or default)).strip()[:60] or default


def _encode_filename(name: str) -> str:
    """Content-Disposition 中文文件名按 RFC 5987 编码，避免浏览器乱码。"""
    return quote(name, safe="")


@app.post("/api/package")
async def package_bundle(payload: dict):
    """一键生成交付包 ZIP：Excel 底稿 + 汇总 CSV + 核对报告 + 原始文本 + 说明。

    供商用交付使用：客户收到一个压缩包即可复核全部字段、异常项与修改记录。
    """
    results = _normalize_results(payload)
    case = payload.get("case") or {}
    audit = [a for a in (payload.get("audit") or []) if isinstance(a, dict)]

    xb = io.BytesIO()
    _build_workbook(payload).save(xb)

    csv_buf = io.StringIO(newline="")
    cw = csv.writer(csv_buf)
    cw.writerow(["文件名", "单据类型", "销售方", "发票号", "日期", "明细合计",
                 "价税合计", "异常项", "复核状态"])
    grand = 0.0
    for d in results:
        li_sum = sum(v for v in (as_number(it.get("amount")) for it in (d.get("line_items") or []))
                     if isinstance(v, (int, float)))
        tf = next((f for f in (d.get("fields") or [])
                   if re.search(r"合计|总额|价税|金额|total|amount", str(f.get("label") or ""), re.I)), None)
        tv = as_number(tf.get("value")) if tf else 0
        total_num = tv if isinstance(tv, (int, float)) else 0
        grand += total_num
        warns = [str(c.get("label") or "") for c in (d.get("checks") or [])
                 if isinstance(c, dict) and c.get("status") == "warn"]
        cw.writerow([d.get("filename") or "", d.get("doc_type") or "",
                     _field_value(d, r"销售方|卖方|收款方|供货"),
                     _field_value(d, r"发票|单号|编号|号码"),
                     _field_value(d, r"日期|开票"), "%.2f" % li_sum, "%.2f" % total_num,
                     "；".join(warns) or "—", "已复核" if d.get("reviewed") else "待复核"])
    cw.writerow(["合计", "", "", "", "", "", "%.2f" % grand, "", ""])

    lines = [
        "文档台 · 单据核对报告",
        "=" * 48,
        "案卷名称：%s" % (case.get("name") or "—"),
        "我方主体：%s" % (case.get("entity") or "—"),
        "我方税号：%s" % (case.get("taxId") or "—"),
        "会计期间：%s" % (case.get("period") or "—"),
        "复核人：%s" % (case.get("reviewer") or "—"),
        "生成时间：%s" % datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "文件数量：%d（已复核 %d）" % (len(results), sum(1 for d in results if d.get("reviewed"))),
        "价税合计：%.2f 元" % grand,
        "金额大写：%s" % rmb_upper(grand),
        "",
        "逐份核对",
        "-" * 48,
    ]
    for i, d in enumerate(results, 1):
        lines.append("%d. %s  [%s]" % (i, d.get("filename") or "结果", d.get("doc_type") or "通用单据"))
        lines.append("   价税合计：%.2f 元   复核：%s" % (
            _total_of(d), "已复核" if d.get("reviewed") else "待复核"))
        for f in (d.get("fields") or []):
            lines.append("   · %s：%s" % (f.get("label") or "", f.get("value") or "—"))
        for c in (d.get("checks") or []):
            if isinstance(c, dict):
                lines.append("   [%s] %s：%s" % (
                    "异常" if c.get("status") == "warn" else "通过",
                    c.get("label") or "", c.get("detail") or ""))
        lines.append("")
    if audit:
        lines += ["人工修正留痕", "-" * 48]
        for a in audit:
            lines.append("%s | %s | %s | %s → %s" % (
                a.get("time") or "", a.get("file") or "", a.get("field") or "",
                a.get("old") or "—", a.get("new") or "—"))
    lines += ["", "本报告由文档台在本地生成，文件与数据均未上传。"]

    zbuf = io.BytesIO()
    with zipfile.ZipFile(zbuf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("01_结构化结果.xlsx", xb.getvalue())
        zf.writestr("02_汇总清单.csv", "\ufeff" + csv_buf.getvalue())
        zf.writestr("03_核对报告.txt", "\n".join(lines))
        voucher_bundle = build_voucher(results, payload.get("voucher") or {})
        zf.writestr("04_记账凭证.csv", voucher_csv(voucher_bundle))
        used = set()
        for d in results:
            stem = os.path.splitext(str(d.get("filename") or "结果"))[0]
            base = _safe_name(stem, "结果")
            name = base
            n = 2
            while name.lower() in used:
                name = "%s_%d" % (base, n)
                n += 1
            used.add(name.lower())
            zf.writestr("原始文本/%s.txt" % name, d.get("raw_text") or "")
        zf.writestr("README_交付说明.txt",
                    "文档台交付包\n"
                    "============\n"
                    "01_结构化结果.xlsx  汇总/字段/明细/交付信息四张表，含校验结论与修改记录\n"
                    "02_汇总清单.csv     每行一份单据，金额为纯数值可直接求和\n"
                    "03_核对报告.txt     案卷信息、金额大写、逐份字段与异常项、人工修正留痕\n"
                    "04_记账凭证.csv     借贷平衡凭证，可导入财务软件；科目可在凭证弹窗中自定义\n"
                    "原始文本/           每份单据的原文，便于逐字追溯\n\n"
                    "全部内容由文档台在本机生成，无云端上传。\n")
    zbuf.seek(0)
    return Response(
        zbuf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=docdesk_delivery.zip"},
    )


# ---------------------------------------------------------------------------
# 本机磁盘工作区：结果、案卷、模板与修正留痕落盘，支持时间点快照回滚
# ---------------------------------------------------------------------------
@app.get("/api/workspace/status")
def api_workspace_status():
    return workspace_status()


@app.get("/api/workspace")
def api_workspace_get():
    return load_workspace()


@app.put("/api/workspace")
async def api_workspace_put(payload: dict):
    if not isinstance(payload, dict):
        return JSONResponse({"ok": False, "error": "invalid payload"}, status_code=400)
    return save_workspace(payload)


def _commerce_workspace(payload: dict) -> dict:
    """前端传入当前工作区则以其为准；否则回落到磁盘正式底稿。"""
    if isinstance(payload, dict) and (
            isinstance(payload.get("documents"), list) or isinstance(payload.get("cases"), list)):
        return payload
    return load_workspace()


@app.post("/api/commerce/summary")
async def api_commerce_summary(payload: dict):
    return commerce_summarize(_commerce_workspace(payload or {}))


@app.post("/api/commerce/statement")
async def api_commerce_statement(payload: dict):
    """服务对账单：mode=json 预览，csv / xlsx 下载。可按客户与会计期间过滤。"""
    payload = payload or {}
    ws = _commerce_workspace(payload)
    client_id = str(payload.get("clientId") or "")
    period = str(payload.get("period") or "")
    mode = str(payload.get("mode") or "json")
    if mode == "json":
        rows = statement_rows(ws, client_id, period)
        return JSONResponse({"headers": [
            "客户名称", "案卷名称", "会计期间", "单据份数", "已复核份数", "单据金额合计",
            "计费方式", "单价/月费", "计费金额", "案卷状态", "交付日期", "备注"],
            "rows": rows[:100], "total": len(rows)})
    if mode == "xlsx":
        return Response(
            statement_xlsx(ws, client_id, period),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition":
                     "attachment; filename*=UTF-8''%s.xlsx" % _encode_filename(
                         str((payload.get("name") or "服务对账单")))},
        )
    return Response(
        statement_csv(ws, client_id, period),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition":
                 "attachment; filename*=UTF-8''%s.csv" % _encode_filename(
                     str((payload.get("name") or "服务对账单")))},
    )


@app.get("/api/workspace/snapshots")
def api_workspace_snapshots():
    return {"items": list_snapshots()}


@app.post("/api/workspace/snapshot")
async def api_workspace_snapshot(payload: dict):
    return create_snapshot(str(payload.get("name") or ""), payload.get("workspace"))


@app.get("/api/workspace/snapshot/{sid}")
def api_workspace_snapshot_get(sid: str):
    snap = get_snapshot(sid)
    if not snap:
        return JSONResponse({"error": "snapshot not found"}, status_code=404)
    return snap


@app.post("/api/workspace/snapshot/{sid}/restore")
def api_workspace_snapshot_restore(sid: str):
    out = restore_snapshot(sid)
    if not out:
        return JSONResponse({"error": "snapshot not found"}, status_code=404)
    return out


@app.delete("/api/workspace/snapshot/{sid}")
def api_workspace_snapshot_delete(sid: str):
    return {"ok": delete_snapshot(sid)}


# ---------------------------------------------------------------------------
# 记账凭证：把单据转成借贷平衡的凭证行，可导入通用 / 用友 / 金蝶
# ---------------------------------------------------------------------------
@app.post("/api/voucher")
async def api_voucher(payload: dict):
    results = _normalize_results(payload)
    bundle = build_voucher(results, payload.get("config") or {})
    if payload.get("mode") == "json":
        preview = voucher_preview(bundle)
        return JSONResponse({
            "rows": bundle["rows"][:80],
            "stats": bundle["stats"],
            "columns": preview["columns"],
            "cells": preview["cells"],
            "format": bundle["format"],
            "formatName": bundle["formatName"],
        })
    stamp = datetime.now().strftime("%Y%m%d")
    return Response(
        voucher_csv(bundle),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=docdesk_voucher_%s.csv" % stamp,
            "X-Voucher-Balanced": "1" if bundle["stats"]["balanced"] else "0",
        },
    )


def _health_data() -> dict:
    """真正的健康检查逻辑，在线程池执行（Ollama 探测有 2s 超时）。"""
    return {
        "status": "ok",
        "workspace": workspace_status(),
        "ollama_available": OllamaExtractor().available(),
        "ocr": engine_status(),
    }


@app.get("/api/health")
async def health():
    # 短 TTL 缓存：保活探测高频调用时不再每次阻塞 2 秒
    now = time.monotonic()
    if _HEALTH_CACHE["data"] is not None and now - _HEALTH_CACHE["at"] < _HEALTH_TTL:
        return JSONResponse(_HEALTH_CACHE["data"])
    data = await run_in_threadpool(_health_data)
    _HEALTH_CACHE["at"] = now
    _HEALTH_CACHE["data"] = data
    return JSONResponse(data)


def _extract_sync(raw: bytes, filename: str, mode: str) -> dict:
    """同步解析主体，运行在线程池，避免阻塞事件循环。"""
    doc = read_document(raw, filename)
    text, pages = doc["text"], doc["pages"]

    if mode == "llm":
        result = OllamaExtractor().extract(text, filename)
    else:
        result = InvoiceExtractor().extract(text, filename)
        # auto:规则抽不到且本地有 Ollama 时,自动升级到 LLM
        if mode == "auto" and not result.fields and OllamaExtractor().available():
            result = OllamaExtractor().extract(text, filename)

    payload = result.to_dict()
    # 页码索引一次构建，避免逐字段全页扫描（O(字段×页) → O(页+字段)）
    page_index: dict[str, int] = {}
    for p in pages:
        for line in (p.get("text") or "").splitlines():
            line = line.strip()
            if len(line) >= 4:
                page_index.setdefault(line, p["page"])
    for f, fd in zip(result.fields, payload["fields"]):
        src = (f.source or "").strip()
        fd["page"] = page_index.get(src) or locate_page(src, pages)
    for it in payload["line_items"]:
        src = (it.get("source") or "").strip()
        it["page"] = page_index.get(src) or locate_page(src, pages)

    # 限制回传体积，避免超大原文拖垮前端与网络
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS] + "\n…[内容过长已截断]"
    payload["filename"] = filename
    payload["char_count"] = len(text)
    payload["raw_text"] = text
    payload["pages"] = pages
    payload["page_count"] = len(pages) if pages else (1 if text.strip() else 0)
    payload["source_type"] = doc["source_type"]
    payload["ocr_used"] = doc.get("ocr_used", False)
    payload["warnings"] = doc["warnings"]
    return payload


@app.post("/api/extract")
async def extract(file: UploadFile = File(...), mode: str = Form("auto")):
    started = time.monotonic()
    raw = await file.read()
    filename = file.filename or "unknown"
    _validate_upload(filename, raw)

    # 缓存键：内容哈希 + 文件名后缀 + 模式，命中则直接返回（深拷贝避免调用方串改）
    import copy
    key = hashlib.sha256(raw).hexdigest() + "|" + filename.lower()[-8:] + "|" + mode
    async with _PARSE_LOCK:
        cached = _cache_get(key)
    if cached is not None:
        result = copy.deepcopy(cached)
        result["cache_hit"] = True
        result["elapsed_ms"] = round((time.monotonic() - started) * 1000, 1)
        return JSONResponse(result)

    payload = await run_in_threadpool(_extract_sync, raw, filename, mode)
    payload["cache_hit"] = False
    payload["elapsed_ms"] = round((time.monotonic() - started) * 1000, 1)
    async with _PARSE_LOCK:
        _cache_put(key, payload)
    return JSONResponse(payload)


if __name__ == "__main__":
    """直接 `python app.py` 启动:绑定端口并自动打开浏览器。

    环境变量:
      PORT                云端托管平台注入的端口;设置后自动绑定 0.0.0.0 且不打开浏览器
      DOCINTEL_HOST       监听地址(默认 127.0.0.1;PORT 存在时强制 0.0.0.0)
      DOCINTEL_PORT       监听端口(默认 8000)
      DOCINTEL_NO_BROWSER 设为 1 时不自动打开浏览器(脚本/测试用)
    """
    import threading
    import webbrowser

    import uvicorn

    cloud_port = os.environ.get("PORT")
    if cloud_port:
        host = "0.0.0.0"
        try:
            port = int(cloud_port)
        except ValueError:
            port = 8000
        os.environ["DOCINTEL_NO_BROWSER"] = "1"
    else:
        host = os.environ.get("DOCINTEL_HOST", "127.0.0.1")
        try:
            port = int(os.environ.get("DOCINTEL_PORT", "8000"))
        except ValueError:
            port = 8000
    url = f"http://127.0.0.1:{port}"

    print("\n  " + "=" * 54)
    print("  文档台 DocDesk  ·  单据结构化工作台")
    print("=" * 54)
    print(f"  服务地址: {url}")
    print("  文件仅在服务端临时处理，不保存。按 Ctrl+C 停止服务。")
    print("=" * 54 + "\n")

    if os.environ.get("DOCINTEL_NO_BROWSER") != "1":
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    uvicorn.run(app, host=host, port=port, log_level="warning", access_log=False)
