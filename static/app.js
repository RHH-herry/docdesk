"use strict";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file");
const queueEl = document.getElementById("queue");
const queueCount = document.getElementById("queue-count");
const modeSelect = document.getElementById("mode");
const banner = document.getElementById("banner");
const emptyEl = document.getElementById("empty");
const skeletonEl = document.getElementById("skeleton");
const resultEl = document.getElementById("result");
const exportAllBtn = document.getElementById("export-all");
const reparseBtn = document.getElementById("reparse");
const templateSelect = document.getElementById("template");
const clearHistoryBtn = document.getElementById("clear-history");
const toastEl = document.getElementById("toast");
const folderInput = document.getElementById("folder");
const importFolderBtn = document.getElementById("import-folder");
const viewToggle = document.getElementById("view-toggle");
const tablesEl = document.getElementById("tables");
const verifyEl = document.getElementById("verify");
const vSrcEl = document.getElementById("v-src");
const vMapEl = document.getElementById("v-map");
const tplManageBtn = document.getElementById("tpl-manage");
const summaryBtn = document.getElementById("summary-btn");
const searchInput = document.getElementById("search");
const tplModal = document.getElementById("tpl-modal");
const summaryModal = document.getElementById("summary-modal");
const tplNameInput = document.getElementById("tpl-name");
const tplFieldsInput = document.getElementById("tpl-fields");
const tplAddBtn = document.getElementById("tpl-add-btn");
const helpBtn = document.getElementById("help-btn");
const helpModal = document.getElementById("help-modal");
const caseBtn = document.getElementById("case-btn");
const caseModal = document.getElementById("case-modal");
const opsBtn = document.getElementById("ops-btn");
const reportModal = document.getElementById("report-modal");
const voucherModal = document.getElementById("voucher-modal");
const exportMapModal = document.getElementById("export-map-modal");
const opsModal = document.getElementById("ops-modal");
const batchModal = document.getElementById("batch-modal");
const batchBtn = document.getElementById("batch-btn");
const statusChip = document.getElementById("status-chip");
const statusText = document.getElementById("status-text");

const IS_FILE = location.protocol === "file:";
/* 在线试用模式：服务端不落盘，工作区只保存在当前浏览器，避免不同访客串数据。 */
const IS_ONLINE = !IS_FILE && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(location.hostname);
const NO_SERVER_WS = IS_FILE || IS_ONLINE;
const APP_VERSION = "1.7.0";

const TEMPLATES = {
  general: { name: "通用", fields: [] },
  vat: { name: "增值税发票", fields: [
    { key: "invoice_no", label: "发票号码" },
    { key: "date", label: "开票日期" },
    { key: "seller", label: "销售方" },
    { key: "buyer", label: "购买方" },
    { key: "tax_id", label: "纳税人识别号" },
    { key: "bank_account", label: "开户行及账号" },
    { key: "total", label: "价税合计" },
    { key: "net_amount", label: "不含税金额" },
    { key: "tax", label: "税额" },
    { key: "tax_rate", label: "税率" },
    { key: "invoice_code", label: "发票代码" },
    { key: "check_code", label: "校验码" },
    { key: "drawer", label: "开票人" },
    { key: "remark", label: "备注" },
  ] },
  receipt: { name: "收据", fields: [
    { key: "invoice_no", label: "收据编号" },
    { key: "seller", label: "收款方" },
    { key: "buyer", label: "付款方" },
    { key: "total", label: "收款金额" },
    { key: "reason", label: "收款事由" },
    { key: "date", label: "日期" },
  ] },
  reimbursement: { name: "报销单", fields: [
    { key: "invoice_no", label: "报销单号" },
    { key: "applicant", label: "申请人" },
    { key: "dept", label: "部门" },
    { key: "total", label: "报销总额" },
    { key: "date", label: "日期" },
    { key: "status", label: "审批状态" },
  ] },
  purchase: { name: "采购单", fields: [
    { key: "invoice_no", label: "采购单号" },
    { key: "date", label: "下单日期" },
    { key: "seller", label: "供应商" },
    { key: "buyer", label: "采购方" },
    { key: "total", label: "采购金额" },
    { key: "tax", label: "税额" },
    { key: "tax_rate", label: "税率" },
  ] },
  payroll: { name: "工资单", fields: [
    { key: "employee", label: "员工姓名" },
    { key: "dept", label: "部门" },
    { key: "base", label: "基本工资" },
    { key: "bonus", label: "绩效奖金" },
    { key: "deduct", label: "扣款" },
    { key: "net", label: "实发金额" },
  ] },
  bank: { name: "银行流水", fields: [
    { key: "date", label: "交易日期" },
    { key: "counterparty", label: "对方账户" },
    { key: "debit", label: "支出金额" },
    { key: "credit", label: "收入金额" },
    { key: "balance", label: "账户余额" },
    { key: "summary", label: "摘要" },
  ] },
};

/* ---------- 客户模板导出映射（列映射，落盘工作区） ---------- */
const EMKEY = "docdesk_export_maps_v1";
function getExportMaps() { try { return JSON.parse(localStorage.getItem(EMKEY)) || []; } catch { return []; } }
function setExportMaps(list, skipSync) {
  try { localStorage.setItem(EMKEY, JSON.stringify((list || []).slice(0, 50))); } catch {}
  renderExportMapSelect();
  if (!skipSync) scheduleSync();
}

/* ---------- 客户账套科目表（CSV / TSV 导入） ---------- */
const ACKEY = "docdesk_account_chart_v1";
function getAccountChart() { try { return JSON.parse(localStorage.getItem(ACKEY)) || []; } catch { return []; } }
function setAccountChart(list, skipSync) {
  try { localStorage.setItem(ACKEY, JSON.stringify((list || []).slice(0, 2000))); } catch {}
  renderAccountChartMeta();
  if (!skipSync) scheduleSync();
}
function renderAccountChartMeta() {
  const el = document.getElementById("v-chart-info");
  if (el) {
    const n = getAccountChart().length;
    el.textContent = n ? "科目表 " + n + " 项" : "未导入科目表";
  }
  const codes = document.getElementById("v-account-codes");
  const names = document.getElementById("v-account-names");
  const chart = getAccountChart();
  if (codes) codes.innerHTML = chart.map((a) => '<option value="' + escapeAttr(a.code) + '">' + escapeHtml(a.name) + "</option>").join("");
  if (names) names.innerHTML = chart.map((a) => '<option value="' + escapeAttr(a.name) + '">' + escapeHtml(a.code) + "</option>").join("");
}

/* ---------- 科目方案（凭证映射，localStorage + 磁盘工作区双写） ---------- */
const SCKEY = "docdesk_schemes_v1";
function getSchemes() { try { return JSON.parse(localStorage.getItem(SCKEY)) || []; } catch { return []; } }
function setSchemes(list, skipSync) {
  try { localStorage.setItem(SCKEY, JSON.stringify((list || []).slice(0, 50))); } catch {}
  renderSchemeSelect();
  if (!skipSync) scheduleSync();
}

/* ---------- 自定义模板（localStorage 持久化） ---------- */
const TPL_KEY = "docdesk_templates_v1";
function getCustomTemplates() { try { return JSON.parse(localStorage.getItem(TPL_KEY)) || []; } catch { return []; } }
function saveCustomTemplates(list) { try { localStorage.setItem(TPL_KEY, JSON.stringify(list)); } catch {} scheduleSync(); }
function getTemplateSpecs(tpl) {
  if (TEMPLATES[tpl]) return TEMPLATES[tpl].fields;
  const ct = getCustomTemplates().find((t) => t.id === tpl);
  return ct ? ct.fields : [];
}
function getTemplateName(tpl) {
  if (TEMPLATES[tpl]) return TEMPLATES[tpl].name;
  const ct = getCustomTemplates().find((t) => t.id === tpl);
  return ct ? ct.name : tpl;
}

const ICONS = {
  file: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  hash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></svg>',
  cal: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  yuan: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 8l5 6 5-6M8 13h8M8 17h8"/></svg>',
  percent: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5 5 19M7.5 7.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM16.5 16.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z"/></svg>',
  building: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h2M9 11h2M13 7h2M13 11h2"/></svg>',
  id: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2"/><path d="M14 9h4M14 13h4M14 17h2"/></svg>',
  bank: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M4 10h16M5 10V21M19 10V21M9 10V21M15 10V21M12 3 3 9h18z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  mail: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>',
  dot: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
};

function fieldIcon(label) {
  const s = (label || "").toLowerCase();
  if (/发票|单号|编号|号码|no\.?|number/.test(s)) return ICONS.hash;
  if (/日期|时间|开票|签发/.test(s)) return ICONS.cal;
  if (/金额|价|款|额|合计|小写|大写|fee|amount|price|total/.test(s)) return ICONS.yuan;
  if (/税/.test(s)) return ICONS.percent;
  if (/卖方|买方|销货|供货|公司|单位|名称|客户/.test(s)) return ICONS.building;
  if (/税号|识别号/.test(s)) return ICONS.id;
  if (/账号|银行|开户|card|account/.test(s)) return ICONS.bank;
  if (/电话|手机|tel|phone/.test(s)) return ICONS.phone;
  if (/地址|址/.test(s)) return ICONS.pin;
  if (/邮箱|邮件|e-?mail/.test(s)) return ICONS.mail;
  return ICONS.dot;
}

/* ---------- 状态 ---------- */
const state = { queue: [], selectedId: null, seq: 0, defaultTpl: "general", search: "", lowOnly: false };
let currentView = "fields";
let verifyPage = 0;            // 原文对照当前页（0-based）
let pendingVerifyKey = null;   // 切页后待自动高亮的字段
const HKEY = "docdesk_history_v1";
const CKEY = "docdesk_case_v1";
const AKEY = "docdesk_audit_v1";
const CLSKEY = "docdesk_clients_v1";
const CASEKEY = "docdesk_cases_v1";
const ACTIVEKEY = "docdesk_active_case_v1";

/* ---------- 案卷信息（商用交付元数据） ---------- */
const DEFAULT_CASE = { name: "默认案卷", entity: "", taxId: "", period: "", reviewer: "", note: "" };
function getCase() {
  try { return Object.assign({}, DEFAULT_CASE, JSON.parse(localStorage.getItem(CKEY)) || {}); }
  catch { return Object.assign({}, DEFAULT_CASE); }
}
function saveCase(c) { try { localStorage.setItem(CKEY, JSON.stringify(c)); } catch {} renderCaseChip(); scheduleSync(); }
function renderCaseChip() {
  const el = document.getElementById("case-label");
  if (el) el.textContent = getCase().name || DEFAULT_CASE.name;
}

/* ---------- v1.6 客户与案卷经营数据 ----------
   getCase() 始终是「当前案卷」——所有既有交付逻辑无需改动。
   cases / clients 是经营层的档案数组，切换案卷时把当前案卷写回数组再载入目标。 */
function getClients() { try { return JSON.parse(localStorage.getItem(CLSKEY)) || []; } catch { return []; } }
function setClients(list, skipSync) {
  try { localStorage.setItem(CLSKEY, JSON.stringify((list || []).slice(0, 200))); } catch (e) {}
  if (!skipSync) scheduleSync();
}
function getCases() { try { return JSON.parse(localStorage.getItem(CASEKEY)) || []; } catch { return []; } }
function setCases(list, skipSync) {
  try { localStorage.setItem(CASEKEY, JSON.stringify((list || []).slice(0, 200))); } catch (e) {}
  if (!skipSync) scheduleSync();
}
function getActiveCaseId() { try { return localStorage.getItem(ACTIVEKEY) || ""; } catch (e) { return ""; } }
function setActiveCaseId(id, skipSync) {
  try { localStorage.setItem(ACTIVEKEY, String(id || "")); } catch (e) {}
  if (!skipSync) scheduleSync();
}
function currentCaseId() { return getActiveCaseId() || "case-active"; }
function clientName(id) {
  const c = getClients().find((x) => x.id === id);
  return c ? c.name : "未分配客户";
}
function syncCaseToCases() {
  const list = getCases();
  const id = currentCaseId();
  const c = getCase();
  //  untouched 默认案卷不必建档案，避免在经营看板里多出一条空案卷
  const untouched = !getActiveCaseId() && c.name === DEFAULT_CASE.name &&
    !c.entity && !c.taxId && !c.period && !c.reviewer && !c.note;
  if (untouched) return null;
  const idx = list.findIndex((x) => x.id === id);
  const row = Object.assign({}, getCase(), { id: id });
  if (idx >= 0) list[idx] = Object.assign({}, list[idx], row);
  else list.unshift(row);
  setCases(list, true);
  return row;
}
function switchCase(id) {
  if (!id || id === currentCaseId()) return;
  syncCaseToCases();
  const target = getCases().find((x) => x.id === id);
  if (!target) return;
  saveCase(Object.assign({}, DEFAULT_CASE, target));
  setActiveCaseId(id, true);
  renderCaseChip();
  if (opsModal && !opsModal.hidden) renderOps();
  toast("已切换到案卷「" + (target.name || "未命名") + "」");
  scheduleSync();
}

/* ---------- 人工修正留痕（可导出、可追溯） ---------- */
function getAudit() { try { return JSON.parse(localStorage.getItem(AKEY)) || []; } catch { return []; } }
function setAudit(list) { try { localStorage.setItem(AKEY, JSON.stringify(list.slice(0, 500))); } catch {} renderAuditList(); scheduleSync(); }
function addAudit(entry) {
  const list = getAudit();
  list.unshift(Object.assign({ time: new Date().toLocaleString("zh-CN", { hour12: false }) }, entry));
  setAudit(list);
}

function getHistory() { try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch { return []; } }
function setHistory(list) { try { localStorage.setItem(HKEY, JSON.stringify(list.slice(0, 50))); } catch {} scheduleSync(); }
function pushHistory(rec) {
  const list = getHistory();
  const k = rec.name + "__" + rec.size;
  const i = list.findIndex((r) => r.name + "__" + r.size === k);
  if (i >= 0) list[i] = rec; else list.unshift(rec);
  setHistory(list);
}

/* ---------- 本机磁盘工作区（SQLite 自动落盘） ----------
   localStorage 只作快速缓存；服务端 data/workspace.db 才是正式底稿。
   每次变更 debounce 提交；启动时按 updatedAt 取较新的一份，
   因此清空浏览器缓存、换浏览器、重装后都能接续，留痕也不会被随手抹掉。 */
const WS_TS_KEY = "docdesk_workspace_ts_v1";
let wsLocalTs = 0, wsAvailable = false, wsApplying = false;
let wsBusy = false, wsPending = false, wsTimer = null, workspaceStatusCache = null;
try { wsLocalTs = Number(localStorage.getItem(WS_TS_KEY)) || 0; } catch (e) {}

function setSyncState(kind, label) {
  if (!statusChip || !statusText) return;
  statusChip.className = "status-chip" +
    (kind === "saved" ? " saved" : kind === "syncing" ? " syncing" : kind === "offline" ? " offline" : "");
  statusText.textContent = label;
}

function workspacePayload() {
  return {
    version: APP_VERSION,
    updatedAt: Date.now(),
    case: getCase(),
    clients: getClients(),
    cases: getCases(),
    activeCaseId: currentCaseId(),
    templates: getCustomTemplates(),
    schemes: getSchemes(),
    accountChart: getAccountChart(),
    exportMaps: getExportMaps(),
    audit: getAudit(),
    theme: document.documentElement.getAttribute("data-theme") || "light",
    documents: state.queue.filter((q) => q.status === "done" && q.data).map((q) => ({
      name: q.name, size: q.size, data: q.data, tpl: q.tpl || "general",
      caseId: q.caseId || currentCaseId(),
      reviewed: !!q.reviewed, ts: q.ts || Date.now(),
    })),
  };
}

function scheduleSync(delay) {
  if (NO_SERVER_WS || wsApplying) return;
  clearTimeout(wsTimer);
  wsTimer = setTimeout(() => { pushWorkspace(); }, delay == null ? 900 : delay);
}

async function flushWorkspace() {
  clearTimeout(wsTimer);
  if (wsBusy) await new Promise((r) => setTimeout(r, 300));
  await pushWorkspace();
}

