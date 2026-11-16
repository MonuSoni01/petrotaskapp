/* ============ core: state, API, cache, helpers, UI primitives ============ */
const CFG = window.TM_CONFIG || {};
const ACT = {}, ON_CHANGE = {}, ON_INPUT = {};
const S = {
  token: "", user: null, data: null, idx: null,
  syncing: false, lastSync: 0, route: "home", params: {}, ui: {}, charts: {},
  pendingRender: false
};

// ---------- API ----------
async function api(action, args = {}, { timeout = 150000 } = {}) {
  if (!CFG.API_URL || /PASTE_YOUR/.test(CFG.API_URL)) throw new Error("API URL is not set in config.js");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(CFG.API_URL, {
      method: "POST", redirect: "follow", signal: ctrl.signal,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, token: S.token, args })
    });
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "Server took too long. Try again." : "Network error — check your internet connection.");
  } finally { clearTimeout(timer); }
  let json;
  try { json = await res.json(); } catch (e) { throw new Error("Unexpected server response. Check the Apps Script deployment (access must be 'Anyone')."); }
  if (!json || json.success === false) {
    const msg = (json && (json.error || json.message)) || "Request failed.";
    if (/AUTH_REQUIRED/.test(msg)) { onAuthExpired(); throw new Error("Your session expired. Please sign in again."); }
    throw new Error(msg);
  }
  return json;
}

// ---------- Cache (IndexedDB, falls back to memory) ----------
const Cache = (() => {
  let dbp = null;
  function db() {
    if (!("indexedDB" in window)) return Promise.reject(new Error("no idb"));
    if (!dbp) dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open("taskmaster", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  async function op(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction("kv", mode);
      const r = fn(tx.objectStore("kv"));
      tx.oncomplete = () => resolve(r && r.result);
      tx.onerror = () => reject(tx.error);
    });
  }
  return {
    get: key => op("readonly", s => s.get(key)).catch(() => null),
    set: (key, val) => op("readwrite", s => s.put(val, key)).catch(() => null),
    clear: () => op("readwrite", s => s.clear()).catch(() => null)
  };
})();

