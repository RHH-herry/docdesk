"""文档台 · 本机磁盘工作区持久化。

只使用 Python 标准库 sqlite3，数据全部写入项目目录 ``data/workspace.db``：
不联网、不依赖任何外部服务、不产生额外费用。相比浏览器 localStorage，
它解决了三个商用问题：容量上限、清缓存即丢失、留痕可被随意抹掉。

表结构：
  kv          案卷 / 客户 / 案卷列表 / 自定义模板 / 主题 / 元信息
  documents   每份单据的完整结构化结果（含原文、所属案卷 case_id）
  audit       人工修正留痕（只追加，服务端留存）
  snapshots   时间点快照，用于误改 / 误删后一键回滚
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "workspace.db")

MAX_DOCS = 200
MAX_AUDIT = 2000
MAX_SNAPSHOTS = 40
_LOCK = threading.RLock()


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _connect() -> sqlite3.Connection:
    os.makedirs(DATA_DIR, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    return con


def init_db() -> None:
    with _LOCK:
        con = _connect()
        try:
            with con:
                con.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS kv (
                        key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
                    CREATE TABLE IF NOT EXISTS documents (
                        doc_key TEXT PRIMARY KEY, filename TEXT, size INTEGER,
                        doc_type TEXT, tpl TEXT, reviewed INTEGER DEFAULT 0,
                        payload TEXT, ts INTEGER, updated_at TEXT);
                    CREATE TABLE IF NOT EXISTS audit (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT,
                        file TEXT, field TEXT, old TEXT, new TEXT);
                    CREATE TABLE IF NOT EXISTS snapshots (
                        id TEXT PRIMARY KEY, name TEXT, created_at TEXT,
                        byte_size INTEGER, payload TEXT);
                    CREATE INDEX IF NOT EXISTS idx_doc_ts ON documents(ts DESC);
                    """
                )
                # 兼容旧库：v1.6 起单据归属案卷
                cols = {r["name"] for r in con.execute("PRAGMA table_info(documents)")}
                if "case_id" not in cols:
                    con.execute("ALTER TABLE documents ADD COLUMN case_id TEXT")
        finally:
            con.close()