async function pushWorkspace() {
  if (NO_SERVER_WS || wsApplying) return;
  if (wsBusy) { wsPending = true; return; }
  wsBusy = true;
  setSyncState("syncing", "同步中…");
  const payload = workspacePayload();
  try {
    const resp = await fetch("api/workspace", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const out = await resp.json();
    wsAvailable = true;
    wsLocalTs = payload.updatedAt;
    try { localStorage.setItem(WS_TS_KEY, String(wsLocalTs)); } catch (e) {}
    const t = (out.savedAt || "").slice(11, 16);
    setSyncState("saved", t ? "已落盘 " + t : "已落盘");
  } catch (e) {
    wsAvailable = false;
    setSyncState("offline", "仅本机（未落盘）");
  } finally {
    wsBusy = false;
    if (wsPending) { wsPending = false; scheduleSync(200); }
  }
}

function applyWorkspace(ws) {
  wsApplying = true;
  try {
    if (ws.case && typeof ws.case === "object") saveCase(Object.assign({}, DEFAULT_CASE, ws.case));
    if (Array.isArray(ws.clients)) setClients(ws.clients, true);
    if (Array.isArray(ws.cases)) setCases(ws.cases, true);
    if (ws.activeCaseId) setActiveCaseId(ws.activeCaseId, true);
    if (Array.isArray(ws.templates)) saveCustomTemplates(ws.templates);
    if (Array.isArray(ws.schemes)) setSchemes(ws.schemes, true);
    if (Array.isArray(ws.accountChart)) setAccountChart(ws.accountChart, true);
    if (Array.isArray(ws.exportMaps)) setExportMaps(ws.exportMaps, true);
    if (Array.isArray(ws.audit)) setAudit(ws.audit);
    const docs = Array.isArray(ws.documents) ? ws.documents : [];
    setHistory(docs.slice(0, 50));
    state.queue = []; state.selectedId = null; state.seq = 0;
    docs.forEach((rec) => state.queue.push({
      id: ++state.seq, name: rec.name, size: rec.size, status: "done", data: rec.data,
      tpl: rec.tpl || "general", caseId: rec.caseId || "",
      reviewed: !!rec.reviewed, ts: rec.ts || 0, fromHistory: true,
    }));
    const theme = ws.theme === "dark" ? "dark" : "light";
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    renderTemplateSelect(); renderCaseChip(); renderAuditList(); renderQueue(); syncClearBtn();
    skeletonEl.hidden = true;
    if (state.queue[0]) selectItem(state.queue[0].id);
    else { resultEl.hidden = true; emptyEl.hidden = false; }
  } finally { wsApplying = false; }
}

async function initWorkspace() {
  if (IS_ONLINE) { setSyncState("offline", "在线试用 · 数据仅存本浏览器"); wsAvailable = false; return; }
  if (IS_FILE) { setSyncState("local", "本地运行 · 预览模式"); return; }
  try {
    const resp = await fetch("api/workspace", { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const ws = await resp.json();
    wsAvailable = true;
    const serverTs = Number(ws.updatedAt) || 0;
    const serverHasData = (ws.documents || []).length > 0 ||
      !!(ws.case && ws.case.name && ws.case.name !== DEFAULT_CASE.name);
    if (serverTs > wsLocalTs && serverHasData) {
      applyWorkspace(ws);
      wsLocalTs = serverTs;
      try { localStorage.setItem(WS_TS_KEY, String(wsLocalTs)); } catch (e) {}
      setSyncState("saved", "已从磁盘恢复 " + (ws.documents || []).length + " 份");
      toast("已从本机工作区恢复 " + (ws.documents || []).length + " 份结果");
    } else if (wsLocalTs >= serverTs) {
      scheduleSync(300);   // 本地更新或首次迁移：把结果写进磁盘
    } else {
      setSyncState("saved", "已落盘");
    }
    workspaceStatusCache = await (await fetch("api/workspace/status")).json();
    refreshSyncMeta();
  } catch (e) {
    wsAvailable = false;
    setSyncState("offline", "仅本机（未落盘）");
  }
}

function refreshSyncMeta() {
  if (IS_ONLINE) {
    const badge = document.getElementById("ws-state");
    if (badge) badge.textContent = "试用模式";
    const el = document.getElementById("snap-meta");
    if (el) el.innerHTML = '<span class="muted">在线试用：工作区与快照保存在当前浏览器，不上传服务器。</span>';
    return;
  }
  const badge = document.getElementById("ws-state");
  if (badge) badge.textContent = wsAvailable ? "已启用" : "未连接";
  const el = document.getElementById("snap-meta");
  if (!el) return;
  const s = workspaceStatusCache;
  if (!s || !wsAvailable) {
    el.innerHTML = '<span class="muted">当前未连接本机工作区，结果仅保存在浏览器。</span>';
    return;
  }
  el.innerHTML = '<span class="ws-line"><b>' + escapeHtml(s.db) + "</b> · " +
    (s.sizeBytes / 1024).toFixed(0) + " KB · " + s.documents + " 份结果 · " +
    s.audit + " 条留痕 · " + s.snapshots + " 个快照" +
    (s.savedAt ? " · 最近保存 " + escapeHtml(s.savedAt) : "") + "</span>";
}

/* 在线试用 / file 预览：快照存浏览器，不依赖服务端磁盘 */
const LS_SNAP_KEY = "docdesk_snapshots_v1";
function getLocalSnapshots() {
  try { return JSON.parse(localStorage.getItem(LS_SNAP_KEY) || "[]"); } catch (e) { return []; }
}
function setLocalSnapshots(list) {
  try { localStorage.setItem(LS_SNAP_KEY, JSON.stringify(list.slice(0, 20))); } catch (e) {}
}

async function refreshSnapshots() {
  const list = document.getElementById("snap-list");
  if (!list) return;
  if (NO_SERVER_WS) {
    const items = getLocalSnapshots();
    if (!items.length) {
      list.innerHTML = '<div class="tpl-empty">当前为在线试用模式，快照保存在本浏览器。点击「创建快照」保存当前工作区。</div>';
      return;
    }
    list.innerHTML = items.map((s) =>
      '<div class="snap-row"><div class="snap-info"><b>' + escapeHtml(s.name) + "</b><span>" +
      escapeHtml(s.createdAt) + " · " + s.documents + " 份 · " + (s.bytes / 1024).toFixed(0) + " KB · 浏览器本地</span></div>" +
      '<div class="snap-btns">' +
      '<button class="btn ghost xs" data-snap="restore" data-id="' + escapeAttr(s.id) + '">回滚</button>' +
      '<button class="btn ghost xs" data-snap="download" data-id="' + escapeAttr(s.id) + '">下载</button>' +
      '<button class="btn ghost xs" data-snap="delete" data-id="' + escapeAttr(s.id) + '">删除</button>' +
      "</div></div>").join("");
    list.querySelectorAll("[data-snap]").forEach((b) => {
      b.onclick = () => snapshotAction(b.dataset.snap, b.dataset.id);
    });
    return;
  }
  try {
    const st = await (await fetch("api/workspace/status")).json();
    const data = await (await fetch("api/workspace/snapshots")).json();
    workspaceStatusCache = st;
    refreshSyncMeta();
    const items = data.items || [];
    if (!items.length) {
      list.innerHTML = '<div class="tpl-empty">暂无快照。点击「创建快照」保存当前工作区，之后可随时回滚。</div>';
      return;
    }
    list.innerHTML = items.map((s) =>
      '<div class="snap-row"><div class="snap-info"><b>' + escapeHtml(s.name) + "</b><span>" +
      escapeHtml(s.createdAt) + " · " + s.documents + " 份 · " + (s.bytes / 1024).toFixed(0) + " KB</span></div>" +
      '<div class="snap-btns">' +
      '<button class="btn ghost xs" data-snap="restore" data-id="' + escapeAttr(s.id) + '">回滚</button>' +
      '<button class="btn ghost xs" data-snap="download" data-id="' + escapeAttr(s.id) + '">下载</button>' +
      '<button class="btn ghost xs" data-snap="delete" data-id="' + escapeAttr(s.id) + '">删除</button>' +
      "</div></div>").join("");
    list.querySelectorAll("[data-snap]").forEach((b) => {
      b.onclick = () => snapshotAction(b.dataset.snap, b.dataset.id);
    });
  } catch (e) {
    list.innerHTML = '<div class="tpl-empty">无法读取本机工作区：' + escapeHtml(e.message || e) + "</div>";
  }
}

async function snapshotAction(action, id) {
  if (NO_SERVER_WS) {
    const list = getLocalSnapshots();
    const snap = list.find((s) => s.id === id);
    if (!snap) { toast("快照不存在"); return; }
    if (action === "delete") {
      if (!confirm("删除该快照？此操作不可撤销。")) return;
      setLocalSnapshots(list.filter((s) => s.id !== id));
      refreshSnapshots(); toast("快照已删除"); return;
    }
    if (action === "download") {
      download(JSON.stringify(snap.workspace, null, 2),
               safeFileName(snap.name || "快照") + "_工作区.json", "application/json");
      toast("已下载快照备份"); return;
    }
    if (action === "restore") {
      if (!confirm("回滚到该快照？当前工作区将被覆盖。")) return;
      applyWorkspace(snap.workspace);
      toast("已回滚到「" + snap.name + "」");
      refreshSnapshots(); return;
    }
  }
  const url = "api/workspace/snapshot/" + encodeURIComponent(id);
  try {
    if (action === "delete") {
      if (!confirm("删除该快照？此操作不可撤销。")) return;
      await fetch(url, { method: "DELETE" });
      refreshSnapshots(); toast("快照已删除");
      return;
    }
    if (action === "download") {
      const snap = await (await fetch(url)).json();
      download(JSON.stringify(snap.workspace, null, 2),
               safeFileName(snap.name || "快照") + "_工作区.json", "application/json");
      toast("已下载快照备份");
      return;
    }
    if (action === "restore") {
      if (!confirm("回滚到该快照？当前工作区将被覆盖（建议先为当前状态创建一份快照）。")) return;
      const out = await (await fetch(url + "/restore", { method: "POST" })).json();
      if (!out.workspace) throw new Error(out.error || "快照不存在");
      applyWorkspace(out.workspace);
      wsLocalTs = Number(out.workspace.updatedAt) || Date.now();
      try { localStorage.setItem(WS_TS_KEY, String(wsLocalTs)); } catch (e) {}
      scheduleSync(200);
      toast("已回滚到「" + out.name + "」");
      refreshSnapshots();
    }
  } catch (e) { toast("操作失败：" + (e.message || e)); }
}

async function createSnapshotNow() {
  const nameEl = document.getElementById("snap-name");
  const name = nameEl ? nameEl.value.trim() : "";
  if (NO_SERVER_WS) {
    const ws = workspacePayload();
    const snap = {
      id: "ls-" + Date.now(),
      name: name || ("快照 " + new Date().toLocaleString("zh-CN")),
      createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      documents: ws.documents.length,
      bytes: JSON.stringify(ws).length,
      workspace: ws,
    };
    const list = getLocalSnapshots();
    list.unshift(snap);
    setLocalSnapshots(list);
    if (nameEl) nameEl.value = "";
    refreshSnapshots();
    toast("已创建浏览器本地快照（" + snap.documents + " 份）");
    return;
  }
  try {
    await flushWorkspace();   // 快照读磁盘，先确保当前状态已落盘
    const out = await (await fetch("api/workspace/snapshot", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })).json();
    if (nameEl) nameEl.value = "";
    toast("已创建快照「" + out.name + "」（" + out.documents + " 份）");
    refreshSnapshots();
  } catch (e) { toast("创建快照失败：" + (e.message || e)); }
}

/* ---------- 文件队列交互 ---------- */
dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => handleFiles(fileInput.files));
["dragenter", "dragover"].forEach((e) =>
  dropzone.addEventListener(e, (ev) => { ev.preventDefault(); dropzone.classList.add("drag"); })
);
["dragleave", "drop"].forEach((e) =>
  dropzone.addEventListener(e, (ev) => { ev.preventDefault(); dropzone.classList.remove("drag"); })
);
dropzone.addEventListener("drop", (ev) => {
  if (ev.dataTransfer && ev.dataTransfer.files) handleFiles(ev.dataTransfer.files);
});

importFolderBtn.addEventListener("click", (e) => { e.stopPropagation(); folderInput.click(); });
folderInput.addEventListener("change", () => handleFiles(folderInput.files));

viewToggle.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentView = btn.dataset.view;
    viewToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    const item = state.queue.find((q) => q.id === state.selectedId);
    if (item && item.data) applyView(item);
  });
});

function fmtSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function handleFiles(fileList) {
  if (IS_FILE) { toast("预览模式：请运行 python app.py 启动本地服务后解析真实文件"); return; }
  const allowed = /\.(pdf|txt|md|csv|json|html?|docx?|xlsx?|png|jpe?g|bmp|webp|tiff?)$/i;
  const maxBytes = 40 * 1024 * 1024;
  const added = [];
  let skipped = 0;
  for (const file of fileList) {
    if (file.name && !allowed.test(file.name)) { skipped++; continue; }
    if (file.size > maxBytes) { skipped++; continue; }
    const item = { id: ++state.seq, name: file.name, size: file.size, status: "parsing", data: null, file, tpl: state.defaultTpl, caseId: currentCaseId(), fromHistory: false };
    state.queue.push(item);
    added.push(item);
  }
  // 批量入队后只重绘一次（原逻辑每份都全量重绘，20 份会重绘 20+ 次）
  if (added.length) {
    renderQueue();
    if (state.selectedId === null) selectItem(added[0].id);
    // 限制并发：避免几十份文件同时打满浏览器连接与服务端线程池
    runPool(added, 4, processItem);
  }
  if (!added.length) toast(skipped
    ? "这些文件不支持或超过 40MB（支持 PDF · Word · Excel · 图片 · TXT · CSV · JSON · HTML）"
    : "没有可解析的文件（支持 PDF · Word · Excel · 图片 · TXT · CSV · JSON · HTML）");
  fileInput.value = "";
  folderInput.value = "";
}

/* 轻量并发池：按限流数执行异步任务，全部完成后 resolve。 */
async function runPool(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      try { await worker(item); } catch (e) {
        item.status = "error"; item.error = String(e.message || e); renderQueue();
      }
    }
  });
  await Promise.all(runners);
}

/* 按解析结果自动对齐单据类型：避免上传发票却停在「通用」模板，
   导致字段全被标为「其它」、且缺少模板必填项校验。用户手动选择优先。 */
function guessTemplate(d, fallback) {
  const t = String(d.doc_type || "");
  if (/发票|invoice|vat/i.test(t)) return "vat";
  if (/收据|receipt/i.test(t)) return "receipt";
  if (/报销|reimburs/i.test(t)) return "reimbursement";
  if (/采购|purchase/i.test(t)) return "purchase";
  if (/工资|薪|payroll/i.test(t)) return "payroll";
  if (/流水|bank/i.test(t)) return "bank";
  const keys = (d.fields || []).map((f) => String(f.key || ""));
  if (keys.includes("invoice_no") && (keys.includes("tax") || keys.includes("total"))) return "vat";
  return fallback || "general";
}

async function processItem(item) {
  const fd = new FormData();
  fd.append("file", item.file);
  fd.append("mode", modeSelect.value);
  const controller = new AbortController();
  // 单份文件解析超时 120 秒（扫描件 OCR 可能较慢），避免永久挂在「解析中」
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const resp = await fetch("api/extract", { method: "POST", body: fd, signal: controller.signal });
    if (!resp.ok) {
      let detail = "";
      try { detail = (await resp.json()).detail || ""; } catch (e) {}
      throw new Error(detail || ("HTTP " + resp.status));
    }
    item.data = await resp.json();
    item.status = "done";
    if (!item.tplLocked) {
      const before = item.tpl || state.defaultTpl;
      const guessed = guessTemplate(item.data, before);
      item.tpl = guessed;
      if (guessed !== before && state.queue.length === 1)
        toast("已按「" + getTemplateName(guessed) + "」模板对齐字段，可在右上角切换");
    }
    persistItem(item);
    syncClearBtn();
  } catch (err) {
    item.status = "error";
    item.error = err.name === "AbortError"
      ? "解析超时（超过 120 秒），请重试或改用更小的文件" : String(err.message || err);
  } finally {
    clearTimeout(timer);
  }
  renderQueue();
  if (state.selectedId === item.id) selectItem(item.id);
  else if (item.status === "done") selectItem(item.id);
}

/* ---------- 渲染队列 ---------- */
function renderQueue() {
  queueCount.textContent = state.queue.length;
  const doneCount = state.queue.filter((q) => q.status === "done" && q.data).length;
  exportAllBtn.hidden = doneCount < 2;
  summaryBtn.hidden = doneCount < 2;
  queueEl.innerHTML = "";
  const q = (state.search || "").trim().toLowerCase();
  for (const item of state.queue) {
    if (q) {
      const hay = (item.name + " " + JSON.stringify(item.data || "")).toLowerCase();
      if (!hay.includes(q)) continue;
    }
    const li = document.createElement("li");
    li.className = (item.id === state.selectedId ? "active " : "") + "s-" + item.status;
    li.dataset.id = item.id;
    li.tabIndex = 0;
    const ext = (item.name.split(".").pop() || "").toLowerCase();
    const isImg = /\.(png|jpe?g|bmp|webp)$/i.test(item.name);
    const statusText = item.status === "parsing"
      ? (isImg ? "OCR 识别中…" : "解析中")
      : item.status === "error" ? "失败"
      : (item.reviewed ? "已复核" : "待复核");
    li.innerHTML =
      '<span class="q-ico ' + (ext || "doc") + '">' + ICONS.file + (ext ? '<span class="q-ext">' + escapeHtml(ext) + "</span>" : "") + "</span>" +
      '<span class="q-body"><span class="q-name">' + escapeHtml(item.name) + "</span>" +
      '<span class="q-meta"><span class="dot ' + item.status + '"></span>' + statusText +
      (item.size ? " · " + fmtSize(item.size) : "") +
      (item.caseId && item.caseId !== currentCaseId()
        ? " · " + escapeHtml(((getCases().find((k) => k.id === item.caseId) || {}).name) || "其他案卷") : "") +
      "</span></span>";
    li.addEventListener("click", () => selectItem(item.id));
    li.addEventListener("keydown", (e) => { if (e.key === "Enter") selectItem(item.id); });
    queueEl.appendChild(li);
  }
  updateExportHint();
}

function selectItem(id) {
  const item = state.queue.find((q) => q.id === id);
  if (!item) return;
  state.selectedId = id;
  renderQueue();
  templateSelect.value = item.tpl || state.defaultTpl;
  if (item.status === "parsing") {
    emptyEl.hidden = true; resultEl.hidden = true; skeletonEl.hidden = false;
  } else if (item.data) {
    skeletonEl.hidden = true; emptyEl.hidden = true; resultEl.hidden = false;
    renderResult(item);
  } else {
    skeletonEl.hidden = true; resultEl.hidden = true; emptyEl.hidden = false;
    emptyEl.querySelector("h3").textContent = "解析失败";
    emptyEl.querySelector("p").innerHTML = escapeHtml(item.error || "未知错误") + "。<br/>请重试或检查文件。";
  }
}

/* ---------- 渲染结果 ---------- */
function renderResult(item) {
  const d = item.data;
  document.getElementById("r-name").textContent = item.name;
  document.getElementById("r-type").textContent = d.doc_type || "通用单据";
  // 文档头卡：类型色标 + 真实元信息
  const ext = (item.name.split(".").pop() || "").toLowerCase();
  const ico = document.getElementById("r-file-ico");
  if (ico) ico.className = "rh-file-ico " + (ext || "doc");
  const fieldsN = (d.fields || []).length;
  const liN = (d.line_items || []).length;
  const lineCount = (d.raw_text || "").split(/\r?\n/).filter((s) => s.trim()).length;
  const bits = ['<span class="rm-ext">' + escapeHtml((ext || "doc").toUpperCase()) + "</span>"];
  if (item.size) bits.push(escapeHtml(fmtSize(item.size)));
  bits.push(fieldsN + " 字段 · " + liN + " 明细");
  if (lineCount) bits.push("原文 " + lineCount + " 行");
  if (d.page_count > 1) bits.push("共 " + d.page_count + " 页");
  if (typeof d.elapsed_ms === "number") bits.push('<span title="服务端解析耗时">' + d.elapsed_ms + " ms" + (d.cache_hit ? " · 缓存" : "") + "</span>");
  if (d.ocr_used || d.source_type === "image") bits.push('<span class="ocr-tag" title="本单据经本地 OCR 识别，请以原文对照人工核对">OCR</span>');
  const metaEl = document.getElementById("r-meta");
  if (metaEl) metaEl.innerHTML =
    '<span class="rm-status"><i></i>' + (item.fromHistory ? "历史记录" : "本次解析") + "</span>" +
    '<span class="rm-review ' + (item.reviewed ? "yes" : "no") + '">' + (item.reviewed ? "已复核" : "待复核") + "</span>" +
    bits.map((b) => '<span class="rm-bit">' + b + "</span>").join("");
  const rb = document.getElementById("review-btn");
  if (rb) {
    rb.textContent = item.reviewed ? "取消复核" : "标记复核";
    rb.classList.toggle("is-reviewed", !!item.reviewed);
    rb.title = item.reviewed ? "取消当前单据的复核标记" : "确认字段已核对无误后标记";
  }
  // 切换文件时重置对照页；解析警告明确呈现，不再静默失败
  verifyPage = 0;
  pendingVerifyKey = null;
  const rw = document.getElementById("result-warn");
  const warns = d.warnings || [];
  if (rw) {
    rw.hidden = warns.length === 0;
    rw.innerHTML = warns.length
      ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg><div>' + warns.map((w) => escapeHtml(w)).join("<br/>") + "</div>"
      : "";
  }
  renderSummary(d);
  renderFields(item);
  renderLineItems(item);
  renderChecks(item);
  resultEl.querySelectorAll(".actions .btn").forEach((b) => (b.onclick = () => onAction(b.dataset.act, item)));
  reparseBtn.onclick = () => {
    if (IS_FILE) { toast("预览模式：无法重新解析"); return; }
    item.status = "parsing"; renderQueue(); selectItem(item.id); processItem(item);
  };
  if (rb) rb.onclick = () => toggleReview(item);
  applyView(item);
}

/* 人工复核状态：修改任一字段后自动回退为待复核，避免"复核后又改值"的交付风险 */
function toggleReview(item) {
  if (!item || !item.data) return;
  item.reviewed = !item.reviewed;
  persistItem(item);
  renderQueue(); renderResult(item);
  toast(item.reviewed ? "已标记为复核通过" : "已取消复核标记");
  updateExportHint();
}

function updateExportHint() {
  const done = state.queue.filter((q) => q.status === "done" && q.data);
  if (!done.length) return;
  const pending = done.filter((q) => !q.reviewed).length;
  const hint = document.querySelector(".actions-bar .ab-label");
  if (hint && !hint.dataset.base) hint.dataset.base = hint.innerHTML;
  if (hint && hint.dataset.base) {
    hint.innerHTML = hint.dataset.base + (pending
      ? '<span class="review-hint"> · ' + pending + " 份待复核</span>"
      : '<span class="review-hint ok"> · 全部已复核</span>');
  }
}

function applyView(item) {
  const showVerify = currentView === "verify";
  tablesEl.hidden = showVerify;
  verifyEl.hidden = !showVerify;
  if (showVerify) renderVerify(item);
}