// ---------- generic helpers ----------
const h = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ek = v => String(v || "").trim().toLowerCase();
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isStamp = v => /^\d{4}-\d{2}-\d{2}/.test(String(v || ""));
const d10 = v => isStamp(v) ? String(v).slice(0, 10) : "";
function parseLocal(v) {
  const t = String(v || "");
  if (!t) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? t + "T00:00:00" : t);
  return isNaN(d.getTime()) ? null : d;
}
function fmtD(v) {
  const k = d10(v);
  if (k) { const [y, m, d] = k.split("-"); return Number(d) + " " + MONTHS[Number(m) - 1] + " " + y; }
  const d = parseLocal(v); return d ? d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() : "—";
}
function fmtShort(v) { const k = d10(v); if (!k) return "—"; const [, m, d] = k.split("-"); return Number(d) + " " + MONTHS[Number(m) - 1]; }
function fmtTime(v) {
  const m = String(v || "").match(/T(\d{2}):(\d{2})/); if (!m) return "";
  let hh = Number(m[1]); const ap = hh >= 12 ? "PM" : "AM"; hh = hh % 12 || 12; return hh + ":" + m[2] + " " + ap;
}
function fmtDT(v) { return v ? fmtD(v) + (fmtTime(v) ? ", " + fmtTime(v) : "") : "—"; }
function dayDiff(a, b) { // b - a in days, yyyy-mm-dd
  return Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / 86400000);
}
function ymd(k) { const [y, m, d] = k.split("-").map(Number); return [y, m - 1, d]; }
function addDays(k, n) { const d = new Date(Date.UTC(...ymd(k))); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function monthLabel(m) { if (!/^\d{4}-\d{2}$/.test(m || "")) return m || ""; const [y, mm] = m.split("-"); return MONTHS[Number(mm) - 1] + " " + y; }
function relDay(k) {
  const t = S.data?.today; if (!k || !t) return fmtD(k);
  const diff = dayDiff(k, t);
  if (diff === 0) return "Today"; if (diff === 1) return "Yesterday";
  return fmtD(k);
}
function linkify(text) {
  return h(text).replace(/(https?:\/\/[^\s<]+)/g, u => `<a href="${u}" target="_blank" rel="noopener">${u.length > 48 ? u.slice(0, 45) + "…" : u}</a>`);
}
const safeUrl = v => /^https?:\/\//i.test(String(v || "")) ? h(v) : "#";
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
function greet() { const hr = new Date().getHours(); return hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening"; }

// ---------- people ----------
function nameOf(email) { const u = S.idx?.users.get(ek(email)); return u ? u.name : (email || "—"); }
function initials(name) { const p = String(name || "?").trim().split(/\s+/); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); }
function hue(str) { let x = 0; for (const c of String(str)) x = (x * 31 + c.charCodeAt(0)) % 360; return x; }
function avatar(email, size = "") {
  const n = nameOf(email);
  return `<span class="avatar ${size}" style="background:hsl(${hue(ek(email))} 55% 45%)" title="${h(n)}">${h(initials(n))}</span>`;
}
function person(email, size = "sm") { return `<span class="person">${avatar(email, size)}<span class="nm">${h(nameOf(email))}</span></span>`; }

// ---------- chips ----------
const STATUS_CHIP = {
  "Pending": ["chip-amber", "Pending", "fa-hourglass-half"], "Reopened": ["chip-red", "Reopened", "fa-rotate-left"],
  "Submitted": ["chip-violet", "Awaiting approval", "fa-paper-plane"], "Extension Requested": ["chip-orange", "Extension requested", "fa-calendar-plus"],
  "Approved": ["chip-green", "Approved", "fa-check"], "Done": ["chip-green", "Done", "fa-check"], "Closed": ["chip-green", "Resolved", "fa-check"],
  "Rejected": ["chip-red", "Rejected / Fake", "fa-ban"], "Cancelled": ["chip-slate", "Cancelled", "fa-xmark"], "Open": ["chip-amber", "Open", "fa-circle-dot"]
};
function statusChip(s) { const c = STATUS_CHIP[s] || ["chip-slate", s || "—", "fa-circle"]; return `<span class="chip ${c[0]}"><i class="fas ${c[2]}"></i>${h(c[1])}</span>`; }
function prioChip(p) {
  const v = String(p || "").trim(); if (!v) return "";
  const cls = /high/i.test(v) ? "chip-red" : /low/i.test(v) ? "chip-slate" : "chip-amber";
  return `<span class="chip ${cls}"><i class="fas fa-flag"></i>${h(v)}</span>`;
}
function dueInfo(due, open = true) {
  const k = d10(due);
  if (!open) return "";
  if (!k) return `<span class="due muted"><i class="far fa-calendar"></i> No deadline</span>`;
  const diff = dayDiff(S.data.today, k);
  if (diff < 0) return `<span class="due red"><i class="fas fa-triangle-exclamation"></i> Overdue · ${-diff}d</span>`;
  if (diff === 0) return `<span class="due amber"><i class="far fa-clock"></i> Due today</span>`;
  if (diff === 1) return `<span class="due amber"><i class="far fa-clock"></i> Due tomorrow</span>`;
  return `<span class="due muted"><i class="far fa-calendar"></i> Due ${fmtShort(k)} · ${diff}d</span>`;
}
function scoreCls(s) { return s >= 80 ? "score-green" : s >= 60 ? "score-yellow" : "score-red"; }
function scoreDot(earned, max) { const r = max ? earned / max : 0; return `<span class="dot ${r >= .8 ? "g" : r >= .5 ? "y" : "r"}"></span>`; }
function empty(title, icon = "inbox", sub = "") { return `<div class="empty"><i class="fas fa-${icon}"></i><h4>${h(title)}</h4>${sub ? `<div class="small">${h(sub)}</div>` : ""}</div>`; }
function seg(name, value, options) {
  return `<div class="seg" role="tablist">${options.map(o => `<button type="button" class="${o.v === value ? "on" : ""}" data-act="seg" data-seg="${h(name)}" data-v="${h(o.v)}">${o.icon ? `<i class="fas fa-${o.icon}"></i>` : ""}${h(o.l)}${o.c != null ? `<span class="cnt">${o.c}</span>` : ""}</button>`).join("")}</div>`;
}
function fchips(name, value, options) {
  return `<div class="filter-chips">${options.map(o => `<button type="button" class="fchip ${o.v === value ? "on" : ""}" data-act="seg" data-seg="${h(name)}" data-v="${h(o.v)}">${h(o.l)}${o.c != null ? ` · ${o.c}` : ""}</button>`).join("")}</div>`;
}
function pager(name, page, total, size) {
  if (total <= size) return "";
  const from = page * size;
  return `<div class="pager"><button class="btn btn-ghost btn-sm" ${page === 0 ? "disabled" : ""} data-act="page" data-pg="${h(name)}" data-v="${page - 1}"><i class="fas fa-chevron-left me-1"></i>Prev</button>
    <span>${from + 1}–${Math.min(from + size, total)} of ${total}</span>
    <button class="btn btn-ghost btn-sm" ${from + size >= total ? "disabled" : ""} data-act="page" data-pg="${h(name)}" data-v="${page + 1}">Next<i class="fas fa-chevron-right ms-1"></i></button></div>`;
}
function ui(route) { return S.ui[route] || (S.ui[route] = {}); }

// ---------- toast ----------
function toast(msg, type = "ok") {
  const icon = type === "ok" ? "circle-check" : type === "warn" ? "triangle-exclamation" : "circle-exclamation";
  const el = document.createElement("div");
  el.className = "toastx " + type; el.innerHTML = `<i class="fas fa-${icon}"></i><span>${h(msg)}</span>`;
  $("#toasts").prepend(el);
  setTimeout(() => el.remove(), type === "err" ? 6000 : 3500);
}

// ---------- dialog ----------
let dlgModal = null, dlgHandler = null;
function dialog({ title, body, submit = "Save", submitClass = "btn-brand", size = "", onSubmit, noFooter = false, onShown }) {
  dlgModal = dlgModal || new bootstrap.Modal($("#dlg"));
  $("#dlgTitle").innerHTML = title;
  $("#dlgBody").innerHTML = body;
  $("#dlgError").textContent = "";
  $("#dlgDialog").className = "modal-dialog modal-dialog-centered modal-dialog-scrollable " + size;
  const btn = $("#dlgSubmit");
  btn.className = "btn " + submitClass; btn.innerHTML = submit; btn.disabled = false;
  btn.classList.toggle("d-none", !onSubmit);
  $("#dlgFoot").classList.toggle("d-none", noFooter);
  dlgHandler = onSubmit || null;
  dlgModal.show();
  if (onShown) $("#dlg").addEventListener("shown.bs.modal", () => onShown($("#dlgBody")), { once: true });
  return $("#dlgBody");
}
function closeDialog() { dlgModal && dlgModal.hide(); }
async function handleDialogSubmit(e) {
  e.preventDefault();
  if (!dlgHandler) return;
  const btn = $("#dlgSubmit"), old = btn.innerHTML;
  $("#dlgError").textContent = "";
  btn.disabled = true; btn.innerHTML = `<span class="spinner-border me-2"></span>Saving…`;
  try {
    const ok = await dlgHandler($("#dlgForm"));
    if (ok !== false) closeDialog();
  } catch (err) {
    $("#dlgError").textContent = err.message || String(err);
  } finally { btn.disabled = false; btn.innerHTML = old; }
}
function confirmBox(title, text, okText = "Confirm", cls = "btn-brand") {
  return new Promise(resolve => {
    let done = false;
    dialog({ title, body: `<p class="mb-0">${text}</p>`, submit: okText, submitClass: cls, onSubmit: () => { done = true; resolve(true); } });
    $("#dlg").addEventListener("hidden.bs.modal", () => { if (!done) resolve(false); }, { once: true });
  });
}
function formVal(form, name) { const el = form.elements[name]; return el ? String(el.value || "").trim() : ""; }
function need(cond, msg) { if (!cond) throw new Error(msg); }

// ---------- files ----------
function readFile(input) {
  const file = input && input.files && input.files[0];
  if (!file) return Promise.resolve(null);
  if (file.size > (CFG.MAX_FILE_MB || 10) * 1024 * 1024) return Promise.reject(new Error(`File is too large (max ${CFG.MAX_FILE_MB || 10} MB).`));
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, mimeType: file.type || "application/octet-stream", data: String(r.result).split(",")[1] });
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}
// Attachment box: choose file, paste a screenshot (Ctrl+V / button) or drag & drop.
const fileField = (name = "file", label = "Attachment (optional)") =>
  `<label class="form-label mt-3">${label}</label>
  <div class="attach-zone" data-zone>
    <input type="file" class="d-none" name="${name}" data-change="attachPick">
    <div class="attach-empty">
      <i class="fas fa-cloud-arrow-up"></i>
      <div class="attach-hint"><b>Paste screenshot</b> (Ctrl+V), drag & drop, or</div>
      <div class="d-flex gap-2 flex-wrap justify-content-center">
        <button type="button" class="btn btn-soft btn-sm" data-act="attachBrowse"><i class="fas fa-folder-open me-1"></i>Choose file</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="pasteShot"><i class="fas fa-paste me-1"></i>Paste screenshot</button>
      </div>
    </div>
    <div class="attach-preview d-none"></div>
  </div>`;