def _dump(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _load(raw, fallback):
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return fallback


def load_workspace() -> dict:
    """读出完整工作区，结构与前端 workspacePayload() 对应。"""
    with _LOCK:
        con = _connect()
        try:
            kv = {r["key"]: r["value"] for r in con.execute("SELECT key, value FROM kv")}
            documents = []
            for r in con.execute("SELECT * FROM documents ORDER BY ts DESC LIMIT ?", (MAX_DOCS,)):
                documents.append({
                    "name": r["filename"],
                    "size": r["size"],
                    "data": _load(r["payload"], {}),
                    "tpl": r["tpl"] or "general",
                    "reviewed": bool(r["reviewed"]),
                    "ts": r["ts"] or 0,
                    "caseId": r["case_id"] or "",
                })
            audit = [
                {"time": r["ts"], "file": r["file"], "field": r["field"],
                 "old": r["old"], "new": r["new"]}
                for r in con.execute("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (MAX_AUDIT,))
            ]
            meta = _load(kv.get("meta"), {})
            return {
                "version": meta.get("version") or "",
                "updatedAt": meta.get("updatedAt") or 0,
                "savedAt": meta.get("savedAt") or "",
                "case": _load(kv.get("case"), {}),
                "clients": _load(kv.get("clients"), []),
                "cases": _load(kv.get("cases"), []),
                "activeCaseId": _load(kv.get("activeCaseId"), "") or "",
                "templates": _load(kv.get("templates"), []),
                "schemes": _load(kv.get("schemes"), []),
                "accountChart": _load(kv.get("accountChart"), []),
                "exportMaps": _load(kv.get("exportMaps"), []),
                "theme": kv.get("theme") or "light",
                "documents": documents,
                "audit": audit,
            }
        finally:
            con.close()


def save_workspace(payload: dict) -> dict:
    """全量写入工作区。前端每次变更后 debounce 提交一次，事务内替换，避免半写状态。"""
    case = payload.get("case") or {}
    templates = payload.get("templates") or []
    theme = payload.get("theme") or "light"
    version = payload.get("version") or ""
    updated_at = int(payload.get("updatedAt") or 0)
    docs = [d for d in (payload.get("documents") or []) if isinstance(d, dict)][:MAX_DOCS]
    audit = [a for a in (payload.get("audit") or []) if isinstance(a, dict)][:MAX_AUDIT]
    saved_at = _now()

    with _LOCK:
        con = _connect()
        try:
            with con:
                def put(key, value):
                    con.execute(
                        "INSERT INTO kv(key,value,updated_at) VALUES(?,?,?) "
                        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                        (key, _dump(value), saved_at),
                    )

                put("case", case)
                clients = payload.get("clients")
                if isinstance(clients, list):
                    put("clients", clients[:200])
                cases = payload.get("cases")
                if isinstance(cases, list):
                    put("cases", cases[:200])
                put("activeCaseId", str(payload.get("activeCaseId") or ""))
                put("templates", templates)
                schemes = payload.get("schemes")
                if isinstance(schemes, list):
                    put("schemes", schemes[:50])
                chart = payload.get("accountChart")
                if isinstance(chart, list):
                    put("accountChart", chart[:2000])
                maps = payload.get("exportMaps")
                if isinstance(maps, list):
                    put("exportMaps", maps[:50])
                put("meta", {"version": version, "updatedAt": updated_at, "savedAt": saved_at})
                con.execute(
                    "INSERT INTO kv(key,value,updated_at) VALUES('theme',?,?) "
                    "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    (theme, saved_at),
                )

                con.execute("DELETE FROM documents")
                for d in docs:
                    data = d.get("data") or {}
                    key = "%s__%s" % (d.get("name") or "结果", d.get("size") or 0)
                    con.execute(
                        "INSERT OR REPLACE INTO documents"
                        "(doc_key,filename,size,doc_type,tpl,reviewed,payload,ts,updated_at,case_id) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?)",
                        (key, d.get("name") or "结果", int(d.get("size") or 0),
                         data.get("doc_type") or "", d.get("tpl") or "general",
                         1 if d.get("reviewed") else 0, _dump(data),
                         int(d.get("ts") or 0), saved_at, str(d.get("caseId") or "")),
                    )

                con.execute("DELETE FROM audit")
                for a in audit:
                    con.execute(
                        "INSERT INTO audit(ts,file,field,old,new) VALUES(?,?,?,?,?)",
                        (a.get("time") or "", a.get("file") or "", a.get("field") or "",
                         str(a.get("old") or ""), str(a.get("new") or "")),
                    )
        finally:
            con.close()
    return {"ok": True, "savedAt": saved_at, "documents": len(docs),
            "audit": len(audit), "updatedAt": updated_at}


def workspace_status() -> dict:
    with _LOCK:
        con = _connect()
        try:
            docs = con.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
            audit = con.execute("SELECT COUNT(*) FROM audit").fetchone()[0]
            snaps = con.execute("SELECT COUNT(*) FROM snapshots").fetchone()[0]
            row = con.execute("SELECT value FROM kv WHERE key='meta'").fetchone()
            meta = _load(row["value"], {}) if row else {}
        finally:
            con.close()
    try:
        size = os.path.getsize(DB_PATH)
    except OSError:
        size = 0
    wal = DB_PATH + "-wal"
    if os.path.exists(wal):
        try:
            size += os.path.getsize(wal)
        except OSError:
            pass
    return {
        "available": True,
        "db": os.path.relpath(DB_PATH, BASE_DIR).replace("\\", "/"),
        "sizeBytes": size,
        "documents": docs,
        "audit": audit,
        "snapshots": snaps,
        "savedAt": meta.get("savedAt") or "",
        "updatedAt": meta.get("updatedAt") or 0,
    }


def list_snapshots() -> list[dict]:
    with _LOCK:
        con = _connect()
        try:
            return [
                {"id": r["id"], "name": r["name"], "createdAt": r["created_at"],
                 "bytes": r["byte_size"],
                 "documents": len(_load(r["payload"], {}).get("documents") or [])}
                for r in con.execute("SELECT * FROM snapshots ORDER BY created_at DESC, rowid DESC")
            ]
        finally:
            con.close()


def get_snapshot(sid: str):
    with _LOCK:
        con = _connect()
        try:
            row = con.execute("SELECT * FROM snapshots WHERE id=?", (sid,)).fetchone()
        finally:
            con.close()
    if not row:
        return None
    return {"id": row["id"], "name": row["name"], "createdAt": row["created_at"],
            "workspace": _load(row["payload"], {})}


def create_snapshot(name: str, workspace: dict | None = None) -> dict:
    ws = workspace if isinstance(workspace, dict) and workspace.get("documents") is not None \
        else load_workspace()
    sid = datetime.now().strftime("%Y%m%d%H%M%S") + "-" + uuid.uuid4().hex[:6]
    label = (name or "").strip() or ("快照 " + _now())
    blob = _dump(ws)
    created = _now()
    with _LOCK:
        con = _connect()
        try:
            with con:
                con.execute(
                    "INSERT INTO snapshots(id,name,created_at,byte_size,payload) VALUES(?,?,?,?,?)",
                    (sid, label, created, len(blob.encode("utf-8")), blob),
                )
                overflow = con.execute(
                    "SELECT id FROM snapshots ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?",
                    (MAX_SNAPSHOTS,),
                ).fetchall()
                for r in overflow:
                    con.execute("DELETE FROM snapshots WHERE id=?", (r["id"],))
        finally:
            con.close()
    return {"ok": True, "id": sid, "name": label, "createdAt": created,
            "documents": len(ws.get("documents") or [])}


def restore_snapshot(sid: str):
    snap = get_snapshot(sid)
    if not snap:
        return None
    ws = snap["workspace"]
    save_workspace(ws)
    return {"ok": True, "id": sid, "name": snap["name"],
            "workspace": load_workspace()}


def delete_snapshot(sid: str) -> bool:
    with _LOCK:
        con = _connect()
        try:
            with con:
                cur = con.execute("DELETE FROM snapshots WHERE id=?", (sid,))
                return cur.rowcount > 0
        finally:
            con.close()


init_db()