function moneyOf(s) {
  if (s == null) return 0;
  const n = parseFloat(String(s).replace(/[^\d.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}
function fmtMoney(n) { return "¥" + n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function fieldDisplay(f) {
  if (!f || f.value == null || String(f.value).trim() === "") return "—";
  const isMoney = /金额|价|款|额|合计|小写|大写|费|fee|amount|price|total/i.test(f.label || "");
  if (isMoney) {
    const n = moneyOf(f.value);
    if (n !== 0) return fmtMoney(n);
  }
  return String(f.value);
}

/* 单据总金额口径：优先取「价税合计 / 合计 / 总额」等含税实付字段，
   没有时才回退到明细合计（不含税），避免汇总时少算税额。
   与后端 /api/export 汇总表的「价税合计」列保持一致。 */
function docTotal(d) {
  const hit = (d.fields || []).find(
    (f) => !/^明细/.test(f.label || "") && /合计|总额|价税|金额|total|amount/i.test(f.label || "")
  );
  const v = hit ? moneyOf(hit.value) : 0;
  if (v > 0) return v;
  let sum = 0;
  (d.line_items || []).forEach((it) => (sum += moneyOf(it.amount)));
  return sum;
}

function renderSummary(d) {
  const fields = d.fields || [];
  const li = d.line_items || [];
  const total = docTotal(d);
  const hi = fields.filter((f) => (f.confidence || 0) >= 0.85).length;
  const quality = fields.length ? Math.round((hi / fields.length) * 100) : 0;
  document.getElementById("sm-fields").textContent = fields.length;
  document.getElementById("sm-li").textContent = li.length;
  document.getElementById("sm-amount").textContent = total > 0 ? fmtMoney(total) : "—";
  document.getElementById("sm-quality").textContent = quality + "%";
  const ring = document.getElementById("sm-quality-ring");
  if (ring) ring.style.background = "conic-gradient(var(--accent) " + quality + "%, var(--surface-3) 0)";
}

function fieldsForView(d, tpl) {
  const byKey = {}, byLabel = {};
  (d.fields || []).forEach((f) => { if (f.key) byKey[f.key] = f; if (f.label) byLabel[f.label] = f; });
  const specs = getTemplateSpecs(tpl);
  const out = [];
  specs.forEach((spec) => {
    const f = byKey[spec.key] || byLabel[spec.label];
    out.push(f ? { src: f, spec, placeholder: false } : { src: null, spec, placeholder: true });
  });
  (d.fields || []).forEach((f) => {
    const inTpl = specs.some((s) => s.key === f.key || s.label === f.label);
    if (!inTpl) out.push({ src: f, spec: { label: f.label, key: f.key }, placeholder: false, extra: true });
  });
  return out;
}

function renderFields(item) {
  const d = item.data;
  const tpl = item.tpl || state.defaultTpl;
  const rows = fieldsForView(d, tpl);
  const shown = state.lowOnly
    ? rows.filter((r) => r.placeholder || (r.src && (r.src.confidence || 0) < 0.85))
    : rows;
  const bf = document.getElementById("bh-fields");
  if (bf) bf.textContent = state.lowOnly ? shown.length + "/" + rows.length : rows.length;
  const tbody = document.querySelector("#fields-table tbody");
  tbody.innerHTML = "";
  if (!shown.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted" style="text-align:center;padding:14px;">' +
      (state.lowOnly ? "当前没有待复核字段（已识别字段置信度均 ≥ 85%）" : "该模板无预置字段，或未识别到字段") +
      "</td></tr>";
    return;
  }
  shown.forEach((row) => {
    const tr = document.createElement("tr");
    const spec = row.spec;
    if (row.placeholder) {
      const c = 0;
      tr.innerHTML =
        '<td class="ci"><span class="fi">' + fieldIcon(spec.label) + "</span></td>" +
        '<td class="flabel">' + escapeHtml(spec.label) + "</td>" +
        '<td class="val placeholder editable" data-kind="field" data-key="' + escapeAttr(spec.key || "") + '" data-label="' + escapeAttr(spec.label) + '" data-placeholder="1" title="点击填写">—</td>' +
        '<td class="cc"><span class="conf"><span class="track"></span>待填</span></td>';
    } else {
      const f = row.src;
      const c = f.confidence || 0;
      const cls = c >= 0.85 ? "" : "lo";
      if (c < 0.85) tr.className = "lo-conf";
      const title = escapeAttr(f.value || "");
      tr.innerHTML =
        '<td class="ci"><span class="fi">' + fieldIcon(f.label) + "</span></td>" +
        '<td class="flabel">' + escapeHtml(f.label) + (row.extra ? ' <span class="muted">·其它</span>' : "") + "</td>" +
        '<td class="val editable" data-kind="field" data-key="' + escapeAttr(f.key || "") + '" data-label="' + escapeAttr(f.label) + '" data-placeholder="0" title="' + title + '"><span class="vtext">' + escapeHtml(fieldDisplay(f)) + '</span><button type="button" class="copy-val" data-copy="' + escapeAttr(f.value || "") + '" title="复制该值" aria-label="复制该值">' + ICONS.copy + '</button></td>' +
        '<td class="cc"><span class="conf ' + cls + '"><span class="track"><i style="width:' + Math.round(c * 100) + '%"></i></span>' + Math.round(c * 100) + "%</span></td>";
    }
    tbody.appendChild(tr);
  });
  bindEditable(tbody, item, "field");
  bindCopyVal(tbody);
}

function bindCopyVal(scope) {
  scope.querySelectorAll(".copy-val").forEach((b) => {
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const v = b.dataset.copy || "";
      copyText(v, v ? "已复制：" + String(v).slice(0, 24) : "没有可复制的内容");
    });
  });
}

function copyText(text, okMsg) {
  const t = String(text || "");
  if (!t) { toast(okMsg || "没有可复制的内容"); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => toast(okMsg || "已复制")).catch(() => fallbackCopy(t, okMsg));
  } else {
    fallbackCopy(t, okMsg);
  }
}

function fallbackCopy(text, okMsg) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); toast(okMsg || "已复制"); }
  catch { toast("复制失败，请手动选择文本"); }
  document.body.removeChild(ta);
}

function renderLineItems(item) {
  const d = item.data;
  const block = document.getElementById("li-block");
  const tbody = document.querySelector("#li-table tbody");
  const items = d.line_items || [];
  const bl = document.getElementById("bh-li");
  if (bl) bl.textContent = items.length;
  if (!items.length) {
    block.hidden = true;
    const f0 = document.getElementById("li-foot"); if (f0) f0.innerHTML = "";
    return;
  }
  block.hidden = false;
  tbody.innerHTML = "";
  items.forEach((it, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="val editable" data-kind="li" data-i="' + i + '" data-col="name" title="' + escapeAttr(it.name || "") + '">' + escapeHtml(it.name || "") + "</td>" +
      '<td class="num val editable" data-kind="li" data-i="' + i + '" data-col="qty" title="' + escapeAttr(it.qty || "") + '">' + escapeHtml(it.qty || "") + "</td>" +
      '<td class="num val editable" data-kind="li" data-i="' + i + '" data-col="price" title="' + escapeAttr(it.unit_price || "") + '">' + escapeHtml(it.unit_price ? fmtMoney(moneyOf(it.unit_price)) : "") + "</td>" +
      '<td class="num val editable" data-kind="li" data-i="' + i + '" data-col="amount" title="' + escapeAttr(it.amount || "") + '">' + escapeHtml(it.amount ? fmtMoney(moneyOf(it.amount)) : "") + "</td>";
    tbody.appendChild(tr);
  });
  bindEditable(tbody, item, "li");
  const sum = items.reduce((a, it) => a + moneyOf(it.amount), 0);
  const foot = document.getElementById("li-foot");
  if (foot) foot.innerHTML = '<tr><td colspan="3" class="li-sum-label">明细合计</td><td class="num li-sum-val">' + fmtMoney(sum) + "</td></tr>";
}

/* ---------- 原文对照视图 ---------- */
function verifyPages(d) {
  return (d.pages && d.pages.length)
    ? d.pages
    : [{ page: 1, label: "", text: d.raw_text || "" }];
}

function renderVerify(item) {
  const d = item.data;
  const pages = verifyPages(d);
  if (verifyPage >= pages.length) verifyPage = 0;

  // 多页文档（PDF 多页 / Excel 多工作表）显示页码切换
  const tabWrap = document.getElementById("page-tabs");
  if (tabWrap) {
    if (pages.length > 1) {
      tabWrap.hidden = false;
      tabWrap.innerHTML = pages.map((p, i) =>
        '<button type="button" class="page-tab' + (i === verifyPage ? " active" : "") + '" data-i="' + i + '">第 ' +
        (p.page || i + 1) + ' 页' + (p.label ? ' · ' + escapeHtml(p.label) : '') + '</button>').join("");
      tabWrap.querySelectorAll(".page-tab").forEach((b) => {
        b.addEventListener("click", () => { verifyPage = parseInt(b.dataset.i, 10); renderVerify(item); });
      });
    } else {
      tabWrap.hidden = true;
      tabWrap.innerHTML = "";
    }
  }

  const cur = pages[verifyPage] || pages[0];
  const text = cur.text || "";
  vSrcEl.innerHTML = "";
  vMapEl.innerHTML = "";

  if (!text.trim()) {
    vSrcEl.innerHTML = '<div class="v-map-empty">该页没有可对照的原文文本（图片型 PDF 页或空工作表）。<br/>可切换上方页码查看其它页。</div>';
    const bv0 = document.getElementById("bh-verify"); if (bv0) bv0.textContent = "0";
    return;
  }

  const lines = text.split("\n");
  const bv = document.getElementById("bh-verify");
  if (bv) bv.textContent = lines.length;

  // 组装对照条目：字段（与字段表一致）+ 明细行
  const frows = fieldsForView(d, item.tpl || state.defaultTpl);
  const mapRows = [];
  frows.forEach((row) => {
    const f = row.src;
    if (!f) return;
    mapRows.push({ key: f.key || row.spec.key, label: row.spec.label, value: f.value, source: f.source, page: f.page || 0 });
  });
  (d.line_items || []).forEach((it, i) => {
    mapRows.push({ key: "li_" + i, label: "明细 · " + (it.name || ""), value: it.amount, source: it.source, page: it.page || 0 });
  });

  // 建立 行号 <-> 字段key 双向索引
  const lineKeyMap = {};   // lineIndex -> [key]
  const keyLineMap = {};   // key -> [lineIndex]
  mapRows.forEach((mr) => {
    if (!mr.source) return;
    const src = mr.source.trim();
    if (!src) return;
    const idxs = [];
    lines.forEach((ln, i) => { if (ln.trim().includes(src)) idxs.push(i); });
    if (idxs.length) {
      keyLineMap[mr.key] = idxs;
      idxs.forEach((li) => { (lineKeyMap[li] = lineKeyMap[li] || []).push(mr.key); });
    }
  });

  // 原文行
  lines.forEach((ln, i) => {
    const div = document.createElement("div");
    div.className = "vline" + (lineKeyMap[i] ? " hit" : "");
    div.dataset.line = i;
    div.innerHTML = '<span class="ln">' + (i + 1) + '</span><span class="tx">' + escapeHtml(ln.length ? ln : " ") + '</span>';
    div.addEventListener("click", () => {
      const keys = lineKeyMap[i] || [];
      vMapEl.querySelectorAll(".vmap-row").forEach((r) => r.classList.toggle("active", keys.includes(r.dataset.key)));
      vSrcEl.querySelectorAll(".vline").forEach((v) => v.classList.remove("active"));
      div.classList.add("active");
      if (keys.length) {
        const first = mapEls[keys[0]];
        if (first) first.scrollIntoView({ block: "nearest" });
      }
    });
    vSrcEl.appendChild(div);
  });

  // 字段对照清单
  if (!mapRows.length) {
    vMapEl.innerHTML = '<div class="v-map-empty">未解析到可用于对照的字段。</div>';
    return;
  }
  const mapEls = {};
  mapRows.forEach((mr) => {
    const idxs = keyLineMap[mr.key];
    const div = document.createElement("div");
    div.className = "vmap-row";
    div.dataset.key = mr.key;
    let badge = "";
    if (idxs && idxs.length) {
      badge = '<span class="lnbadge">' + (pages.length > 1 ? "P" + cur.page + "·" : "") + "L" + (idxs[0] + 1) + "</span>";
    } else if (mr.page && pages.length > 1 && mr.page !== cur.page) {
      badge = '<span class="lnbadge ghost">P' + mr.page + "</span>";
    }
    div.innerHTML =
      '<span class="fi">' + fieldIcon(mr.label) + '</span>' +
      '<span class="vm-label">' + escapeHtml(mr.label) + '</span>' +
      badge +
      '<span class="vm-val" title="' + escapeAttr(mr.value || "") + '">' + escapeHtml(mr.value || "—") + '</span>';
    div.addEventListener("click", () => {
      // 字段位于其它页：先切页，渲染完成后自动补做高亮
      if (mr.page && pages.length > 1 && mr.page !== cur.page) {
        const target = pages.findIndex((p) => p.page === mr.page);
        if (target >= 0) { pendingVerifyKey = mr.key; verifyPage = target; renderVerify(item); return; }
      }
      vMapEl.querySelectorAll(".vmap-row").forEach((r) => r.classList.remove("active"));
      div.classList.add("active");
      if (idxs && idxs.length) {
        const target = vSrcEl.querySelector('.vline[data-line="' + idxs[0] + '"]');
        if (target) {
          target.scrollIntoView({ block: "center" });
          target.classList.remove("flash"); void target.offsetWidth; target.classList.add("flash");
        }
      } else {
        toast("该字段无对应原文定位（可能来自深度解析或手工补录）");
      }
    });
    vMapEl.appendChild(div);
    mapEls[mr.key] = div;
  });

  // 跨页跳转后补做一次高亮
  if (pendingVerifyKey) {
    const key = pendingVerifyKey;
    pendingVerifyKey = null;
    const el = mapEls[key];
    if (el) el.click();
  }
}

/* ---------- 数据一致性校验 ---------- */
function parseRate(s) {
  if (!s) return 0;
  const str = String(s);
  const n = parseFloat(str.replace(/[^\d.]/g, ""));
  if (isNaN(n)) return 0;
  if (/%/.test(str)) return n / 100;
  return n > 1.5 ? n / 100 : n;  // "13" -> 0.13
}

/* 统一社会信用代码（18 位）校验位验证；返回 null 表示不像代码不做判断 */
function validUscc(s) {
  const v = String(s || "").trim().toUpperCase().replace(/\s/g, "");
  if (!v) return null;
  if (!/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(v)) return false;
  const chars = "0123456789ABCDEFGHJKLMNPQRTUWXY";
  const weights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += chars.indexOf(v[i]) * weights[i];
  return v[17] === chars[(31 - sum % 31) % 31];
}

function normName(s) { return String(s || "").replace(/[\s()（）·.,，。有限公司]/g, "").toLowerCase(); }

function computeChecks(item, doneItems) {
  const d = item.data || {};
  const checks = [];
  const fields = d.fields || [];
  const li = d.line_items || [];
  const getF = (re) => fields.find((f) => re.test(f.label || ""));
  const total = getF(/合计|金额|价税|总额|total|amount/i);
  const tax = getF(/税额|tax/i);
  const rate = getF(/税率|tax_rate|rate/i);

  // 1. 价税合计 vs 明细合计 + 税额（增值税发票惯例：明细为不含税金额）
  let liSum = 0;
  li.forEach((it) => (liSum += moneyOf(it.amount)));
  if (total && li.length) {
    const t = moneyOf(total.value);
    const taxV = tax ? moneyOf(tax.value) : 0;
    const expected = liSum + taxV;
    if (t > 0 && Math.abs(t - expected) > 0.01)
      checks.push({ status: "warn", label: "金额不平衡", detail: "价税合计 " + fmtMoney(t) + " 与（明细合计 " + fmtMoney(liSum) + " + 税额 " + fmtMoney(taxV) + "）相差 " + fmtMoney(Math.abs(t - expected)) });
    else if (t > 0)
      checks.push({ status: "ok", label: "金额平衡", detail: "价税合计与 明细合计+税额 一致：" + fmtMoney(t) });
  } else if (li.length) {
    checks.push({ status: "ok", label: "明细已识别", detail: "明细行合计 " + fmtMoney(liSum) + "（未识别到“合计”字段）" });
  }

  // 2. 税额 vs 明细合计 × 税率
  if (tax && rate) {
    const tRate = parseRate(rate.value);
    const tTax = moneyOf(tax.value);
    if (tRate > 0 && liSum > 0) {
      const exp = liSum * tRate;
      if (Math.abs(exp - tTax) > 0.01)
        checks.push({ status: "warn", label: "税额异常", detail: "按税率推算税额应为 " + fmtMoney(exp) + "，实际 " + fmtMoney(tTax) });
      else
        checks.push({ status: "ok", label: "税额一致", detail: "税额与 明细合计×税率 一致" });
    }
  }

  // 3. 必填缺失（当前模板）
  const specs = getTemplateSpecs(item.tpl || state.defaultTpl);
  const missing = specs.filter((s) => {
    const f = fields.find((x) => x.key === s.key || x.label === s.label);
    return !f || !String(f.value).trim();
  });
  if (specs.length && missing.length)
    checks.push({ status: "warn", label: "缺失 " + missing.length + " 个字段", detail: "待补录：" + missing.map((m) => m.label).join("、") });
  else if (specs.length)
    checks.push({ status: "ok", label: "字段齐全", detail: "模板要求字段均已识别" });

  // 4. 重复发票号（跨文件）
  const inv = getF(/发票|单号|编号|号码|no\.?|number/i);
  if (inv && inv.value) {
    const dup = (doneItems || []).filter(
      (o) => o.id !== item.id && o.data && (o.data.fields || []).some((f) => /发票|单号|编号|号码/i.test(f.label) && f.value === inv.value)
    );
    if (dup.length)
      checks.push({ status: "warn", label: "重复发票号", detail: "“" + inv.value + "”在 " + dup.length + " 份其它文件中出现：" + dup.map((x) => x.name).join("、") });
    else
      checks.push({ status: "ok", label: "发票号唯一", detail: "未在其余文件中发现重复" });
  }

  const meta = getCase();

  // 5. 发票号位数：纯数字时按国内 8 位（旧版）/ 20 位（数电票）校验
  if (inv && /^\d+$/.test(String(inv.value).trim())) {
    const len = String(inv.value).trim().length;
    if (len !== 8 && len !== 20)
      checks.push({ status: "warn", label: "发票号位数异常", detail: "纯数字发票号通常为 8 位或 20 位，当前 " + len + " 位，请核对原件" });
  }

  // 6. 税号校验位（统一社会信用代码 18 位）
  const tid = getF(/识别号|税号|tax.?id/i);
  if (tid && tid.value) {
    const ok = validUscc(tid.value);
    if (ok === false)
      checks.push({ status: "warn", label: "税号校验异常", detail: "“" + tid.value + "”不符合统一社会信用代码格式或校验位规则" });
    else if (ok === true)
      checks.push({ status: "ok", label: "税号校验通过", detail: "18 位统一社会信用代码格式与校验位均合法" });
  }

  // 7. 税率档位（含 1.5% 征收率等常见档）
  if (rate) {
    const rp = parseRate(rate.value) * 100;
    const tiers = [0, 1, 1.5, 3, 5, 6, 9, 13, 16, 17];
    if (rp > 0 && !tiers.some((t) => Math.abs(t - rp) < 0.05))
      checks.push({ status: "warn", label: "税率非标准档位", detail: "识别到 " + rp.toFixed(2) + "%，请核对税率（常见 1/3/6/9/13%）" });
  }

  // 8. 会计期间：单据日期应落在当前案卷期间
  if (meta.period) {
    const df = getF(/日期|开票|date/i);
    const mk = monthKey(df ? df.value : "");
    if (mk && mk !== meta.period)
      checks.push({ status: "warn", label: "日期不在案卷期间", detail: "单据日期 " + df.value + "（" + mk + "）与案卷期间 " + meta.period + " 不一致" });
    else if (mk)
      checks.push({ status: "ok", label: "期间一致", detail: "单据日期属于案卷期间 " + meta.period });
  }

  // 9. 金额小数位：人民币金额最多两位小数
  [total, tax].forEach((f) => {
    if (f && /\d+\.\d{3,}/.test(String(f.value)))
      checks.push({ status: "warn", label: "金额小数位异常", detail: f.label + "“" + f.value + "”超过两位小数，请核对原件" });
  });

  // 10. 购买方与案卷主体一致性（避免收错票）
  if (meta.entity) {
    const buyer = getF(/购买方|买方|客户|buyer/i);
    if (buyer && buyer.value) {
      const a = normName(buyer.value), b = normName(meta.entity);
      if (a && b && !a.includes(b) && !b.includes(a))
        checks.push({ status: "warn", label: "购买方与案卷主体不符", detail: "单据购买方“" + buyer.value + "”，案卷主体“" + meta.entity + "”" });
      else
        checks.push({ status: "ok", label: "购买方一致", detail: "购买方与案卷主体匹配" });
    }
  }
  return checks;
}