function setInputFile(input, file) {
  if (!input || !file) return;
  const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
function shotFile(blob) {
  const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return new File([blob], `screenshot-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`, { type: blob.type || "image/png" });
}
function fileSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
function previewHtml(file) {
  const img = /^image\//.test(file.type) ? `<img src="${URL.createObjectURL(file)}" alt="">` : `<span class="att-ic"><i class="fas fa-file-lines"></i></span>`;
  return `${img}<div class="min-w-0 flex-grow-1"><div class="fw-semibold text-truncate">${h(file.name)}</div><div class="small-2 text-muted">${fileSize(file.size)}${file.size > (CFG.MAX_FILE_MB || 10) * 1048576 ? ' · <span class="text-danger">too large</span>' : ""}</div></div>
    <button type="button" class="icon-btn" data-act="attachClear" title="Remove"><i class="fas fa-xmark"></i></button>`;
}
function zoneOf(el) { return el.closest("[data-zone]"); }
ACT.attachBrowse = el => zoneOf(el).querySelector('input[type=file]').click();
ON_CHANGE.attachPick = el => {
  const z = zoneOf(el), f = el.files[0], pv = z.querySelector(".attach-preview");
  z.querySelector(".attach-empty").classList.toggle("d-none", Boolean(f));
  pv.classList.toggle("d-none", !f); pv.innerHTML = f ? previewHtml(f) : "";
};
ACT.attachClear = el => { const z = zoneOf(el), i = z.querySelector("input[type=file]"); i.value = ""; i.dispatchEvent(new Event("change", { bubbles: true })); };
// "Paste screenshot" button (uses the clipboard API; falls back to Ctrl+V hint)
ACT.pasteShot = async el => {
  const input = zoneOf(el).querySelector("input[type=file]");
  try {
    const items = await navigator.clipboard.read();
    for (const it of items) {
      const type = it.types.find(t => t.startsWith("image/"));
      if (type) return setInputFile(input, shotFile(await it.getType(type)));
    }
    toast("No screenshot in clipboard. Take one (Win+Shift+S) and try again.", "warn");
  } catch (e) { toast("Press Ctrl+V to paste the screenshot.", "warn"); }
};
// Ctrl+V anywhere in an open dialog or in the chat drops the image into the attachment box.
document.addEventListener("paste", e => {
  const file = [...(e.clipboardData?.files || [])].find(f => /^image\//.test(f.type)) ||
    [...(e.clipboardData?.items || [])].filter(i => i.kind === "file" && i.type.startsWith("image/")).map(i => i.getAsFile())[0];
  if (!file) return;
  const dlgOpen = $("#dlg").classList.contains("show");
  const target = dlgOpen ? $("#dlg [data-zone] input[type=file]") :
    $("#taskDrawer").classList.contains("show") ? $("#chatFile") : $("#view [data-zone] input[type=file]");
  if (!target) return;
  e.preventDefault();
  setInputFile(target, file.name && file.name !== "image.png" ? file : shotFile(file));
  toast("Screenshot attached.");
});
// drag & drop onto any attachment box / the chat
document.addEventListener("dragover", e => { const z = e.target.closest("[data-zone], #taskDrawer"); if (z) { e.preventDefault(); z.classList.add("drag"); } });
document.addEventListener("dragleave", e => { const z = e.target.closest("[data-zone], #taskDrawer"); if (z) z.classList.remove("drag"); });
document.addEventListener("drop", e => {
  const z = e.target.closest("[data-zone], #taskDrawer"); if (!z) return;
  e.preventDefault(); z.classList.remove("drag");
  const f = e.dataTransfer.files[0]; if (!f) return;
  setInputFile(z.id === "taskDrawer" ? $("#chatFile") : z.querySelector("input[type=file]"), f);
});

// ---------- event delegation ----------
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const inner = e.target.closest("input, button, a, select, textarea, label");
  if (inner && inner !== el && el.contains(inner) && !inner.hasAttribute("data-act")) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  if (el.tagName === "A" && !el.getAttribute("href")?.startsWith("#/")) e.preventDefault();
  if (el.tagName === "BUTTON") e.preventDefault();
  fn(el, e);
});
document.addEventListener("change", e => { const el = e.target.closest("[data-change]"); if (el && ON_CHANGE[el.dataset.change]) ON_CHANGE[el.dataset.change](el, e); });
document.addEventListener("input", e => { const el = e.target.closest("[data-input]"); if (el && ON_INPUT[el.dataset.input]) ON_INPUT[el.dataset.input](el, e); });