function renderChecks(item) {
  const block = document.getElementById("checks-block");
  const listEl = document.getElementById("checks-list");
  if (!item.data) { block.hidden = true; return; }
  const doneItems = state.queue.filter((q) => q.status === "done" && q.data);
  const checks = computeChecks(item, doneItems);
  const bc = document.getElementById("bh-checks");
  if (bc) bc.textContent = checks.length;
  block.hidden = checks.length === 0;
  listEl.innerHTML = "";
  checks.forEach((c) => {
    const div = document.createElement("div");
    div.className = "check-item " + c.status;
    const ico = c.status === "ok"
      ? '<svg class="ci-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg class="ci-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg>';
    div.innerHTML = ico + '<span class="ci-txt"><b>' + escapeHtml(c.label) + '</b><span class="ci-sub">' + escapeHtml(c.detail || "") + '</span></span>';
    listEl.appendChild(div);
  });

  const warns = checks.filter((c) => c.status === "warn");
  const copyBtn = document.getElementById("checks-copy");
  const expBtn = document.getElementById("checks-export");
  [copyBtn, expBtn].forEach((b) => {
    if (!b) return;
    b.disabled = warns.length === 0;
    b.title = warns.length ? "共 " + warns.length + " 项需复核" : "当前没有需复核的异常项";
  });
  if (copyBtn) copyBtn.onclick = () => {
    if (!warns.length) { toast("当前没有需复核的异常项"); return; }
    copyText(checksTsv(item, warns), "已复制 " + warns.length + " 项异常，可直接粘贴到表格");
  };
  if (expBtn) expBtn.onclick = () => {
    if (!warns.length) { toast("当前没有需复核的异常项"); return; }
    download(checksCsv(item, warns), "文档台_异常清单_" + safeFileName(item.name) + ".csv", "text/csv");
    toast("已导出异常清单 CSV");
  };
}

function safeFileName(s) { return String(s || "结果").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60); }
function csvCell(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
function tsvCell(v) { return String(v == null ? "" : v).replace(/[\t\r\n]+/g, " ").trim(); }
function checksTsv(item, warns) {
  const lines = [["文件", "级别", "检查项", "说明"].join("\t")];
  warns.forEach((c) => lines.push([item.name, "异常", c.label, c.detail || ""].map(tsvCell).join("\t")));
  return lines.join("\n");
}
function checksCsv(item, warns) {
  const lines = [["文件", "级别", "检查项", "说明"].map(csvCell).join(",")];
  warns.forEach((c) => lines.push([item.name, "异常", c.label, c.detail || ""].map(csvCell).join(",")));
  return "﻿" + lines.join("\n");
}

/* ---------- 内联编辑 ---------- */
function bindEditable(scope, item, kind) {
  scope.querySelectorAll("td.editable").forEach((td) => {
    td.onclick = () => {
      if (td.querySelector("input")) return;
      const cur = td.dataset.placeholder === "1" ? "" : (td.title || td.textContent);
      td.innerHTML = '<input class="cell-edit" value="' + escapeAttr(cur === "—" ? "" : cur) + '">';
      const inp = td.querySelector("input");
      inp.focus(); inp.select();
      const commit = () => {
        const v = inp.value.trim();
        const oldV = (cur === "—" ? "" : String(cur || ""));
        const changed = v !== oldV;
        if (changed) {
          pushUndo([item]);   // 必须在 recordEdit 之前，才能连同复核状态一起回退
          recordEdit(item, kind === "field" ? (td.dataset.label || td.dataset.key || "字段") : (td.dataset.col || "明细"), oldV, v);
        }
        if (kind === "field") commitField(item, td.dataset, v);
        else commitLine(item, parseInt(td.dataset.i, 10), td.dataset.col, v);
        if (v !== oldV) persistItem(item);
        const isMoney = /金额|价|款|额|合计|小写|大写|费|fee|amount|price|total/i.test(td.dataset.label || "");
        let disp = v;
        if (isMoney) { const n = moneyOf(v); if (n !== 0) disp = fmtMoney(n); }
        if (!v) disp = "—";
        td.innerHTML = '<span class="vtext">' + escapeHtml(disp) + '</span>' +
          (v ? '<button type="button" class="copy-val" data-copy="' + escapeAttr(v) + '" title="复制该值" aria-label="复制该值">' + ICONS.copy + '</button>' : "");
        td.classList.toggle("placeholder", td.dataset.placeholder === "1" && !v);
        td.title = v;
        const cb = td.querySelector(".copy-val");
        if (cb) cb.addEventListener("click", (ev) => {
          ev.stopPropagation();
          copyText(v, v ? "已复制：" + v.slice(0, 24) : "没有可复制的内容");
        });
        renderSummary(item.data);
        renderChecks(item);
        if (kind === "li" && td.dataset.col === "amount") {
          const fv = document.querySelector("#li-foot .li-sum-val");
          if (fv) fv.textContent = fmtMoney((item.data.line_items || []).reduce((a, it) => a + moneyOf(it.amount), 0));
        }
        if (currentView === "verify") renderVerify(item);
      };
      inp.onblur = commit;
      inp.onkeydown = (e) => {
        if (e.key === "Enter") inp.blur();
        else if (e.key === "Escape") { td.textContent = (td.dataset.placeholder === "1" ? "—" : (td.title || "—")); }
      };
    };
  });
}

/* 人工修正：留痕 + 回退复核状态 + 立即持久化，保证刷新后修正不丢失 */
function persistItem(item) {
  pushHistory({ name: item.name, size: item.size, data: item.data, tpl: item.tpl,
                reviewed: !!item.reviewed, ts: Date.now() });
}

function recordEdit(item, field, oldV, newV) {
  addAudit({ file: item.name, field: field, old: oldV, new: newV });
  item.reviewed = false;
  renderQueue();
  if (state.selectedId === item.id) {
    const chip = document.querySelector(".rm-review");
    if (chip) { chip.textContent = "待复核"; chip.className = "rm-review no"; }
    const rb = document.getElementById("review-btn");
    if (rb) { rb.textContent = "标记复核"; rb.classList.remove("is-reviewed"); }
  }
}

function commitField(item, ds, v) {
  const d = item.data;
  if (ds.placeholder === "1" && v) {
    d.fields = d.fields || [];
    d.fields.push({ label: ds.label, key: ds.key || undefined, value: v, confidence: 1 });
  } else {
    const f = (d.fields || []).find((x) => (ds.key && x.key === ds.key) || x.label === ds.label);
    if (f) f.value = v;
  }
}

function commitLine(item, idx, col, v) {
  const it = item.data.line_items[idx];
  if (!it) return;
  if (col === "name") it.name = v;
  else if (col === "qty") it.qty = v;
  else if (col === "price") it.unit_price = v;
  else if (col === "amount") it.amount = v;
}

/* ---------- 撤销 / 重做（人工核对效率） ----------
   以「一组修改」为单位记录快照：单次编辑是一组，批量填充是跨文件的一组，
   因此 Ctrl+Z 可以一次撤销整批，不必逐份回退。 */
const undoStack = [], redoStack = [];
const UNDO_LIMIT = 40;
function snapshotItem(item) {
  return JSON.stringify({ data: item.data, reviewed: !!item.reviewed, tpl: item.tpl || "general" });
}
function findQueueItem(id) { return state.queue.find((q) => q.id === id); }
function pushUndo(items) {
  if (!items || !items.length) return;
  undoStack.push(items.map((it) => ({ id: it.id, snap: snapshotItem(it) })));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
}
function applySnap(item, snap) {
  const o = JSON.parse(snap);
  item.data = o.data;
  item.reviewed = o.reviewed;
  item.tpl = o.tpl || item.tpl;
  persistItem(item);
}
function currentSnaps(group) {
  return group.map((g) => {
    const it = findQueueItem(g.id);
    return it ? { id: g.id, snap: snapshotItem(it) } : null;
  }).filter(Boolean);
}
function refreshHistoryViews() {
  renderQueue(); syncClearBtn(); renderAuditList(); updateExportHint();
  const cur = findQueueItem(state.selectedId);
  if (cur && cur.data) renderResult(cur);
  else { resultEl.hidden = true; emptyEl.hidden = false; }
  scheduleSync(200);
}
function undoEdit() {
  const group = undoStack.pop();
  if (!group) { toast("没有可撤销的操作"); return; }
  redoStack.push(currentSnaps(group));
  group.forEach((g) => { const it = findQueueItem(g.id); if (it) applySnap(it, g.snap); });
  refreshHistoryViews();
  toast("已撤销 " + group.length + " 处修改");
}
function redoEdit() {
  const group = redoStack.pop();
  if (!group) { toast("没有可重做的操作"); return; }
  undoStack.push(currentSnaps(group));
  group.forEach((g) => { const it = findQueueItem(g.id); if (it) applySnap(it, g.snap); });
  refreshHistoryViews();
  toast("已重做 " + group.length + " 处修改");
}

/* ---------- 批量字段填充 ---------- */
function batchTargets() {
  const sel = document.getElementById("b-scope");
  const scope = sel ? sel.value : "all";
  let list = state.queue.filter((q) => q.status === "done" && q.data);
  if (scope === "pending") list = list.filter((q) => !q.reviewed);
  else if (scope === "filtered") {
    const k = (state.search || "").trim().toLowerCase();
    list = k ? list.filter((q) => q.name.toLowerCase().includes(k)) : list;
  }
  return list;
}
function updateBatchCount() {
  const el = document.getElementById("b-count");
  if (el) el.textContent = "将影响 " + batchTargets().length + " 份单据";
}
function openBatchModal() {
  if (!state.queue.some((q) => q.status === "done" && q.data)) { toast("请先解析至少一份文件"); return; }
  updateBatchCount();
  if (batchModal) batchModal.hidden = false;
}
function applyBatch() {
  const fieldEl = document.getElementById("b-field");
  const valEl = document.getElementById("b-value");
  const field = fieldEl ? fieldEl.value.trim() : "";
  const value = valEl ? valEl.value.trim() : "";
  if (!field) { toast("请填写字段名称"); return; }
  if (!value) { toast("请填写填充值"); return; }
  const targets = batchTargets();
  if (!targets.length) { toast("当前范围内没有可填充的单据"); return; }
  if (!confirm("将把 " + targets.length + " 份单据的「" + field + "」设为「" + value + "」，并全部回退为待复核。是否继续？")) return;
  pushUndo(targets);
  targets.forEach((item) => {
    const d = item.data;
    d.fields = d.fields || [];
    const f = d.fields.find((x) => x.label === field);
    const oldV = f ? String(f.value || "") : "";
    if (f) f.value = value;
    else d.fields.push({ label: field, value: value, confidence: 1, source: "批量填充" });
    item.reviewed = false;
    addAudit({ file: item.name, field: field, old: oldV, new: value });
    persistItem(item);
  });
  renderQueue();
  const cur = findQueueItem(state.selectedId);
  if (cur && cur.data) renderResult(cur);
  if (batchModal) batchModal.hidden = true;
  toast("已填充 " + targets.length + " 份单据，可用 Ctrl+Z 撤销");
  scheduleSync(200);
}

/* ---------- 人民币金额中文大写（与后端 voucher.rmb_upper 同口径） ---------- */
function rmbUpper(value) {
  const D = "零壹贰叁肆伍陆柒捌玖";
  const S = ["", "拾", "佰", "仟"];
  const B = ["", "万", "亿", "兆"];
  let n = Math.round(Number(value || 0) * 100);
  if (!isFinite(n)) return "—";
  const neg = n < 0;
  n = Math.abs(n);
  const yuan = Math.floor(n / 100), cents = n % 100;
  const g4 = (num) => {
    let out = "", zero = false;
    for (let pos = 3; pos >= 0; pos--) {
      const v = Math.floor(num / Math.pow(10, pos)) % 10;
      if (v === 0) { if (out) zero = true; }
      else { if (zero) { out += "零"; zero = false; } out += D[v] + S[pos]; }
    }
    return out;
  };
  let out = "";
  if (yuan === 0) out = cents ? "" : D[0] + "元整";
  else {
    const groups = [];
    let rest = yuan;
    while (rest > 0) { groups.push(rest % 10000); rest = Math.floor(rest / 10000); }
    const segs = [];
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const seg = g4(groups[gi]);
      if (seg) segs.push(seg + B[gi]);
      else if (segs.length && !segs[segs.length - 1].endsWith("零")) segs.push("零");
    }
    out = (segs.join("").replace(/零+$/, "") || D[0]) + "元" + (cents === 0 ? "整" : "");
  }
  if (cents) {
    const jiao = Math.floor(cents / 10), fen = cents % 10;
    if (jiao) out += D[jiao] + "角";
    else if (fen && yuan) out += "零";
    if (fen) out += D[fen] + "分";
    else if (jiao) out += "整";
  }
  return (neg ? "负" : "") + out;
}

/* ---------- 导出 ---------- */
function tableTsv(d) {
  const lines = [];
  (d.fields || []).forEach((f) => lines.push([f.label || "", f.value || ""].join("\t")));
  if (d.line_items && d.line_items.length) {
    lines.push("");
    lines.push(["名称", "数量", "单价", "金额"].join("\t"));
    d.line_items.forEach((it) =>
      lines.push([it.name || "", it.qty || "", it.unit_price || "", it.amount || ""].join("\t")));
  }
  return lines.join("\n");
}

function onAction(act, item) {
  const d = item.data;
  if (act === "copy-table") { copyText(tableTsv(d), "已复制为表格，可直接粘贴到 Excel / 飞书"); }
  else if (act === "csv") { download(csvOf(d), item.name + ".csv", "text/csv"); toast("已导出 CSV"); }
  else if (act === "json") { download(JSON.stringify(d, null, 2), item.name + ".json", "application/json"); toast("已导出 JSON"); }
  else if (act === "xlsx") { exportXlsx(resultsForExport([item]), safeFileName(item.name) + ".xlsx"); }
  else if (act === "report") { openReport([item]); }
  else if (act === "voucher") { openVoucher([item]); }
  else if (act === "export-map") { openExportMap([item]); }
  else if (act === "package") { exportPackage([item]); }
  else if (act === "copy") {
    copyText(JSON.stringify(d, null, 2), "已复制 JSON 到剪贴板");
  }
}

exportAllBtn.onclick = () => {
  const done = state.queue.filter((q) => q.status === "done" && q.data);
  if (done.length < 2) return;
  exportXlsx(resultsForExport(done), "文档台_合并导出.xlsx");
};

/* 导出时附上真实文件名与校验结论，让工作簿成为可直接交付的成果 */
function resultsForExport(done) {
  return done.map((q) => Object.assign({}, q.data, {
    filename: q.name,
    reviewed: !!q.reviewed,
    checks: computeChecks(q, done),
  }));
}

/* ---------- 记账凭证（对接财务软件） ---------- */
let voucherScope = null;
let voucherSchemeId = "0";  // "0" = 默认（手动科目，不启用关键词映射）

function voucherConfig() {
  const v = (id, fallback) => {
    const el = document.getElementById(id);
    const s = el ? String(el.value || "").trim() : "";
    return s || fallback;
  };
  const scheme = getSchemes().find((s) => s.id === voucherSchemeId);
  return {
    expense: v("v-expense", "管理费用"),
    tax: v("v-tax", "应交税费—应交增值税（进项税额）"),
    payable: v("v-payable", "应付账款"),
    expense_code: v("v-expense-code", ""),
    tax_code: v("v-tax-code", ""),
    payable_code: v("v-payable-code", ""),
    mapping_rules: scheme ? (scheme.rules || []) : [],
    date: v("v-date", ""),
    memo: v("v-memo", "{销售方} {发票号}"),
    format: v("v-format", "general"),
    word: v("v-word", "记"),
    maker: v("v-maker", ""),
  };
}

/* ---------- 科目方案编辑器 ---------- */
function renderSchemeSelect() {
  const sel = document.getElementById("v-scheme");
  if (!sel) return;
  const list = getSchemes();
  if (voucherSchemeId !== "0" && !list.some((s) => s.id === voucherSchemeId)) voucherSchemeId = "0";
  sel.innerHTML = '<option value="0">默认 · 手动科目（不启用映射）</option>' +
    list.map((s) => '<option value="' + escapeAttr(s.id) + '">' +
      escapeHtml(s.name || "未命名方案") + "（" + (s.rules || []).length + " 条规则）</option>").join("");
  sel.value = voucherSchemeId;
  renderSchemeEditor();
}

function renderSchemeEditor() {
  const detail = document.getElementById("v-scheme-detail");
  if (!detail) return;
  const scheme = getSchemes().find((s) => s.id === voucherSchemeId);
  detail.hidden = !scheme;
  const saveBtn = document.getElementById("v-scheme-save");
  const delBtn = document.getElementById("v-scheme-del");
  if (saveBtn) saveBtn.hidden = !scheme;
  if (delBtn) delBtn.hidden = !scheme;
  if (!scheme) return;
  const nameInp = document.getElementById("v-scheme-name");
  if (nameInp && document.activeElement !== nameInp) nameInp.value = scheme.name || "";
  // 方案默认科目写入科目配置（生成预览即按此科目；用户可手动改，保存方案时回存）
  const setv = (id, s, k) => {
    const el = document.getElementById(id);
    const val = (s && s[k] && s[k].name !== undefined ? s[k].name : (s && s[k]) || "");
    if (el && document.activeElement !== el) el.value = val || "";
  };
  const setc = (id, s, k) => {
    const el = document.getElementById(id);
    const val = (s && s[k] && s[k].code) || "";
    if (el && document.activeElement !== el) el.value = val;
  };
  setv("v-expense", scheme.expense, "name");
  setc("v-expense-code", scheme.expense, "code");
  setv("v-tax", scheme.tax, "name");
  setc("v-tax-code", scheme.tax, "code");
  setv("v-payable", scheme.payable, "name");
  setc("v-payable-code", scheme.payable, "code");
  const rules = scheme.rules || [];
  const box = document.getElementById("v-rules");
  if (box) box.innerHTML = rules.length
    ? rules.map((r, i) => schemeRuleRow(r, i)).join("")
    : '<p class="muted scheme-empty">还没有规则。添加后，单据的明细名称 / 文件名 / 往来单位包含关键词时自动切换到规则科目；首个命中生效。</p>';
}

function schemeRuleRow(r, i) {
  const scope = r.scope === "party" ? "party" : "subject";
  return '<div class="v-rule" data-i="' + i + '">' +
    '<select class="inp v-rule-scope">' +
      '<option value="subject"' + (scope === "subject" ? " selected" : "") + '>费用科目</option>' +
      '<option value="party"' + (scope === "party" ? " selected" : "") + '>往来科目</option>' +
    "</select>" +
    '<input class="inp v-rule-kw" placeholder="关键词，如：高尔夫" value="' + escapeAttr(r.keyword || "") + '" />' +
    '<input class="inp v-rule-code" list="v-account-codes" placeholder="科目编码" value="' + escapeAttr(r.code || "") + '" />' +
    '<input class="inp v-rule-name" list="v-account-names" placeholder="科目名称" value="' + escapeAttr(r.name || "") + '" />' +
    '<button class="btn ghost xs v-rule-del" type="button" title="删除该规则">×</button>' +
    "</div>";
}

function collectSchemeRules() {
  const box = document.getElementById("v-rules");
  if (!box) return [];
  return Array.from(box.querySelectorAll(".v-rule")).map((row) => ({
    scope: row.querySelector(".v-rule-scope").value,
    keyword: row.querySelector(".v-rule-kw").value.trim(),
    code: row.querySelector(".v-rule-code").value.trim(),
    name: row.querySelector(".v-rule-name").value.trim(),
  })).filter((r) => r.keyword);
}

function schemeFieldVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function saveCurrentScheme(silent) {
  const list = getSchemes();
  const idx = list.findIndex((s) => s.id === voucherSchemeId);
  if (idx < 0) { if (!silent) toast("请先选择或新建方案"); return false; }
  const nameInp = document.getElementById("v-scheme-name");
  const s = list[idx];
  s.name = (nameInp && nameInp.value.trim()) || s.name || "未命名方案";
  s.rules = collectSchemeRules();
  s.expense = { name: schemeFieldVal("v-expense") || "管理费用", code: schemeFieldVal("v-expense-code") };
  s.tax = { name: schemeFieldVal("v-tax") || "应交税费—应交增值税（进项税额）", code: schemeFieldVal("v-tax-code") };
  s.payable = { name: schemeFieldVal("v-payable") || "应付账款", code: schemeFieldVal("v-payable-code") };
  list[idx] = s;
  setSchemes(list);
  if (!silent) toast("方案已保存：" + s.name + "（" + s.rules.length + " 条规则）");
  return true;
}

/* 规则 CSV：关键词,范围,科目编码,科目名称（范围：费用科目/往来科目） */
function parseRuleCsv(text) {
  const rows = [];
  let cur = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); field = "";
      if (cur.some((s) => s.trim())) rows.push(cur);
      cur = [];
    } else field += c;
  }
  cur.push(field);
  if (cur.some((s) => s.trim())) rows.push(cur);
  if (!rows.length) return [];
  // 跳过表头（含「关键词」列）
  const head = rows[0].map((s) => s.trim());
  const start = head.some((s) => s.includes("关键词")) ? 1 : 0;
  const colScope = head.indexOf("范围") >= 0 ? head.indexOf("范围") : -1;
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] || !r[0].trim()) continue;
    let scope = "subject";
    if (colScope >= 0) {
      const raw = (r[colScope] || "").trim();
      if (raw.includes("往来") || /party/i.test(raw)) scope = "party";
    }
    out.push({ scope: scope, keyword: (r[0] || "").trim(),
               code: (r[2] || "").trim(), name: (r[3] || "").trim() });
  }
  return out;
}

function exportSchemeCsv() {
  const scheme = getSchemes().find((s) => s.id === voucherSchemeId);
  const rules = scheme ? (scheme.rules || []) : [];
  if (!rules.length) { toast("当前方案还没有规则可导出"); return; }
  const esc = (s) => '"' + String(s || "").replace(/"/g, '""') + '"';
  const lines = ["关键词,范围,科目编码,科目名称"].concat(rules.map((r) =>
    [esc(r.keyword), esc(r.scope === "party" ? "往来科目" : "费用科目"), esc(r.code), esc(r.name)].join(",")));
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  download(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv" }),
    safeFileName(scheme.name || "科目方案") + "_映射规则_" + stamp + ".csv", "text/csv");
}

/* ---------- 账套科目表导入 ---------- */
function splitDelimitedLine(line, delim) {
  const cells = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { cells.push(cur); cur = ""; }
    else cur += c;
  }
  cells.push(cur);
  return cells;
}

function readFileSmart(file) {
  // 财务软件导出的 CSV 常见 GBK / UTF-8 BOM 两种编码，自动嗅探
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.onload = () => {
      const buf = reader.result;
      try {
        const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(buf);
        resolve(utf8.replace(/^\ufeff/, ""));
      } catch (e) {
        try { resolve(new TextDecoder("gbk").decode(buf)); }
        catch (e2) { reject(new Error("无法识别文件编码（请用 UTF-8 或 GBK 的 CSV）")); }
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function parseAccountTable(text) {
  const lines = String(text || "").split(/\r?\n/).filter((s) => s.trim());
  if (!lines.length) return [];
  const delim = (lines[0].split("\t").length > lines[0].split(",").length) ? "\t" : ",";
  const rows = lines.map((ln) => splitDelimitedLine(ln, delim));
  const head = rows[0].map((s) => s.trim());
  const ci = head.findIndex((s) => /科目编码|科目代码|编码|代码|code/i.test(s));
  const ni = head.findIndex((s) => /科目名称|名称|name/i.test(s));
  const hasHeader = ci >= 0 || ni >= 0;
  const codeCol = ci >= 0 ? ci : 0;
  const nameCol = ni >= 0 ? ni : (codeCol === 0 ? 1 : 0);
  const out = [], seen = new Set();
  for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
    const code = (rows[i][codeCol] || "").trim();
    const name = (rows[i][nameCol] || "").trim();
    if (!name || /^(合计|小计|总计)$/.test(name)) continue;
    const key = code + "|" + name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ code, name });
    if (out.length >= 2000) break;
  }
  return out;
}

async function importAccountChart(file) {
  try {
    const text = await readFileSmart(file);
    const chart = parseAccountTable(text);
    if (!chart.length) { toast("未解析到科目（需含「科目编码 / 科目名称」两列）"); return; }
    setAccountChart(chart);
    renderSchemeEditor();
    toast("已导入科目表 " + chart.length + " 项（UTF-8 / GBK 自动识别）");
  } catch (e) {
    toast("科目表导入失败：" + (e.message || e));
  }
}

function generateRulesFromChart() {
  const chart = getAccountChart();
  if (!chart.length) { toast("请先导入科目表 CSV"); return; }
  // 未选方案时自动建一个，避免规则无处归属
  let scheme = getSchemes().find((s) => s.id === voucherSchemeId);
  if (!scheme) {
    const list = getSchemes();
    scheme = {
      id: "sch-" + Date.now().toString(36),
      name: "科目表方案 " + (list.length + 1),
      expense: { name: "管理费用", code: "" },
      tax: { name: "应交税费—应交增值税（进项税额）", code: "" },
      payable: { name: "应付账款", code: "" },
      rules: [],
    };
    list.push(scheme);
    voucherSchemeId = scheme.id;
    setSchemes(list, true);
  }
  const rules = scheme.rules || [];
  const seen = new Set(rules.map((r) => [r.scope, r.keyword, r.code].join("|")));
  let added = 0;
  for (const a of chart) {
    // 用科目表里的标准名称回填默认科目（单段名称也生效）
    if (/^(管理费用|销售费用|制造费用)$/.test(a.name)) {
      scheme.expense = { name: a.name, code: a.code };
    }
    if (/应交增值税|进项税额/.test(a.name)) scheme.tax = { name: a.name, code: a.code };
    if (/^应付账款$|^其他应付款$/.test(a.name)) scheme.payable = { name: a.name, code: a.code };
    // 税金科目用于默认设置，不生成关键词规则
    if (/^应交税费/.test(a.name)) continue;
    // 「科目名称」以 — / - 分段时，末段常是部门 / 项目 / 供应商关键词
    const parts = String(a.name || "").split(/[—–\-]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const kw = parts[parts.length - 1];
    if (kw.length < 2) continue;
    const scope = /应付|往来|预收|其他应付款/.test(parts[0]) ? "party" : "subject";
    const key = [scope, kw, a.code].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push({ scope, keyword: kw, code: a.code, name: a.name });
    added++;
  }
  scheme.rules = rules;
  const list = getSchemes();
  const idx = list.findIndex((s) => s.id === scheme.id);
  list[idx] = scheme;
  setSchemes(list);
  renderSchemeSelect();
  previewVoucher();
  toast("已从科目表生成 " + added + " 条规则（末段作关键词，含「应付」判为往来科目）");
}

/* ---------- 客户模板导出 · 列映射 ---------- */
const SOURCE_TOKENS = [
  "@filename", "@doc_type", "@reviewed", "@invoice_no", "@seller", "@buyer",
  "@date", "@total", "@net", "@tax", "@li_sum", "@upper", "@audit_count",
  "@case.name", "@case.entity", "@case.taxId", "@case.period", "@case.reviewer",
];
let exportMapId = "0";
let exportMapScope = null;

function exportMapItems() {
  const pool = exportMapScope && exportMapScope.length
    ? exportMapScope
    : state.queue.filter((q) => q.status === "done" && q.data);
  return pool.map((q) => q.data);
}

function renderSourceOptions() {
  const dl = document.getElementById("em-sources");
  if (!dl) return;
  const fields = [];
  state.queue.forEach((q) => (q.data && q.data.fields || []).forEach((f) => {
    const label = String(f.label || "").trim();
    if (label && !fields.includes(label)) fields.push(label);
  }));
  const opts = SOURCE_TOKENS.concat(fields).map((s) =>
    '<option value="' + escapeAttr(s) + '"></option>').join("");
  dl.innerHTML = opts;
}

function renderExportMapSelect() {
  const sel = document.getElementById("em-template");
  if (!sel) return;
  const list = getExportMaps();
  if (exportMapId !== "0" && !list.some((m) => m.id === exportMapId)) exportMapId = "0";
  sel.innerHTML = '<option value="0">默认 · 未启用模板</option>' +
    list.map((m) => '<option value="' + escapeAttr(m.id) + '">' +
      escapeHtml(m.name || "未命名模板") + "（" + (m.columns || []).length + " 列）</option>").join("");
  sel.value = exportMapId;
  renderExportMapEditor();
}

function exportMapRow(c, i) {
  return '<div class="v-rule em-row" data-i="' + i + '">' +
    '<input class="inp em-h" placeholder="客户表头，如：发票号码" value="' + escapeAttr(c.header || "") + '" />' +
    '<input class="inp em-s" list="em-sources" placeholder="取值来源 / 字段名 / @token" value="' + escapeAttr(c.source || "") + '" />' +
    '<input class="inp em-f" placeholder="固定值（可留空）" value="' + escapeAttr(c.fixed || "") + '" />' +
    '<button class="btn ghost xs em-del" type="button" title="删除该列">×</button>' +
    "</div>";
}

function renderExportMapEditor() {
  const detail = document.getElementById("em-detail");
  if (!detail) return;
  const map = getExportMaps().find((m) => m.id === exportMapId);
  detail.hidden = !map;
  const saveBtn = document.getElementById("em-save");
  const delBtn = document.getElementById("em-del-tpl");
  if (saveBtn) saveBtn.hidden = !map;
  if (delBtn) delBtn.hidden = !map;
  if (!map) return;
  const nameInp = document.getElementById("em-name");
  if (nameInp && document.activeElement !== nameInp) nameInp.value = map.name || "";
  const tr = document.getElementById("em-total");
  if (tr) tr.checked = !!map.totalRow;
  const box = document.getElementById("em-columns");
  if (box) box.innerHTML = (map.columns || []).length
    ? map.columns.map(exportMapRow).join("")
    : '<p class="muted scheme-empty">还没有列。可手动添加，或导入客户模板 CSV 的表头自动匹配。</p>';
}

function collectExportMapColumns() {
  const box = document.getElementById("em-columns");
  if (!box) return [];
  return Array.from(box.querySelectorAll(".em-row")).map((row) => ({
    header: row.querySelector(".em-h").value.trim(),
    source: row.querySelector(".em-s").value.trim(),
    fixed: row.querySelector(".em-f").value.trim(),
  })).filter((c) => c.header);
}

function saveCurrentExportMap(silent) {
  const list = getExportMaps();
  const idx = list.findIndex((m) => m.id === exportMapId);
  if (idx < 0) { if (!silent) toast("请先新建或选择一个导出模板"); return false; }
  const m = list[idx];
  const nameInp = document.getElementById("em-name");
  m.name = (nameInp && nameInp.value.trim()) || m.name || "未命名模板";
  m.columns = collectExportMapColumns();
  const tr = document.getElementById("em-total");
  m.totalRow = !!(tr && tr.checked);
  list[idx] = m;
  setExportMaps(list);
  if (!silent) toast("模板已保存：" + m.name + "（" + m.columns.length + " 列）");
  return true;
}

function openExportMap(items) {
  if (IS_FILE) { toast("需启动本地服务以使用模板导出"); return; }
  exportMapScope = Array.isArray(items) && items.length ? items : null;
  exportMapModal.hidden = false;
  renderSourceOptions();
  renderExportMapSelect();
  const note = document.getElementById("em-info");
  if (note) note.textContent = "范围：" +
    (exportMapScope ? "当前单据 " + exportMapScope.length + " 份" :
      "全部已完成单据 " + state.queue.filter((q) => q.status === "done" && q.data).length + " 份");
}

function exportMapPayload(mode) {
  const map = getExportMaps().find((m) => m.id === exportMapId) || {};
  return {
    mode: mode, results: exportMapItems(), case: getCase(), audit: getAudit(),
    columns: collectExportMapColumns(), totalRow: !!map.totalRow,
  };
}

async function previewExportMap() {
  const box = document.getElementById("em-preview-box");
  if (!box) return;
  const cols = collectExportMapColumns();
  if (!cols.length) { box.hidden = false; box.innerHTML = '<p class="muted">请先配置至少一列</p>'; return; }
  try {
    const resp = await fetch("api/export-custom", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exportMapPayload("json")),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const out = await resp.json();
    const head = out.headers.map((h) => "<th>" + escapeHtml(h) + "</th>").join("");
    const body = out.rows.map((row) => "<tr>" + row.map((v) =>
      '<td title="' + escapeAttr(v) + '">' + escapeHtml(v) + "</td>").join("") + "</tr>").join("");
    box.hidden = false;
    box.innerHTML = '<p class="muted">预览前 ' + out.rows.length + " / " + out.total + " 行</p>" +
      '<div class="v-table-wrap"><table class="sum-table v-table"><thead><tr>' + head +
      "</tr></thead><tbody>" + (body || '<tr><td colspan="' + out.headers.length + '">无可预览数据</td></tr>') +
      "</tbody></table></div>";
  } catch (e) {
    box.hidden = false;
    box.innerHTML = '<p class="muted">预览失败：' + escapeHtml(e.message || e) + "</p>";
  }
}

async function downloadExportMap(mode) {
  if (!collectExportMapColumns().length) { toast("请先配置列映射"); return; }
  if (!exportMapItems().length) { toast("没有可导出的单据"); return; }
  try {
    const resp = await fetch("api/export-custom", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(exportMapPayload(mode)),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || ("HTTP " + resp.status));
    }
    const blob = await resp.blob();
    const map = getExportMaps().find((m) => m.id === exportMapId);
    const name = safeFileName(getCase().name || (map && map.name) || "模板导出");
    download(blob, name + (mode === "xlsx" ? ".xlsx" : ".csv"),
      mode === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv");
    toast("已按客户模板导出" + (mode === "xlsx" ? " Excel" : " CSV"));
  } catch (e) { toast("模板导出失败：" + (e.message || e)); }
}

async function importExportMapHeader(file) {
  try {
    const text = await readFileSmart(file);
    const line = String(text || "").split(/\r?\n/).find((s) => s.trim()) || "";
    const delim = line.split("\t").length > line.split(",").length ? "\t" : ",";
    const headers = splitDelimitedLine(line, delim).map((s) => s.trim()).filter(Boolean);
    if (!headers.length) { toast("未在模板首行读取到表头"); return; }
    const resp = await fetch("api/export-custom", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "guess", headers: headers }),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const out = await resp.json();
    let list = getExportMaps();
    let map = list.find((m) => m.id === exportMapId);
    if (!map) {
      map = { id: "em-" + Date.now().toString(36), name: "客户模板 " + (list.length + 1),
              columns: [], totalRow: false };
      list.push(map);
      exportMapId = map.id;
    }
    map.columns = out.columns;
    setExportMaps(list);
    renderExportMapSelect();
    await previewExportMap();
    toast("已导入客户表头 " + headers.length + " 列，并自动匹配取值来源（请核对）");
  } catch (e) { toast("导入表头失败：" + (e.message || e)); }
}