// segmented tabs / chips: data-seg="route.key"
ACT.seg = el => {
  const [route, key] = el.dataset.seg.split(".");
  ui(route)[key] = el.dataset.v;
  if (ui(route).page != null) ui(route).page = 0;
  rerender();
};
ACT.page = el => {
  const [route, key] = el.dataset.pg.split(".");
  ui(route)[key || "page"] = Number(el.dataset.v);
  rerender(); window.scrollTo({ top: 0, behavior: "smooth" });
};
// generic ui-state inputs: data-change="ui" data-k="route.key"
// Filters apply instantly. Dates apply once a full date is picked/typed (year >= 2000).
const applyFilter = (el) => {
  const [r, k] = el.dataset.k.split(".");
  ui(r)[k] = el.type === "checkbox" ? el.checked : el.value;
  if (ui(r).page != null) ui(r).page = 0;
  rerender(true);
};
const applyDateFilter = debounce(applyFilter, 450);
ON_CHANGE.ui = el => {
  if (/^(date|month)$/.test(el.type)) {
    if (el.value && Number(el.value.slice(0, 4)) < 2000) return; // still typing the year
    return applyDateFilter(el);
  }
  applyFilter(el);
};
ACT.resetFilters = el => { const keep = {}; ["tab"].forEach(k => { if (ui(el.dataset.r)[k]) keep[k] = ui(el.dataset.r)[k]; }); S.ui[el.dataset.r] = keep; rerender(true); toast("Filters cleared."); };
const resetBtn = r => `<button type="button" class="btn btn-ghost" data-act="resetFilters" data-r="${r}" title="Clear filters"><i class="fas fa-filter-circle-xmark me-1"></i>Reset</button>`;
ON_INPUT.uisearch = debounce(el => {
  const [r, k] = el.dataset.k.split("."); ui(r)[k] = el.value; if (ui(r).page != null) ui(r).page = 0;
  const pos = el.selectionStart; rerender(true);
  const again = $(`[data-k="${el.dataset.k}"]`); if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} }
}, 250);