function voucherItems() {
  const pool = voucherScope && voucherScope.length
    ? voucherScope
    : state.queue.filter((q) => q.status === "done" && q.data);
  const rv = document.getElementById("v-reviewed");
  return (!voucherScope && rv && rv.checked) ? pool.filter((q) => q.reviewed) : pool;
}
function voucherPayload(mode) {
  return { mode: mode, format: "xlsx", results: resultsForExport(voucherItems()), config: voucherConfig() };
}
function openVoucher(items) {
  if (IS_FILE) { toast("需启动本地服务以生成凭证"); return; }
  voucherScope = Array.isArray(items) && items.length ? items : null;
  const rv = document.getElementById("v-reviewed");
  if (rv) { rv.checked = false; rv.disabled = !!voucherScope; }
  const note = document.getElementById("v-summary");
  if (note) note.innerHTML = '<span class="muted">' +
    (voucherScope ? "范围：当前单据 1 份" : "范围：全部已解析单据") + " · 正在生成预览…</span>";
  if (voucherModal) voucherModal.hidden = false;
  renderSchemeSelect();
  renderAccountChartMeta();
  previewVoucher();
}
async function previewVoucher() {
  const items = voucherItems();
  const box = document.getElementById("v-preview-box");
  const note = document.getElementById("v-summary");
  if (!items.length) {
    if (note) note.innerHTML = '<span class="muted">没有符合条件的单据（可取消「仅已复核」）</span>';
    if (box) box.hidden = true;
    return;
  }
  try {
    const resp = await fetch("api/voucher", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(voucherPayload("json")),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const out = await resp.json();
    const s = out.stats;
    if (note) note.innerHTML =
      '<div class="v-stats"><span>单据 <b>' + s.used + '</b> 份</span><span>凭证行 <b>' + s.lines + '</b> 行</span>' +
      '<span>借方 <b>' + fmtMoney(s.debit) + '</b></span><span>贷方 <b>' + fmtMoney(s.credit) + '</b></span>' +
      '<span class="' + (s.balanced ? "ok" : "bad") + '">' + (s.balanced ? "✓ 借贷平衡" : "⚠ 借贷不平，请核对金额") + "</span></div>" +
      '<div class="v-upper">金额大写：' + escapeHtml(s.upper) + " · " + escapeHtml(out.formatName) + "</div>" +
      (s.skipped.length ? '<div class="muted">跳过 ' + s.skipped.length + " 份（未识别到金额）：" + escapeHtml(s.skipped.join("、")) + "</div>" : "");
    if (box) {
      const head = out.columns.map((c) => "<th>" + escapeHtml(c) + "</th>").join("");
      const body = out.cells.map((row) => "<tr>" + row.map((c, i) =>
        '<td' + (/金额|借方|贷方/.test(out.columns[i]) ? ' class="num"' : "") +
        ' title="' + escapeAttr(c) + '">' + escapeHtml(c) + "</td>").join("") + "</tr>").join("");
      box.hidden = false;
      box.innerHTML = '<div class="v-table-wrap"><table class="sum-table v-table"><thead><tr>' + head +
        "</tr></thead><tbody>" + (body || '<tr><td colspan="' + out.columns.length + '">无可生成凭证的单据</td></tr>') +
        "</tbody></table></div>" +
        (out.cells.length < s.lines ? '<p class="muted">仅预览前 ' + out.cells.length + " 行，导出文件包含全部 " + s.lines + " 行。</p>" : "");
    }
  } catch (e) {
    if (note) note.innerHTML = '<span class="muted">预览失败：' + escapeHtml(e.message || e) + "</span>";
  }
}
async function exportVoucherCsv() {
  if (IS_FILE) { toast("需启动本地服务以导出凭证"); return; }
  if (!voucherItems().length) { toast("没有可生成凭证的单据"); return; }
  try {
    const resp = await fetch("api/voucher", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(voucherPayload("csv")),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const blob = await resp.blob();
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    download(blob, safeFileName(getCase().name || "文档台") + "_记账凭证_" + stamp + ".csv", "text/csv");
    toast(resp.headers.get("X-Voucher-Balanced") === "0"
      ? "已导出，但借贷不平衡，请核对金额" : "已导出记账凭证 CSV（借贷平衡）");
  } catch (e) { toast("凭证导出失败：" + (e.message || e)); }
}

function deliveryPayload(results) {
  return { format: "xlsx", results, case: getCase(), audit: getAudit(), voucher: voucherConfig() };
}

async function exportXlsx(results, filename) {
  if (IS_FILE) { toast("需启动本地服务以导出 Excel"); return; }
  try {
    const resp = await fetch("api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deliveryPayload(results)),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const blob = await resp.blob();
    download(blob, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    toast("已导出 Excel");
  } catch (err) { toast("Excel 导出失败：" + (err.message || err)); }
}

/* ---------- 核对报告 / 交付包 ---------- */
function reportLines(done) {
  const meta = getCase();
  const results = resultsForExport(done);
  const total = results.reduce((a, r) => a + docTotal(r), 0);
  const lines = [
    "文档台 · 单据核对报告",
    "=" * 46,
    "案卷名称：" + (meta.name || "—"),
    "会计期间：" + (meta.period || "—"),
    "我方主体：" + (meta.entity || "—"),
    "我方税号：" + (meta.taxId || "—"),
    "复核人：" + (meta.reviewer || "—"),
    "生成时间：" + new Date().toLocaleString("zh-CN", { hour12: false }),
    "文件数量：" + done.length + "（已复核 " + done.filter((q) => q.reviewed).length + "）",
    "价税合计：" + fmtMoney(total),
    "金额大写：" + rmbUpper(total),
    "",
  ];
  results.forEach((r, i) => {
    lines.push((i + 1) + ". " + (r.filename || "结果") + "  [" + (r.doc_type || "通用单据") + "]  " + (r.reviewed ? "已复核" : "待复核"));
    (r.fields || []).forEach((f) => lines.push("   · " + (f.label || "") + "：" + (f.value || "—")));
    (r.line_items || []).forEach((it) => lines.push("   - " + [it.name, it.qty, it.unit_price, it.amount].join(" / ")));
    (r.checks || []).forEach((c) => lines.push("   [" + (c.status === "warn" ? "异常" : "通过") + "] " + c.label + "：" + (c.detail || "")));
    lines.push("");
  });
  const audit = getAudit();
  if (audit.length) {
    lines.push("人工修正留痕", "-" * 46);
    audit.forEach((a) => lines.push(a.time + " | " + a.file + " | " + a.field + " | " + (a.old || "—") + " → " + (a.new || "—")));
    lines.push("");
  }
  lines.push("本报告由文档台在本地生成，文件与数据均未上传。");
  return lines.join("\n");
}

function reportHtml(done) {
  const meta = getCase();
  const results = resultsForExport(done);
  const total = results.reduce((a, r) => a + docTotal(r), 0);
  const metaRow = [
    ["案卷名称", meta.name], ["会计期间", meta.period], ["我方主体", meta.entity],
    ["我方税号", meta.taxId], ["复核人", meta.reviewer],
    ["生成时间", new Date().toLocaleString("zh-CN", { hour12: false })],
  ].map((p) => '<div class="rp-kv"><span>' + escapeHtml(p[0]) + "</span><b>" + escapeHtml(p[1] || "—") + "</b></div>").join("");
  const docs = results.map((r, i) => {
    const fields = (r.fields || []).map((f) =>
      "<tr><td>" + escapeHtml(f.label || "") + "</td><td>" + escapeHtml(f.value || "—") + "</td><td>" +
      escapeHtml(f.source || "") + "</td></tr>").join("");
    const checks = (r.checks || []).map((c) =>
      '<div class="rp-check ' + c.status + '"><b>' + escapeHtml(c.label) + "</b>" + escapeHtml(c.detail || "") + "</div>").join("");
    return '<section class="rp-doc"><h3>' + (i + 1) + ". " + escapeHtml(r.filename || "结果") +
      ' <em>' + escapeHtml(r.doc_type || "通用单据") + "</em> " +
      '<span class="rp-state ' + (r.reviewed ? "ok" : "") + '">' + (r.reviewed ? "已复核" : "待复核") + "</span></h3>" +
      '<div class="rp-sum">价税合计 <b>' + fmtMoney(docTotal(r)) + "</b> · 字段 " + (r.fields || []).length +
      " 项 · 明细 " + (r.line_items || []).length + " 行</div>" +
      '<table class="rp-table rp-fields"><thead><tr><th>字段</th><th>值</th><th>原文出处</th></tr></thead><tbody>' + (fields || '<tr><td colspan="3">未识别到字段</td></tr>') + "</tbody></table>" +
      '<div class="rp-checks">' + (checks || '<div class="rp-check ok">未检测到异常项</div>') + "</div></section>";
  }).join("");
  const audit = getAudit();
  const auditHtml = audit.length
    ? '<section class="rp-doc"><h3>人工修正留痕</h3><table class="rp-table rp-audit"><thead><tr><th>时间</th><th>文件</th><th>字段</th><th>原值 → 新值</th></tr></thead><tbody>' +
      audit.slice(0, 100).map((a) => "<tr><td>" + escapeHtml(a.time) + "</td><td>" + escapeHtml(a.file) + "</td><td>" +
        escapeHtml(a.field) + "</td><td>" + escapeHtml(a.old || "—") + " → " + escapeHtml(a.new || "—") + "</td></tr>").join("") +
      "</tbody></table></section>"
    : "";
  return '<div class="rp-head"><img class="rp-mark" src="brand/logo-mark.svg" alt="" width="40" height="40"><div><h1>单据核对报告</h1><p>DOC DESK · 本地生成 · 数据未上传</p></div></div>' +
    '<div class="rp-meta">' + metaRow + "</div>" +
    '<div class="rp-total"><span>文件 ' + done.length + " 份 · 已复核 " + done.filter((q) => q.reviewed).length + ' 份</span><span class="rp-upper">大写 ' + escapeHtml(rmbUpper(total)) + '</span><b>价税合计 ' + fmtMoney(total) + "</b></div>" +
    docs + auditHtml +
    '<div class="rp-sign"><span>复核人：________________</span><span>日期：________________</span></div>' +
    '<p class="rp-foot">本报告由文档台在本机生成，可用于内部归档或随交付底稿一并提交。</p>';
}

function openReport(done) {
  if (!done || !done.length) { toast("请先选择一份已解析的文件"); return; }
  const html = reportHtml(done);
  const body = document.getElementById("report-body");
  const printArea = document.getElementById("print-area");
  if (body) body.innerHTML = html;
  if (printArea) printArea.innerHTML = html;
  reportModal.hidden = false;
}

function exportPackage(done) {
  if (IS_FILE) { toast("需启动本地服务以生成交付包"); return; }
  if (!done || !done.length) { toast("请先选择已解析的文件"); return; }
  const pending = done.filter((q) => !q.reviewed).length;
  if (pending) toast("注意：仍有 " + pending + " 份待复核，交付包已按当前状态生成");
  fetch("api/package", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deliveryPayload(resultsForExport(done))),
  }).then((resp) => {
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return resp.blob();
  }).then((blob) => {
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    download(blob, safeFileName(getCase().name || "文档台") + "_交付包_" + stamp + ".zip", "application/zip");
    toast("已生成交付包 ZIP（底稿 + CSV + 报告 + 原文）");
  }).catch((err) => toast("交付包生成失败：" + (err.message || err)));
}

/* ---------- 工作区备份 / 恢复 ---------- */
function exportWorkspace() {
  const done = state.queue.filter((q) => q.data);
  const data = {
    format: "docdesk-workspace", version: APP_VERSION, exportedAt: new Date().toISOString(),
    case: getCase(), templates: getCustomTemplates(), audit: getAudit(),
    history: done.map((q) => ({ name: q.name, size: q.size, data: q.data, tpl: q.tpl, reviewed: !!q.reviewed, ts: Date.now() })),
  };
  download(JSON.stringify(data, null, 2), safeFileName(getCase().name || "文档台") + "_工作区备份.json", "application/json");
  toast("已备份 " + done.length + " 份结果、模板与案卷设置");
}

function importWorkspace(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (data.format !== "docdesk-workspace" || !Array.isArray(data.history)) throw new Error("不是有效的文档台备份文件");
      if (data.case) saveCase(Object.assign({}, DEFAULT_CASE, data.case));
      if (Array.isArray(data.templates)) saveCustomTemplates(data.templates);
      if (Array.isArray(data.audit)) setAudit(data.audit);
      setHistory(data.history.slice(0, 50));
      state.queue = [];
      data.history.forEach((rec) => state.queue.push({
        id: ++state.seq, name: rec.name, size: rec.size, status: "done", data: rec.data,
        tpl: rec.tpl || "general", caseId: rec.caseId || currentCaseId(), reviewed: !!rec.reviewed, fromHistory: false,
      }));
      renderTemplateSelect();
      state.selectedId = null;
      renderQueue(); syncClearBtn();
      if (state.queue[0]) selectItem(state.queue[0].id);
      scheduleSync(100);   // 恢复后立即写入本机磁盘，避免刷新又被旧数据覆盖
      toast("已恢复工作区：" + state.queue.length + " 份结果");
    } catch (err) { toast("导入失败：" + (err.message || err)); }
  };
  reader.readAsText(file);
}

function csvOf(d) {
  const rows = [["字段", "值", "置信度"]];
  (d.fields || []).forEach((f) => rows.push([f.label, f.value, f.confidence]));
  let s = "";
  for (const r of rows) s += r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",") + "\n";
  if (d.line_items && d.line_items.length) {
    s += "\n明细\n" + ["名称", "数量", "单价", "金额"].map((c) => '"' + c + '"').join(",") + "\n";
    for (const it of d.line_items)
      s += [it.name, it.qty, it.unit_price, it.amount].map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",") + "\n";
  }
  return "﻿" + s;
}

function download(content, name, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/* ---------- 模板选择 ---------- */
templateSelect.addEventListener("change", () => {
  state.defaultTpl = templateSelect.value;
  const item = state.queue.find((q) => q.id === state.selectedId);
  if (item) { item.tpl = templateSelect.value; item.tplLocked = true; renderFields(item); applyView(item); renderChecks(item); toast("已切换为「" + getTemplateName(templateSelect.value) + "」模板"); }
});

/* ---------- 历史 ---------- */
function syncClearBtn() {
  const hasHist = getHistory().length > 0;
  clearHistoryBtn.hidden = !hasHist;
}
clearHistoryBtn.onclick = () => {
  if (IS_FILE) { toast("预览模式：无历史可清"); return; }
  if (!confirm("清空本地历史记录？已解析结果将从队列移除（不影响原文件）。")) return;
  setHistory([]);
  state.queue = state.queue.filter((q) => !q.fromHistory);
  state.selectedId = null;
  renderQueue(); syncClearBtn();
  skeletonEl.hidden = true; resultEl.hidden = true;
  emptyEl.hidden = false;
  emptyEl.querySelector("h3").textContent = "还没有结果";
  emptyEl.querySelector("p").innerHTML = "从左侧队列选择一份已解析的文件，<br/>或拖入新的发票 / 单据开始。";
  toast("已清空历史");
};

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg) {
  toastEl.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' + escapeHtml(msg);
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

/* ---------- 工具 ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/* ---------- 模板管理弹窗 ---------- */
function renderTemplateSelect() {
  const cur = templateSelect.value || state.defaultTpl;
  const custom = getCustomTemplates();
  let html = Object.keys(TEMPLATES).map((k) => '<option value="' + k + '">' + TEMPLATES[k].name + "</option>").join("");
  custom.forEach((t) => (html += '<option value="' + t.id + '">' + escapeHtml(t.name) + "（自定义）</option>"));
  templateSelect.innerHTML = html;
  templateSelect.value = cur;
  if (templateSelect.value !== cur) { templateSelect.value = Object.keys(TEMPLATES)[0]; state.defaultTpl = templateSelect.value; }
}
function openTplModal() { renderTplList(); tplModal.hidden = false; }
function renderTplList() {
  const listEl = document.getElementById("tpl-list");
  const custom = getCustomTemplates();
  if (!custom.length) { listEl.innerHTML = '<div class="tpl-empty">暂无自定义模板。在下方输入名称与字段即可新增。</div>'; return; }
  listEl.innerHTML = "";
  custom.forEach((t) => {
    const row = document.createElement("div");
    row.className = "tpl-row";
    const labels = t.fields.map((f) => f.label).join("、");
    row.innerHTML =
      '<span class="tr-name">' + escapeHtml(t.name) + "</span>" +
      '<span class="tr-fields">' + escapeHtml(labels) + "</span>" +
      '<button class="tr-del" data-id="' + t.id + '">删除</button>';
    row.querySelector(".tr-del").onclick = () => deleteTemplate(t.id);
    listEl.appendChild(row);
  });
}
function addTemplate() {
  const name = tplNameInput.value.trim();
  const raw = tplFieldsInput.value.trim();
  if (!name) { toast("请输入模板名称"); return; }
  if (!raw) { toast("请至少填写一个字段"); return; }
  const fields = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean).map((s) => ({ key: s, label: s }));
  const custom = getCustomTemplates();
  custom.push({ id: "custom_" + Date.now(), name, fields });
  saveCustomTemplates(custom);
  tplNameInput.value = ""; tplFieldsInput.value = "";
  renderTemplateSelect(); renderTplList();
  toast("已新增模板「" + name + "」");
}
function deleteTemplate(id) {
  const custom = getCustomTemplates().filter((t) => t.id !== id);
  saveCustomTemplates(custom);
  state.queue.forEach((q) => { if (q.tpl === id) q.tpl = "general"; });
  renderTemplateSelect(); renderTplList();
  const item = state.queue.find((q) => q.id === state.selectedId);
  if (item) { templateSelect.value = item.tpl; renderFields(item); renderChecks(item); }
  toast("已删除模板");
}

/* ---------- 批量汇总 ---------- */
function monthKey(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4})\D+(\d{1,2})/);
  if (m) return m[1] + "-" + m[2].padStart(2, "0");
  return null;
}
function exportSummaryCsv(rows, filename) {
  const header = ["文件名", "销售方", "开票日期", "发票号", "总金额"];
  let s = "﻿" + header.map(csvCell).join(",") + "\n";
  rows.forEach((r) => {
    // 金额输出纯数值（不加 ¥ 与千分位），Excel 打开后可直接 SUM 求和
    const amt = r.amount ? Number(r.amount).toFixed(2) : "";
    s += [csvCell(r.name), csvCell(r.seller), csvCell(r.date), csvCell(r.inv), amt].join(",") + "\n";
  });
  const sum = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  s += csvCell("合计") + ",,,," + sum.toFixed(2) + "\n";
  download(s, filename, "text/csv");
  toast("已导出汇总表 CSV（金额可直接求和）");
}

function openSummary() {
  const done = state.queue.filter((q) => q.status === "done" && q.data);
  if (done.length < 2) { toast("至少解析 2 份文件才能汇总"); return; }
  let totalAmount = 0, liCount = 0;
  const bySeller = {}, byMonth = {};
  const invMap = {};
  const perFile = [];
  done.forEach((q) => {
    const d = q.data;
    const li = d.line_items || [];
    liCount += li.length;
    const amt = docTotal(d);
    totalAmount += amt;
    const seller = (d.fields || []).find((f) => /销售方|卖方|收款方|供货|公司|单位/.test(f.label));
    const sk = seller ? seller.value : "未识别";
    bySeller[sk] = (bySeller[sk] || 0) + amt;
    const date = (d.fields || []).find((f) => /日期|开票/.test(f.label));
    const mk = monthKey(date ? date.value : "");
    if (mk) byMonth[mk] = (byMonth[mk] || 0) + amt;
    const inv = (d.fields || []).find((f) => /发票|单号|编号|号码/.test(f.label));
    if (inv && inv.value) (invMap[inv.value] = invMap[inv.value] || []).push(q.name);
    perFile.push({ name: q.name, seller: sk, date: date ? date.value : "", inv: inv && inv.value ? inv.value : "", amount: amt });
  });
  const anomalies = [];
  Object.keys(invMap).forEach((v) => { if (invMap[v].length > 1) anomalies.push("发票号 <b>" + escapeHtml(v) + "</b> 重复 " + invMap[v].length + " 次：" + invMap[v].map(escapeHtml).join("、")); });

  const sellerRows = Object.keys(bySeller).sort((a, b) => bySeller[b] - bySeller[a])
    .map((k) => "<tr><td>" + escapeHtml(k) + '</td><td class="num">' + fmtMoney(bySeller[k]) + "</td></tr>").join("");
  const monthRows = Object.keys(byMonth).sort()
    .map((k) => "<tr><td>" + k + '</td><td class="num">' + fmtMoney(byMonth[k]) + "</td></tr>").join("");
  const anomalyHtml = anomalies.length ? anomalies.map((a) => '<div class="sum-anomaly">⚠ ' + a + "</div>").join("") : '<div class="sum-anomaly" style="color:var(--accent)">未检测到重复发票号</div>';

  document.getElementById("summary-body").innerHTML =
    '<div class="sum-actions"><button id="summary-export" class="btn primary xs" type="button">导出汇总表 (CSV)</button><button id="summary-export-xlsx" class="btn xs" type="button">导出合并 Excel</button><button id="summary-package" class="btn xs" type="button">交付包 ZIP</button><button id="summary-report" class="btn xs" type="button">核对报告</button><button id="summary-voucher" class="btn xs" type="button">记账凭证</button><button id="summary-export-map" class="btn xs" type="button">客户模板导出</button><span class="muted sum-act-hint">金额纯数值可直接求和 · 交付包含底稿 / 报告 / 凭证 / 原文</span></div>' +
    '<div class="sum-grid four">' +
      '<div class="sum-cell"><span class="sc-num">' + done.length + "</span><label>文件数</label></div>" +
      '<div class="sum-cell accent"><span class="sc-num">' + fmtMoney(totalAmount) + "</span><label>总金额</label></div>" +
      '<div class="sum-cell"><span class="sc-num">' + liCount + "</span><label>明细行</label></div>" +
      '<div class="sum-cell"><span class="sc-num">' + done.filter((q) => q.reviewed).length + "/" + done.length + "</span><label>已复核</label></div>" +
    "</div>" +
    '<div class="sum-block"><h4>逐份核对清单</h4><div class="table-wrap"><table class="sum-table"><thead><tr><th>文件</th><th>销售方</th><th class="num">金额</th><th>复核</th></tr></thead><tbody>' +
      perFile.map((r, i) => '<tr data-qid="' + escapeAttr(done[i].id) + '"><td>' + escapeHtml(r.name) + "</td><td>" + escapeHtml(r.seller) +
        '</td><td class="num">' + fmtMoney(r.amount) + '</td><td><span class="rp-state ' + (done[i].reviewed ? "ok" : "") + '">' + (done[i].reviewed ? "已复核" : "待复核") + "</span></td></tr>").join("") +
    "</tbody></table></div></div>" +
    '<div class="sum-block"><h4>按销售方汇总</h4><div class="table-wrap"><table class="sum-table"><thead><tr><th>销售方</th><th class="num">金额</th></tr></thead><tbody>' + (sellerRows || '<tr><td colspan="2" class="muted">无</td></tr>') + "</tbody></table></div></div>" +
    '<div class="sum-block"><h4>按月份汇总</h4><div class="table-wrap"><table class="sum-table"><thead><tr><th>月份</th><th class="num">金额</th></tr></thead><tbody>' + (monthRows || '<tr><td colspan="2" class="muted">无日期</td></tr>') + "</tbody></table></div></div>" +
    '<div class="sum-block"><h4>异常检查</h4>' + anomalyHtml + "</div>";
  const expBtn = document.getElementById("summary-export");
  if (expBtn) expBtn.onclick = () => exportSummaryCsv(perFile, "文档台_汇总_" + new Date().toISOString().slice(0, 10) + ".csv");
  const expXlsx = document.getElementById("summary-export-xlsx");
  if (expXlsx) expXlsx.onclick = () => exportXlsx(resultsForExport(done), "文档台_合并导出.xlsx");
  const pkg = document.getElementById("summary-package");
  if (pkg) pkg.onclick = () => exportPackage(done);
  const rpt = document.getElementById("summary-report");
  if (rpt) rpt.onclick = () => openReport(done);
  const vch = document.getElementById("summary-voucher");
  if (vch) vch.onclick = () => openVoucher(done);
  const smap = document.getElementById("summary-export-map");
  if (smap) smap.onclick = () => openExportMap(done);
  summaryModal.querySelectorAll(".sum-table tbody tr[data-qid]").forEach((tr) => {
    tr.style.cursor = "pointer";
    tr.title = "点击定位到该单据";
    tr.onclick = () => { summaryModal.hidden = true; selectItem(parseInt(tr.dataset.qid, 10)); };
  });
  summaryModal.hidden = false;
}

/* ---------- 弹窗与事件绑定 ---------- */
function closeModal(id) { document.getElementById(id).hidden = true; }
tplManageBtn.addEventListener("click", openTplModal);
tplAddBtn.addEventListener("click", addTemplate);
summaryBtn.addEventListener("click", openSummary);

/* ---------- 快照 / 凭证 / 批量填充 事件 ---------- */
const snapCreate = document.getElementById("snap-create");
if (snapCreate) snapCreate.onclick = createSnapshotNow;
const snapRefresh = document.getElementById("snap-refresh");
if (snapRefresh) snapRefresh.onclick = refreshSnapshots;
const vPreview = document.getElementById("v-preview");
if (vPreview) vPreview.onclick = previewVoucher;
const vExport = document.getElementById("v-export");
if (vExport) vExport.onclick = exportVoucherCsv;
["v-format", "v-reviewed", "v-expense", "v-tax", "v-payable", "v-date", "v-memo"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", () => {
    if (voucherModal && !voucherModal.hidden) previewVoucher();
  });
});
/* 科目方案事件 */
const vScheme = document.getElementById("v-scheme");
if (vScheme) vScheme.addEventListener("change", () => {
  saveCurrentScheme(true);          // 先保存当前方案，再切换
  voucherSchemeId = vScheme.value || "0";
  renderSchemeSelect();
  previewVoucher();
});
const vSchemeNew = document.getElementById("v-scheme-new");
if (vSchemeNew) vSchemeNew.onclick = () => {
  const list = getSchemes();
  const id = "sch-" + Date.now().toString(36);
  list.push({
    id: id,
    name: "方案 " + (list.length + 1),
    expense: { name: schemeFieldVal("v-expense") || "管理费用", code: schemeFieldVal("v-expense-code") },
    tax: { name: schemeFieldVal("v-tax") || "应交税费—应交增值税（进项税额）", code: schemeFieldVal("v-tax-code") },
    payable: { name: schemeFieldVal("v-payable") || "应付账款", code: schemeFieldVal("v-payable-code") },
    rules: [],
  });
  voucherSchemeId = id;
  setSchemes(list);
  toast("已新建方案，维护规则后点「保存方案」");
};
const vSchemeSave = document.getElementById("v-scheme-save");
if (vSchemeSave) vSchemeSave.onclick = () => { if (saveCurrentScheme()) previewVoucher(); };
const vSchemeDel = document.getElementById("v-scheme-del");
if (vSchemeDel) vSchemeDel.onclick = () => {
  const list = getSchemes();
  const idx = list.findIndex((s) => s.id === voucherSchemeId);
  if (idx < 0) return;
  const name = list[idx].name || "未命名方案";
  list.splice(idx, 1);
  voucherSchemeId = "0";
  setSchemes(list);
  toast("已删除方案：" + name);
};
const vRuleAdd = document.getElementById("v-rule-add");
if (vRuleAdd) vRuleAdd.onclick = () => {
  const box = document.getElementById("v-rules");
  if (!box) return;
  const empty = box.querySelector(".scheme-empty");
  if (empty) empty.remove();
  box.insertAdjacentHTML("beforeend", schemeRuleRow({ scope: "subject" }, box.querySelectorAll(".v-rule").length));
  const kw = box.querySelector(".v-rule:last-child .v-rule-kw");
  if (kw) kw.focus();
};
const vRules = document.getElementById("v-rules");
if (vRules) {
  vRules.addEventListener("click", (e) => {
    const del = e.target.closest(".v-rule-del");
    if (!del) return;
    del.closest(".v-rule").remove();
    const box = document.getElementById("v-rules");
    if (box && !box.querySelector(".v-rule")) renderSchemeEditor();
  });
  // 科目表补全：编码与名称联动
  vRules.addEventListener("change", (e) => {
    const row = e.target.closest(".v-rule");
    if (!row) return;
    const chart = getAccountChart();
    if (e.target.classList.contains("v-rule-code")) {
      const hit = chart.find((a) => a.code && a.code === e.target.value.trim());
      if (hit) row.querySelector(".v-rule-name").value = hit.name;
    } else if (e.target.classList.contains("v-rule-name")) {
      const hit = chart.find((a) => a.name === e.target.value.trim());
      if (hit) row.querySelector(".v-rule-code").value = hit.code;
    }
  });
}
const vChartImport = document.getElementById("v-chart-import");
if (vChartImport) vChartImport.addEventListener("change", () => {
  const f = vChartImport.files && vChartImport.files[0];
  vChartImport.value = "";
  if (f) importAccountChart(f);
});
const vChartAuto = document.getElementById("v-chart-auto");
if (vChartAuto) vChartAuto.onclick = generateRulesFromChart;

/* 客户模板导出事件 */
const emSel = document.getElementById("em-template");
if (emSel) emSel.addEventListener("change", () => {
  saveCurrentExportMap(true);
  exportMapId = emSel.value || "0";
  renderExportMapSelect();
});
const emNew = document.getElementById("em-new");
if (emNew) emNew.onclick = () => {
  const list = getExportMaps();
  const m = { id: "em-" + Date.now().toString(36), name: "客户模板 " + (list.length + 1),
              columns: [], totalRow: false };
  list.push(m);
  exportMapId = m.id;
  setExportMaps(list, true);
  renderExportMapSelect();
  toast("已新建模板，添加列后可保存");
};
const emSave = document.getElementById("em-save");
if (emSave) emSave.onclick = () => { if (saveCurrentExportMap()) previewExportMap(); };
const emDel = document.getElementById("em-del-tpl");
if (emDel) emDel.onclick = () => {
  const list = getExportMaps().filter((m) => m.id !== exportMapId);
  exportMapId = "0";
  setExportMaps(list);
  toast("已删除导出模板");
};
const emAdd = document.getElementById("em-add");
if (emAdd) emAdd.onclick = () => {
  const box = document.getElementById("em-columns");
  if (!box) return;
  const empty = box.querySelector(".scheme-empty");
  if (empty) empty.remove();
  box.insertAdjacentHTML("beforeend", exportMapRow({ header: "", source: "", fixed: "" }, box.querySelectorAll(".em-row").length));
  const h = box.querySelector(".em-row:last-child .em-h");
  if (h) h.focus();
};
const emCols = document.getElementById("em-columns");
if (emCols) emCols.addEventListener("click", (e) => {
  const del = e.target.closest(".em-del");
  if (!del) return;
  del.closest(".em-row").remove();
  if (!emCols.querySelector(".em-row")) renderExportMapEditor();
});
const emImport = document.getElementById("em-import");
if (emImport) emImport.addEventListener("change", () => {
  const f = emImport.files && emImport.files[0];
  emImport.value = "";
  if (f) importExportMapHeader(f);
});
const emPreview = document.getElementById("em-preview");
if (emPreview) emPreview.onclick = previewExportMap;
const emCsv = document.getElementById("em-csv");
if (emCsv) emCsv.onclick = () => downloadExportMap("csv");
const emXlsx = document.getElementById("em-xlsx");
if (emXlsx) emXlsx.onclick = () => downloadExportMap("xlsx");
const vRuleImport = document.getElementById("v-rule-import");
if (vRuleImport) vRuleImport.addEventListener("change", () => {
  const f = vRuleImport.files && vRuleImport.files[0];
  vRuleImport.value = "";
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rules = parseRuleCsv(String(reader.result || ""));
    if (!rules.length) { toast("未从 CSV 中解析到规则（表头：关键词,范围,科目编码,科目名称）"); return; }
    const list = getSchemes();
    const idx = list.findIndex((s) => s.id === voucherSchemeId);
    if (idx < 0) { toast("请先新建或选择一个方案再导入规则"); return; }
    list[idx].rules = (list[idx].rules || []).concat(rules);
    setSchemes(list);
    toast("已导入 " + rules.length + " 条规则");
  };
  reader.readAsText(f, "utf-8");
});
const vRuleExport = document.getElementById("v-rule-export");
if (vRuleExport) vRuleExport.onclick = exportSchemeCsv;
if (batchBtn) batchBtn.onclick = openBatchModal;
const bApply = document.getElementById("b-apply");
if (bApply) bApply.onclick = applyBatch;
const bScope = document.getElementById("b-scope");
if (bScope) bScope.addEventListener("change", updateBatchCount);

/* ---------- 案卷 / 留痕 / 报告 事件 ---------- */
function openCaseModal() {
  const c = getCase();
  ["name", "entity", "taxId", "period", "reviewer", "note"].forEach((k) => {
    const el = document.getElementById("case-" + k);
    if (el) el.value = c[k] || "";
  });
  renderAuditList();
  refreshSnapshots();
  caseModal.hidden = false;
}
if (caseBtn) caseBtn.addEventListener("click", openCaseModal);
const caseSave = document.getElementById("case-save");
if (caseSave) caseSave.addEventListener("click", () => {
  const c = {};
  ["name", "entity", "taxId", "period", "reviewer", "note"].forEach((k) => {
    const el = document.getElementById("case-" + k);
    c[k] = el ? el.value.trim() : "";
  });
  if (!c.name) c.name = DEFAULT_CASE.name;
  saveCase(c);
  syncCaseToCases();
  const item = state.queue.find((q) => q.id === state.selectedId);
  if (item && item.data) renderChecks(item);
  toast("案卷「" + c.name + "」已保存");
  closeModal("case-modal");
});

/* ================= v1.6 客户与案卷经营看板 ================= */
let clEditId = "", kdEditId = "", opsActiveTab = "clients";

function money(v) { return "¥" + Number(v || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function opsDocs() { return workspacePayload().documents; }

function openOps() {
  syncCaseToCases();
  opsModal.hidden = false;
  renderOps();
}
if (opsBtn) opsBtn.addEventListener("click", openOps);

function renderOps() {
  document.querySelectorAll(".ops-tab").forEach((b) => b.classList.toggle("active", b.dataset.opsTab === opsActiveTab));
  ["clients", "cases", "overview"].forEach((k) => {
    const pane = document.getElementById("ops-" + k);
    if (pane) pane.hidden = k !== opsActiveTab;
  });
  renderOpsClients();
  renderOpsCases();
  renderOpsOverview();
  fillOpsSelects();
}

function fillOpsSelects() {
  const mapSel = document.getElementById("cl-map");
  if (mapSel) {
    const cur = mapSel.value;
    mapSel.innerHTML = '<option value="">不绑定</option>' + getExportMaps().map((m) =>
      '<option value="' + escapeAttr(m.id) + '">' + escapeHtml(m.name || "未命名模板") + "</option>").join("");
    mapSel.value = cur;
  }
  const schemeSel = document.getElementById("cl-scheme");
  if (schemeSel) {
    const cur = schemeSel.value;
    schemeSel.innerHTML = '<option value="">不绑定</option>' + getSchemes().map((m) =>
      '<option value="' + escapeAttr(m.id) + '">' + escapeHtml(m.name || "未命名方案") + "</option>").join("");
    schemeSel.value = cur;
  }
  const kdClient = document.getElementById("kd-client");
  if (kdClient) {
    const cur = kdClient.value;
    kdClient.innerHTML = '<option value="">未分配客户</option>' + getClients().map((c) =>
      '<option value="' + escapeAttr(c.id) + '">' + escapeHtml(c.name || "未命名客户") + "</option>").join("");
    kdClient.value = cur;
  }
  const stClient = document.getElementById("st-client");
  if (stClient) {
    const cur = stClient.value;
    stClient.innerHTML = '<option value="">全部客户</option>' + getClients().map((c) =>
      '<option value="' + escapeAttr(c.id) + '">' + escapeHtml(c.name || "未命名客户") + "</option>").join("");
    stClient.value = cur;
  }
}

function renderOpsClients() {
  const box = document.getElementById("cl-list");
  if (!box) return;
  const list = getClients();
  const cases = getCases();
  if (!list.length) {
    box.innerHTML = '<div class="ops-empty">还没有客户档案。点「新建客户」开始，客户信息会进入案卷与对账单。</div>';
    return;
  }
  box.innerHTML = list.map((c) => {
    const own = cases.filter((k) => k.clientId === c.id);
    const billing = c.billing === "monthly" ? "按月 " + money(c.fee)
      : c.billing === "project" ? "项目 " + money(c.fee) : "按张 " + money(c.rate) + "/张";
    return '<div class="ops-item" data-id="' + escapeAttr(c.id) + '">' +
      '<div><div class="oi-name">' + escapeHtml(c.name || "未命名客户") + "</div>" +
      '<div class="oi-sub">' + escapeHtml([c.taxId, c.industry, c.contact].filter(Boolean).join(" · ") || "未填写联系方式") + "</div></div>" +
      '<div class="oi-num">' + escapeHtml(billing) + "</div>" +
      '<div class="oi-num">' + own.length + " 个案卷 · " + escapeHtml(money(own.reduce((s, k) => s +
        (k.billing === "per_doc" ? (Number(k.rate) || 0) * countCaseDocs(k.id) : (Number(k.fee) || 0)), 0))) + "</div>" +
      '<div class="oi-actions"><button class="btn ghost xs" type="button" data-cl-edit="' + escapeAttr(c.id) + '">编辑</button>' +
      '<button class="btn ghost xs" type="button" data-cl-del="' + escapeAttr(c.id) + '">删除</button></div></div>';
  }).join("");
}

function countCaseDocs(caseId) {
  return opsDocs().filter((d) => (d.caseId || currentCaseId()) === caseId).length;
}

function renderOpsCases() {
  const box = document.getElementById("kd-list");
  if (!box) return;
  const list = getCases();
  if (!list.length) {
    box.innerHTML = '<div class="ops-empty">还没有案卷。新建案卷后可把新解析的单据归入该结算周期。</div>';
    return;
  }
  const activeId = currentCaseId();
  box.innerHTML = list.map((k) => {
    const docs = opsDocs().filter((d) => (d.caseId || activeId) === k.id);
    const reviewed = docs.filter((d) => d.reviewed).length;
    const progress = docs.length ? Math.round(reviewed / docs.length * 100) : 0;
    const amount = k.billing === "per_doc" ? docs.length * (Number(k.rate) || 0) : (Number(k.fee) || 0);
    const statusLabel = { active: "进行中", review: "待复核", delivered: "已交付", archived: "已归档" }[k.status] || "进行中";
    return '<div class="ops-item' + (k.id === activeId ? " active" : "") + '" data-id="' + escapeAttr(k.id) + '">' +
      '<div><div class="oi-name">' + escapeHtml(k.name || "未命名案卷") + (k.id === activeId ? " · 当前" : "") + "</div>" +
      '<div class="oi-sub">' + escapeHtml(clientName(k.clientId)) + " · " + escapeHtml(k.period || "未分期") + " · " + statusLabel + "</div></div>" +
      '<div class="oi-num">' + docs.length + " 份 / " + reviewed + " 已复核" +
      '<div class="ops-progress"><i style="width:' + progress + '%"></i></div></div>' +
      '<div class="oi-num">' + escapeHtml(money(amount)) + "</div>" +
      '<div class="oi-actions">' +
      (k.id === activeId ? "" : '<button class="btn ghost xs" type="button" data-kd-switch="' + escapeAttr(k.id) + '">切换</button>') +
      '<button class="btn ghost xs" type="button" data-kd-edit="' + escapeAttr(k.id) + '">编辑</button>' +
      '<button class="btn ghost xs" type="button" data-kd-del="' + escapeAttr(k.id) + '">删除</button></div></div>';
  }).join("");
}

async function renderOpsOverview() {
  const box = document.getElementById("ops-kpis");
  if (!box || IS_FILE) return;
  try {
    const resp = await fetch("api/commerce/summary", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opsPayload()),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const out = await resp.json();
    const k = out.kpi;
    const cards = [
      ["客户数", k.clients, "家档案"],
      ["案卷数", k.cases, k.activeCases + " 个在制"],
      ["单据份数", k.documents, k.reviewed + " 份已复核"],
      ["复核率", k.reviewRate + "%", "交付质量"],
      ["单据金额", money(k.amount), "价税合计"],
      ["预计计费", money(k.revenue), "按案卷规则"],
    ];
    box.innerHTML = cards.map((c) => '<div class="ops-kpi"><span>' + escapeHtml(c[0]) + "</span><strong>" +
      escapeHtml(String(c[1])) + "</strong><small>" + escapeHtml(c[2]) + "</small></div>").join("");
    renderBars("ops-client-bars", out.clients, (r) => [r.name, r.revenue]);
    renderBars("ops-period-bars", out.byPeriod, (r) => [r.period, r.revenue]);
  } catch (e) {
    box.innerHTML = '<div class="ops-empty">经营数据加载失败：' + escapeHtml(e.message || e) + "</div>";
  }
}

function renderBars(id, rows, pick) {
  const box = document.getElementById(id);
  if (!box) return;
  const data = (rows || []).map(pick).filter((r) => Number(r[1]) > 0);
  if (!data.length) { box.innerHTML = '<div class="ops-empty">暂无计费数据</div>'; return; }
  const max = Math.max.apply(null, data.map((r) => Number(r[1])));
  box.innerHTML = data.map((r) => '<div class="ops-bar-row"><div class="ops-bar-label"><span>' +
    escapeHtml(r[0] || "未命名") + "</span><b>" + money(r[1]) + "</b></div>" +
    '<div class="ops-bar-track"><div class="ops-bar-fill" style="width:' +
    Math.max(3, Math.round(Number(r[1]) / max * 100)) + '%"></div></div></div>').join("");
}

function opsPayload(mode) {
  const base = workspacePayload();
  return Object.assign({}, base, {
    mode: mode || "summary",
    clientId: (document.getElementById("st-client") || {}).value || "",
    period: ((document.getElementById("st-period") || {}).value || "").trim(),
    name: ((document.getElementById("st-name") || {}).value || "").trim() || "服务对账单",
  });
}

function editClient(id) {
  clEditId = id || "";
  const c = getClients().find((x) => x.id === id) || {};
  const vals = {
    name: c.name || "", taxId: c.taxId || "", industry: c.industry || "",
    contact: c.contact || "", phone: c.phone || "", email: c.email || "",
    billing: c.billing || "per_doc", rate: c.rate == null ? "" : c.rate,
    fee: c.fee == null ? "" : c.fee, map: c.defaultExportMapId || "", scheme: c.defaultSchemeId || "",
  };
  Object.keys(vals).forEach((k) => {
    const el = document.getElementById("cl-" + k);
    if (el) el.value = vals[k];
  });
  const editor = document.getElementById("cl-editor");
  const title = document.getElementById("cl-editor-title");
  if (editor) editor.hidden = false;
  if (title) title.textContent = id ? "编辑客户" : "新建客户";
  const input = document.getElementById("cl-name");
  if (input) input.focus();
}

function saveClient() {
  const get = (k) => (document.getElementById("cl-" + k) || {}).value || "";
  const name = get("name").trim();
  if (!name) { toast("请填写客户名称"); return; }
  const row = {
    id: clEditId || "c-" + Date.now().toString(36), name: name,
    taxId: get("taxId").trim(), industry: get("industry").trim(),
    contact: get("contact").trim(), phone: get("phone").trim(), email: get("email").trim(),
    billing: get("billing") || "per_doc", rate: Number(get("rate")) || 0, fee: Number(get("fee")) || 0,
    defaultExportMapId: get("map"), defaultSchemeId: get("scheme"),
    createdAt: new Date().toISOString(),
  };
  const list = getClients();
  const idx = list.findIndex((x) => x.id === row.id);
  if (idx >= 0) row.createdAt = list[idx].createdAt || row.createdAt;
  if (idx >= 0) list[idx] = row; else list.unshift(row);
  setClients(list);
  document.getElementById("cl-editor").hidden = true;
  clEditId = "";
  renderOps();
  toast("客户「" + name + "」已保存");
}

function editCase(id) {
  kdEditId = id || "";
  const k = getCases().find((x) => x.id === id) || {};
  const current = getCase();
  const vals = {
    name: k.name || current.name || "", client: k.clientId || "",
    period: k.period || current.period || "", status: k.status || "active",
    billing: k.billing || "per_doc", rate: k.rate == null ? "" : k.rate,
    fee: k.fee == null ? "" : k.fee, delivered: k.deliveredAt || "", note: k.note || current.note || "",
  };
  Object.keys(vals).forEach((key) => {
    const el = document.getElementById("kd-" + key);
    if (el) el.value = vals[key];
  });
  const editor = document.getElementById("kd-editor");
  const title = document.getElementById("kd-editor-title");
  if (editor) editor.hidden = false;
  if (title) title.textContent = id ? "编辑案卷" : "新建案卷";
}

function saveCaseRow() {
  const get = (k) => (document.getElementById("kd-" + k) || {}).value || "";
  const name = get("name").trim();
  if (!name) { toast("请填写案卷名称"); return; }
  const client = getClients().find((c) => c.id === get("client")) || {};
  const current = getCase();
  const row = {
    id: kdEditId || "k-" + Date.now().toString(36), name: name,
    clientId: get("client"), period: get("period").trim(), status: get("status") || "active",
    billing: get("billing") || "per_doc",
    rate: get("rate") !== "" ? Number(get("rate")) : (Number(client.rate) || 0),
    fee: get("fee") !== "" ? Number(get("fee")) : (Number(client.fee) || 0),
    deliveredAt: get("delivered"), note: get("note").trim(),
    entity: current.entity || "", taxId: current.taxId || "", reviewer: current.reviewer || "",
    createdAt: new Date().toISOString(),
  };
  const list = getCases();
  const idx = list.findIndex((x) => x.id === row.id);
  if (idx >= 0) row.createdAt = list[idx].createdAt || row.createdAt;
  const isNew = idx < 0;
  if (isNew) list.unshift(row); else list[idx] = row;
  setCases(list);
  document.getElementById("kd-editor").hidden = true;
  kdEditId = "";
  // 新建案卷立即设为当前：之后解析/导入的单据才会归入该结算周期
  if (isNew) switchCase(row.id);
  renderOps();
  toast("案卷「" + name + "」已保存" + (isNew ? "，已设为当前案卷" : ""));
}

async function statementRequest(mode) {
  if (IS_FILE) { toast("需启动本地服务以生成对账单"); return; }
  try {
    const payload = opsPayload(mode);
    const resp = await fetch("api/commerce/statement", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || ("HTTP " + resp.status));
    }
    if (mode === "json") {
      const out = await resp.json();
      const box = document.getElementById("st-box");
      box.hidden = false;
      const head = out.headers.map((h) => "<th>" + escapeHtml(h) + "</th>").join("");
      const body = out.rows.map((row) => "<tr>" + row.map((v) =>
        '<td title="' + escapeAttr(v) + '">' + escapeHtml(v) + "</td>").join("") + "</tr>").join("");
      box.innerHTML = '<p class="muted">对账单 ' + out.rows.length + " / " + out.total + " 行</p>" +
        '<div class="v-table-wrap"><table class="sum-table v-table"><thead><tr>' + head +
        "</tr></thead><tbody>" + (body || '<tr><td colspan="' + out.headers.length + '">暂无案卷</td></tr>') +
        "</tbody></table></div>";
      return;
    }
    const blob = await resp.blob();
    download(blob, payload.name + (mode === "xlsx" ? ".xlsx" : ".csv"),
      mode === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv");
    toast("已导出服务对账单");
  } catch (e) { toast("对账单生成失败：" + (e.message || e)); }
}

document.querySelectorAll(".ops-tab").forEach((btn) => btn.addEventListener("click", () => {
  opsActiveTab = btn.dataset.opsTab;
  renderOps();
}));
const clNew = document.getElementById("cl-new");
if (clNew) clNew.addEventListener("click", () => editClient(""));
const clSave = document.getElementById("cl-save");
if (clSave) clSave.addEventListener("click", saveClient);
const clCancel = document.getElementById("cl-cancel");
if (clCancel) clCancel.addEventListener("click", () => { document.getElementById("cl-editor").hidden = true; clEditId = ""; });
const kdNew = document.getElementById("kd-new");
if (kdNew) kdNew.addEventListener("click", () => { fillOpsSelects(); editCase(""); });
const kdSave = document.getElementById("kd-save");
if (kdSave) kdSave.addEventListener("click", saveCaseRow);
const kdCancel = document.getElementById("kd-cancel");
if (kdCancel) kdCancel.addEventListener("click", () => { document.getElementById("kd-editor").hidden = true; kdEditId = ""; });
const stPreview = document.getElementById("st-preview");
if (stPreview) stPreview.addEventListener("click", () => statementRequest("json"));
const stCsv = document.getElementById("st-csv");
if (stCsv) stCsv.addEventListener("click", () => statementRequest("csv"));
const stXlsx = document.getElementById("st-xlsx");
if (stXlsx) stXlsx.addEventListener("click", () => statementRequest("xlsx"));

opsModal.addEventListener("click", (e) => {
  const t = e.target.closest("[data-cl-edit],[data-cl-del],[data-kd-edit],[data-kd-del],[data-kd-switch]");
  if (!t) return;
  if (t.dataset.clEdit) editClient(t.dataset.clEdit);
  else if (t.dataset.clDel) {
    const id = t.dataset.clDel;
    const name = clientName(id);
    if (!window.confirm("删除客户「" + name + "」？案卷不会被删除，只会变成未分配。")) return;
    setClients(getClients().filter((c) => c.id !== id));
    getCases().forEach((k) => { if (k.clientId === id) k.clientId = ""; });
    renderOps(); toast("客户已删除：" + name);
  } else if (t.dataset.kdEdit) editCase(t.dataset.kdEdit);
  else if (t.dataset.kdSwitch) switchCase(t.dataset.kdSwitch);
  else if (t.dataset.kdDel) {
    const id = t.dataset.kdDel;
    const name = (getCases().find((k) => k.id === id) || {}).name || "案卷";
    if (!window.confirm("删除案卷「" + name + "」？其中的单据不会删除，会归入未分配。")) return;
    const list = getCases().filter((k) => k.id !== id);
    setCases(list);
    if (id === currentCaseId()) {
      const next = list[0];
      setActiveCaseId(next ? next.id : "case-active", true);
      if (next) saveCase(next);
    }
    renderCaseChip(); renderOps(); toast("案卷已删除：" + name);
  }
});

function renderAuditList() {
  const el = document.getElementById("audit-list");
  if (!el) return;
  const list = getAudit();
  const cnt = document.getElementById("audit-count");
  if (cnt) cnt.textContent = list.length;
  if (!list.length) { el.innerHTML = '<div class="tpl-empty">暂无修正记录。修改任意字段后会自动留痕。</div>'; return; }
  el.innerHTML = list.slice(0, 30).map((a) =>
    '<div class="audit-row"><span class="au-time">' + escapeHtml(a.time || "") + "</span>" +
    '<span class="au-file">' + escapeHtml(a.file || "") + "</span>" +
    '<span class="au-field">' + escapeHtml(a.field || "") + "</span>" +
    '<span class="au-change">' + escapeHtml(a.old || "空") + " → " + escapeHtml(a.new || "空") + "</span></div>").join("");
}
const auditExport = document.getElementById("audit-export");
if (auditExport) auditExport.addEventListener("click", () => {
  const list = getAudit();
  if (!list.length) { toast("暂无修正记录"); return; }
  let s = "﻿" + ["时间", "文件", "字段", "原值", "新值"].map(csvCell).join(",") + "\n";
  list.forEach((a) => (s += [a.time, a.file, a.field, a.old, a.new].map(csvCell).join(",") + "\n"));
  download(s, "文档台_修正记录.csv", "text/csv");
  toast("已导出 " + list.length + " 条修正记录");
});
const auditClear = document.getElementById("audit-clear");
if (auditClear) auditClear.addEventListener("click", () => {
  if (!getAudit().length) { toast("暂无修正记录"); return; }
  if (!confirm("清空全部人工修正留痕？已导出文件不受影响。")) return;
  setAudit([]); toast("已清空修正记录");
});
const backupExport = document.getElementById("backup-export");
if (backupExport) backupExport.addEventListener("click", exportWorkspace);
const backupImportBtn = document.getElementById("backup-import-btn");
const backupImport = document.getElementById("backup-import");
if (backupImportBtn && backupImport) {
  backupImportBtn.addEventListener("click", () => backupImport.click());
  backupImport.addEventListener("change", () => {
    if (backupImport.files && backupImport.files[0]) importWorkspace(backupImport.files[0]);
    backupImport.value = "";
  });
}
const reportPrint = document.getElementById("report-print");
if (reportPrint) reportPrint.addEventListener("click", () => window.print());
const reportTxt = document.getElementById("report-txt");
if (reportTxt) reportTxt.addEventListener("click", () => {
  const done = state.queue.filter((q) => q.status === "done" && q.data);
  if (!done.length) { toast("请先解析文件"); return; }
  download("\ufeff" + reportLines(done), safeFileName(getCase().name || "文档台") + "_核对报告.txt", "text/plain");
  toast("已导出核对报告 TXT");
});
searchInput.addEventListener("input", () => { state.search = searchInput.value; renderQueue(); });
const lowOnlyBox = document.getElementById("low-only");
if (lowOnlyBox) lowOnlyBox.addEventListener("change", () => {
  state.lowOnly = lowOnlyBox.checked;
  const label = lowOnlyBox.closest("label");
  if (label) label.classList.toggle("on", state.lowOnly);
  const item = state.queue.find((q) => q.id === state.selectedId);
  if (item && item.data) renderFields(item);
});
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.dataset.close)));
document.querySelectorAll(".modal-mask").forEach((m) => m.addEventListener("click", () => (m.parentElement.hidden = true)));
/* ---------- 主题切换（深色 / 浅色） ---------- */
const THEME_KEY = "docdesk_theme_v1";
(function initTheme() {
  let t = null;
  try { t = localStorage.getItem(THEME_KEY); } catch (e) {}
  if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
  // 默认浅色：不显式写属性，保持与 IDE 浅色主题一致
})();
if (document.getElementById("theme-btn")) {
  document.getElementById("theme-btn").addEventListener("click", () => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    const next = dark ? "light" : "dark";
    if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    scheduleSync(100);
    toast(next === "dark" ? "已切换到深色主题" : "已切换到浅色主题");
  });
}

/* ---------- 帮助弹窗 ---------- */
function openHelp() { helpModal.hidden = false; }
function closeHelp() { helpModal.hidden = true; }
if (helpBtn) helpBtn.addEventListener("click", openHelp);

/* ---------- 全局键盘快捷键 ---------- */
document.addEventListener("keydown", (e) => {
  // Esc:统一关闭所有弹窗（优先级最高）
  if (e.key === "Escape") {
    tplModal.hidden = true; summaryModal.hidden = true; closeHelp();
    if (caseModal) caseModal.hidden = true;
    if (reportModal) reportModal.hidden = true;
    if (voucherModal) voucherModal.hidden = true;
    if (exportMapModal) exportMapModal.hidden = true;
    if (opsModal) opsModal.hidden = true;
    if (batchModal) batchModal.hidden = true;
    return;
  }
  const ae = document.activeElement;
  const typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName);
  const mod = e.ctrlKey || e.metaKey;

  // 帮助:?（仅非输入态），或在任意态用 Ctrl+/
  if ((e.key === "?" && !typing) || (mod && e.key === "/")) { e.preventDefault(); openHelp(); return; }
  // 聚焦搜索:Ctrl+K
  if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); searchInput.focus(); searchInput.select(); return; }

  // 以下快捷键在输入态一律让位，避免干扰编辑
  if (typing) return;

  const selected = () => state.queue.find((q) => q.id === state.selectedId && q.data);

  // 人工核对效率：撤销 / 重做（输入态已让位给浏览器原生撤销）
  if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) redoEdit(); else undoEdit();
    return;
  }
  if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redoEdit(); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === "b") {
    e.preventDefault(); openBatchModal(); return;
  }
  if (mod && e.shiftKey && e.key.toLowerCase() === "v") {
    e.preventDefault(); openVoucher(null); return;
  }

  if (mod && e.key.toLowerCase() === "o") {
    e.preventDefault();
    if (e.shiftKey) folderInput.click(); else fileInput.click();
    return;
  }
  if (mod && e.key.toLowerCase() === "e") {
    e.preventDefault();
    if (e.shiftKey) {
      if (!exportAllBtn.hidden) exportAllBtn.click(); else toast("至少需要 2 份已完成的结果才能合并导出");
    } else {
      const item = selected();
      if (item) onAction("xlsx", item); else toast("请先选择一份已解析的文件");
    }
    return;
  }
  if (mod && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (!summaryBtn.hidden) summaryBtn.click(); else toast("至少需要 2 份已完成的结果才能汇总");
    return;
  }
  if (mod && e.shiftKey && e.key.toLowerCase() === "c") {
    e.preventDefault(); openCaseModal(); return;
  }
  if (mod && e.shiftKey && e.key.toLowerCase() === "r") {
    e.preventDefault();
    const item = selected();
    if (item) toggleReview(item); else toast("请先选择一份已解析的文件");
    return;
  }
  if (mod && e.key.toLowerCase() === "p" && !e.shiftKey) {
    e.preventDefault();
    const item = selected();
    if (item) openReport([item]); else toast("请先选择一份已解析的文件");
    return;
  }
  // Alt+1 / Alt+2 切换视图
  if (e.altKey && (e.key === "1" || e.key === "2")) {
    e.preventDefault();
    const target = e.key === "1" ? "fields" : "verify";
    const btn = viewToggle.querySelector('button[data-view="' + target + '"]');
    if (btn) btn.click();
    return;
  }
});

/* ---------- 粘贴即解析（文本 / 文件） ---------- */
document.addEventListener("paste", (e) => {
  if (IS_FILE) return;
  const ae = document.activeElement;
  if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) return;
  const dt = e.clipboardData || window.clipboardData;
  if (!dt) return;
  const files = dt.files && dt.files.length ? Array.from(dt.files) : [];
  const text = typeof dt.getData === "function" ? (dt.getData("text") || "") : "";
  if (files.length) {
    const realFiles = files.filter((f) => !/^image\//.test(f.type || ""));
    if (realFiles.length) { handleFiles(realFiles); e.preventDefault(); }
    else toast("图片暂不支持直接识别，请上传 PDF / 文本，或复制发票文字后粘贴");
    return;
  }
  if (text.trim()) {
    const f = new File([text], "剪贴板文本_" + Date.now() + ".txt", { type: "text/plain" });
    handleFiles([f]);
    e.preventDefault();
    toast("已从剪贴板解析文本");
  }
});

/* ---------- 启动 ---------- */
const DEMO = {
  doc_type: "发票 / Invoice",
  filename: "示例发票.txt",
  raw_text:
    "增值税电子普通发票\n" +
    "发票号码: INV20261114001\n" +
    "开票日期: 2026年11月14日\n" +
    "销售方: 苏州太湖科技有限公司\n" +
    "购买方: 言令工作室\n" +
    "纳税人识别号: 91320500MA1ABC2345\n" +
    "银行账号: 6225888812345678\n" +
    "税率: 13%\n" +
    "价税合计: ¥1,130.00\n" +
    "税额: ¥130.00\n" +
    "明细:\n" +
    "笔记本电脑  1  1000.00  1000.00",
  fields: [
    { label: "发票号码", key: "invoice_no", value: "INV20261114001", confidence: 0.92, source: "发票号码: INV20261114001" },
    { label: "开票日期", key: "date", value: "2026年11月14日", confidence: 0.85, source: "开票日期: 2026年11月14日" },
    { label: "价税合计", key: "total", value: "1130.00", confidence: 0.9, source: "价税合计: ¥1,130.00" },
    { label: "税额", key: "tax", value: "130.00", confidence: 0.85, source: "税额: ¥130.00" },
    { label: "税率", key: "tax_rate", value: "13%", confidence: 0.8, source: "税率: 13%" },
    { label: "销售方", key: "seller", value: "苏州太湖科技有限公司", confidence: 0.7, source: "销售方: 苏州太湖科技有限公司" },
    { label: "购买方", key: "buyer", value: "言令工作室", confidence: 0.7, source: "购买方: 言令工作室" },
    { label: "纳税人识别号", key: "tax_id", value: "91320500MA1ABC2345", confidence: 0.88, source: "纳税人识别号: 91320500MA1ABC2345" },
    { label: "开户行及账号", key: "bank_account", value: "6225888812345678", confidence: 0.85, source: "银行账号: 6225888812345678" }
  ],
  line_items: [
    { name: "笔记本电脑", qty: "1", unit_price: "1000.00", amount: "1000.00", source: "笔记本电脑  1  1000.00  1000.00" }
  ],
  notes: []
};

async function boot() {
  // 统一版本号：所有 data-app-version 节点由 APP_VERSION 驱动
  document.querySelectorAll("[data-app-version]").forEach((el) => { el.textContent = "v" + APP_VERSION; });
  renderTemplateSelect();
  renderCaseChip();
  renderAuditList();
  if (IS_FILE) {
    banner.hidden = false;
    const demoItem = { id: ++state.seq, name: "示例发票.txt", size: 1234, status: "done", data: DEMO, tpl: "vat", caseId: currentCaseId(), fromHistory: false };
    state.queue.push(demoItem);
    renderQueue(); selectItem(demoItem.id);
    toast("预览模式 · 启动服务后可解析真实文件");
  } else {
    getHistory().forEach((rec) => {
      state.queue.push({ id: ++state.seq, name: rec.name, size: rec.size, status: "done", data: rec.data,
                         tpl: rec.tpl || "general", reviewed: !!rec.reviewed, fromHistory: true });
    });
    renderQueue(); syncClearBtn();
    // 刷新后直接回到最近一次解析的结果，避免「队列有文件、结果区却空白」像数据丢失
    const latest = state.queue[0];  // pushHistory 用 unshift，最新记录排在最前
    if (latest) selectItem(latest.id);
  }
  // 与本机磁盘工作区对齐：磁盘更新则以磁盘为准，否则把本地结果写进磁盘
  await initWorkspace();
}
boot();
