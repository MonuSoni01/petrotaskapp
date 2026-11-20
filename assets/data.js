/* ============ data: index, scoring (same logic as V2), history timeline ============ */
// Row layouts (same as the Google Sheet):
// Task:   0 id,1 by,2 to,3 desc,4 deadline,5 priority,6 status,7 submitFile,8 remarks,9 created,10 createFile,11 submitted,12 approved,13 reopened
// Ticket: 0 id,1 raisedBy,2 dept,3 assignedTo,4 desc,5 created,6 status,7 file,8 response,9 createFile,10 resolved,11 deadline
// KRA:    0 id,1 kraId,2 emp,3 desc,4 date,5 status,6 file,7 remarks,8 completed,9 verify
// KPI:    0 id,1 dept,2 email,3 name,4 weight,5 type,6 instructions,7 description
// KRA_M:  0 id,1 kpiId,2 emp,3 desc,4 freq,5 freqVal
// Manual: 0 id,1 month,2 email,3 kpi,4 score,5 by,6 remarks     MD: 0 id,1 month,2 email,3 sys,4 md,5 remarks,6 ts
// Activity: 0 id,1 taskId,2 ts,3 actor,4 type,5 message,6 metaJSON,7 attachment

function byKey(rows, keyFor) {
  const m = new Map();
  rows.forEach(r => { const k = keyFor(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
  return m;
}
function monthKeyOf(v) { const t = String(v || ""); if (/^\d{4}-\d{2}/.test(t)) return t.slice(0, 7); const d = parseLocal(t); return d ? d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") : ""; }

function buildIndex(data) {
  const seen = new Set();
  data.kraTasks = (data.kraTasks || []).filter(r => {
    const k = JSON.stringify([String(r[0]).trim(), String(r[1]).trim(), ek(r[2])]);
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  data.activity = data.activity || [];
  return {
    team: new Set((data.managedEmails || []).map(ek)),
    down: new Set((data.downlineEmails || data.managedEmails || []).map(ek)), // everyone below me in the reporting tree
    users: new Map((data.users || []).map(u => [ek(u.email), u])),
    taskById: new Map(data.tasks.map(r => [String(r[0]), r])),
    taskIn: byKey(data.tasks, r => ek(r[2])),
    taskOut: byKey(data.tasks, r => ek(r[1])),
    kraIn: byKey(data.kraTasks, r => ek(r[2])),
    kraMonth: byKey(data.kraTasks, r => ek(r[2]) + "|" + monthKeyOf(r[4])),
    kraMaster: new Map((data.kraMaster || []).map(r => [r[0], r])),
    ticketIn: byKey(data.tickets, r => ek(r[3])),
    ticketOut: byKey(data.tickets, r => ek(r[1])),
    activity: byKey(data.activity, r => String(r[1])),
    holidays: new Set(data.holidays || [])
  };
}
function me() { return ek(S.user?.email); }
function isAdmin() { return Boolean(S.data?.admin || ek(S.user?.role) === "admin"); }
function canManage() { return Boolean(S.data?.canManage); }
// People I can see/evaluate = my whole reporting tree (MD sees everyone, HOD sees own people)
function teamUsers() { return (S.data?.users || []).filter(u => S.idx.down.has(ek(u.email))).sort((a, b) => String(a.name).localeCompare(String(b.name))); }
// People I can assign tasks to = direct reports only
function directUsers() { return (S.data?.users || []).filter(u => S.idx.team.has(ek(u.email))).sort((a, b) => String(a.name).localeCompare(String(b.name))); }
function workIsOpen(s) { return !["Approved", "Done", "Closed", "Rejected", "Cancelled"].includes(s); }
function canReview(t) { return ek(t[1]) === me() || S.idx.down.has(ek(t[2])); } // can view / chat / mark fake
// Approve / reopen / reject / extension: only the person who delegated the task.
// If that person is no longer active, the assignee's manager takes over.
function canApprove(t) {
  if (ek(t[1]) === me()) return true;
  const owner = S.idx.users.get(ek(t[1]));
  return !(owner && owner.active !== false) && S.idx.team.has(ek(t[2]));
}
// Everyone below a person in the reporting tree (HOD → team → their team …)
function downline(email) {
  const kids = new Map();
  (S.data.users || []).forEach(u => String(u.manager || "").toLowerCase().split(/[\s,;|<>]+/).filter(x => x.includes("@")).forEach(m => {
    if (!kids.has(m)) kids.set(m, []); kids.get(m).push(ek(u.email)); }));
  const out = new Set(), q = [ek(email)];
  while (q.length) { const x = q.shift(); (kids.get(x) || []).forEach(k => { if (!out.has(k) && k !== ek(email)) { out.add(k); q.push(k); } }); }
  return out;
}
function isAwaiting(s) { return s === "Submitted" || s === "Extension Requested"; }

// ---------- KPI scoring (unchanged formulas) ----------
function kpiType(kpi) {
  const t = ek(kpi[5]);
  if (t === "manual" || t === "hr_attendance") return "manual";
  if (t === "auto" || t === "automated" || t === "automatic") return "auto";
  return "other";
}
function isKPIMatch(kpi, email) { const k = ek(kpi[2]); return k === ek(email) || k === "all"; }
function userKPIs(email) { return (S.data.kpiMaster || []).filter(k => isKPIMatch(k, email)); }
function manualScoreRow(kpi, email, month) {
  return (S.data.manualScores || []).find(s => ek(s[2]) === ek(email) && String(s[1]).trim() === month && String(s[3]).trim() === String(kpi[0]).trim());
}
function mdRow(email, month) { return (S.data.mdScores || []).find(m => String(m[1] || "").trim() === month && ek(m[2]) === ek(email)); }
function linkedKraIds(kpi, email) {
  return new Set((S.data.kraMaster || []).filter(r => ek(r[2]) === ek(email) && r[1] === kpi[0]).map(r => r[0]));
}
// Classifies every KRA occurrence that feeds an Auto KPI.
function autoKpiRows(kpi, email, month) {
  const linked = linkedKraIds(kpi, email);
  return (S.idx.kraMonth.get(ek(email) + "|" + month) || []).filter(r => linked.has(r[1])).map(r => {
    let cls = "pending", pts = 0;
    if (r[5] === "Rejected") { cls = "rejected"; pts = -1; }
    else if (r[5] === "Done") {
      const target = parseLocal(r[4]); if (target) target.setHours(23, 59, 59, 999);
      const done = r[8] ? parseLocal(r[8]) : new Date();
      const onTime = target && done && done <= target;
      cls = onTime ? "ontime" : "late"; pts = onTime ? 1 : 0.5;
    }
    return { row: r, cls, pts };
  });
}
function kpiEarnedScore(kpi, email, month) {
  const type = kpiType(kpi);
  if (type === "manual") { const r = manualScoreRow(kpi, email, month); return r ? parseFloat(r[4]) || 0 : 0; }
  if (type !== "auto") return 0;
  const rows = autoKpiRows(kpi, email, month);
  const earned = rows.reduce((s, x) => s + x.pts, 0);
  return rows.length ? (earned / rows.length) * (parseFloat(kpi[4]) || 0) : 0;
}
function monthlyScore(email, month) { return userKPIs(email).reduce((t, k) => t + kpiEarnedScore(k, email, month), 0); }
function finalMonthly(email, month) {
  const sys = monthlyScore(email, month); const md = mdRow(email, month);
  return { sys, md, final: md ? parseFloat(md[4]) || 0 : sys };
}

// ---------- today's goal ring (unchanged logic) ----------
function todayProgress(email) {
  const ts = new Date(S.data.today + "T00:00:00"), te = new Date(ts); te.setDate(te.getDate() + 1);
  let total = 0, done = 0;
  (S.idx.taskIn.get(ek(email)) || []).forEach(t => {
    const st = t[6], due = parseLocal(t[4]) || new Date(NaN), ap = t[12] ? parseLocal(t[12]) : null, sub = t[11] ? parseLocal(t[11]) : null;
    const doneToday = (st === "Submitted" && sub >= ts && sub < te) || (st === "Approved" && ap >= ts && ap < te);
    if (doneToday) { total++; done++; } else if (workIsOpen(st) && st !== "Submitted" && due < te) total++;
  });
  (S.idx.kraIn.get(ek(email)) || []).forEach(k => {
    const kd = parseLocal(k[4]) || new Date(NaN), dd = k[8] ? parseLocal(k[8]) : null;
    if (k[5] === "Done" && dd >= ts && dd < te) { total++; done++; } else if (workIsOpen(k[5]) && kd < te) total++;
  });
  return total ? Math.round(done / total * 100) : 0;
}

// ---------- KRA frequency ----------
function kraFreq(kraRow) { const m = S.idx.kraMaster.get(kraRow[1]); return m ? ek(m[4]) : ""; }
function freqChip(f) {
  if (!f) return "";
  const map = { daily: "chip-amber", weekly: "chip-brand", monthly: "chip-violet", quarterly: "chip-orange", yearly: "chip-red" };
  return `<span class="chip ${map[f] || "chip-slate"}">${h(f[0].toUpperCase() + f.slice(1))}</span>`;
}

// ---------- task history (WhatsApp-style) ----------
function actMeta(a) { try { return a[6] ? JSON.parse(a[6]) : {}; } catch (e) { return {}; } }
function parseLegacy(seg) {
  let m;
  if (/^Admin:\s*Created$/i.test(seg)) return null;
  if ((m = seg.match(/^Emp \(Ext Req\):\s*(\d{4}-\d{2}-\d{2})\s*-?\s*([\s\S]*)$/i))) return { type: "extension_requested", side: "to", message: m[2], meta: { newDue: m[1] } };
  if ((m = seg.match(/^Emp \(Submit\):\s*([\s\S]*)$/i))) return { type: "submitted", side: "to", message: m[1] };
  if ((m = seg.match(/^Emp:\s*([\s\S]*)$/i))) return { type: "submitted", side: "to", message: m[1] };
  if ((m = seg.match(/^Admin \(Extension Approved\):\s*(\d{4}-\d{2}-\d{2})\s*-?\s*([\s\S]*)$/i))) return { type: "extension_approved", side: "by", message: m[2], meta: { newDue: m[1] } };
  if ((m = seg.match(/^Admin \(Extension Rejected\):\s*([\s\S]*)$/i))) return { type: "extension_rejected", side: "by", message: m[1] };
  if ((m = seg.match(/^Admin \(Reopened\):\s*([\s\S]*)$/i))) return { type: "reopened", side: "by", message: m[1] };
  if ((m = seg.match(/^Admin \(Approved\):\s*([\s\S]*)$/i))) return { type: "approved", side: "by", message: m[1] };
  if ((m = seg.match(/^Admin \(Rejected\):\s*([\s\S]*)$/i))) return { type: "rejected", side: "by", message: m[1] };
  if ((m = seg.match(/^Admin \(Cancelled\):\s*([\s\S]*)$/i))) return { type: "cancelled", side: "by", message: m[1] };
  if ((m = seg.match(/^Admin Penalty: Marked Fake \(([\s\S]*)\)$/i))) return { type: "fake", side: "by", message: m[1] };
  if ((m = seg.match(/^Admin[^:]*:\s*([\s\S]*)$/i))) return { type: "note", side: "by", message: m[1] };
  return { type: "note", side: "", message: seg };
}
function taskEvents(t) {
  const acts = (S.idx.activity.get(String(t[0])) || []).slice().sort((a, b) => String(a[2]).localeCompare(String(b[2])));
  const remarkActs = acts.filter(a => Number(actMeta(a).remark) === 1).length;
  const segs = String(t[8] || "").split(" | ").map(s => s.trim()).filter(Boolean);
  const legacy = segs.slice(0, Math.max(0, segs.length - remarkActs)).map(parseLegacy).filter(Boolean)
    .map(e => ({ ...e, actor: e.side === "to" ? t[2] : e.side === "by" ? t[1] : "", ts: "", legacy: true }));
  // Best-effort timestamps for the latest legacy events of each kind.
  const stampLast = (types, ts) => { if (!ts) return; for (let i = legacy.length - 1; i >= 0; i--) if (types.includes(legacy[i].type)) { if (!legacy[i].ts) legacy[i].ts = ts; return; } };
  stampLast(["submitted"], t[11]);
  if (["Approved", "Rejected"].includes(t[6])) stampLast(["approved"], t[12]);
  stampLast(["reopened"], t[13]);

  const ev = [];
  const has = type => acts.some(a => a[4] === type) || legacy.some(e => e.type === type);
  if (!acts.some(a => a[4] === "created")) ev.push({ type: "created", actor: t[1], ts: t[9], message: t[3], attachment: t[10], meta: { due: d10(t[4]) } });
  ev.push(...legacy);
  if (t[11] && !has("submitted") && ["Submitted", "Approved", "Rejected"].includes(t[6])) ev.push({ type: "submitted", actor: t[2], ts: t[11], message: "", attachment: t[7], synth: true });
  if (t[12] && !has("approved") && ["Approved", "Rejected"].includes(t[6])) ev.push({ type: "approved", actor: t[1], ts: t[12], message: "", synth: true });
  if (t[7] && !acts.some(a => a[7] === t[7])) { // attach the latest submission file to the last submit event
    for (let i = ev.length - 1; i >= 0; i--) if (ev[i].type === "submitted") { ev[i].attachment = ev[i].attachment || t[7]; break; }
  }
  acts.forEach(a => ev.push({ type: a[4], actor: a[3], ts: a[2], message: a[5], meta: actMeta(a), attachment: a[7], id: a[0] }));
  return ev;
}
function lastEventPreview(t) {
  const ev = taskEvents(t).filter(e => e.type !== "created");
  const e = ev[ev.length - 1];
  if (!e) return "";
  const lbl = EVENT_LABEL[e.type] ? EVENT_LABEL[e.type].text : "";
  return (e.actor ? nameOf(e.actor).split(" ")[0] + ": " : "") + (e.message || lbl);
}
const EVENT_LABEL = {
  created: { text: "Task assigned", icon: "fa-thumbtack", cls: "chip-brand" },
  submitted: { text: "Work submitted", icon: "fa-paper-plane", cls: "chip-violet" },
  approved: { text: "Approved", icon: "fa-circle-check", cls: "chip-green" },
  reopened: { text: "Reopened", icon: "fa-rotate-left", cls: "chip-red" },
  extension_requested: { text: "Extension requested", icon: "fa-calendar-plus", cls: "chip-orange" },
  extension_approved: { text: "Extension approved", icon: "fa-calendar-check", cls: "chip-green" },
  extension_rejected: { text: "Extension rejected", icon: "fa-calendar-xmark", cls: "chip-red" },
  fake: { text: "Marked fake (penalty)", icon: "fa-ban", cls: "chip-red" },
  comment: { text: "", icon: "fa-comment", cls: "" },
  note: { text: "Note", icon: "fa-note-sticky", cls: "chip-slate" },
  reassigned: { text: "Reassigned (leave cover)", icon: "fa-people-arrows", cls: "chip-slate" },
  rejected: { text: "Rejected (−1 penalty)", icon: "fa-ban", cls: "chip-red" },
  cancelled: { text: "Task cancelled", icon: "fa-xmark", cls: "chip-slate" },
  ticket_created: { text: "Ticket raised", icon: "fa-ticket", cls: "chip-brand" },
  ticket_resolved: { text: "Ticket resolved", icon: "fa-circle-check", cls: "chip-green" },
  ticket_reopened: { text: "Ticket reopened", icon: "fa-rotate-left", cls: "chip-red" }
};
// latest requested extension date for a task
function requestedExtDate(t) {
  const ev = taskEvents(t).filter(e => e.type === "extension_requested");
  const e = ev[ev.length - 1];
  return e ? (e.meta && e.meta.newDue) || "" : "";
}
function lastSubmission(t) {
  const ev = taskEvents(t).filter(e => e.type === "submitted");
  return ev[ev.length - 1] || null;
}

// ---------- optimistic local updates (shown instantly, then synced) ----------
function patchTask(id, changes, activity) {
  const t = S.idx.taskById.get(String(id)); if (!t) return;
  Object.entries(changes).forEach(([i, v]) => { t[i] = v; });
  if (activity) {
    const row = [ "LOCAL-" + Date.now(), String(id), nowStamp(), me(), activity.type, activity.message || "", JSON.stringify(activity.meta || {}), activity.attachment || "" ];
    S.data.activity.push(row);
  }
  S.idx = buildIndex(S.data);
}
function appendRemark(t, text) { return (t[8] ? t[8] + " | " : "") + text; }
function nowStamp() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

// ---------- Completion % and On-time % (V3.2) ----------
// Items count when their date (deadline / KRA date / ticket deadline) is in the period
// and already due (date <= today) or already completed. Cancelled items are ignored.
// Completion % = completed / total.  On-time % = completed on time / completed.
function workStats(email, from, to) {
  const today = S.data.today;
  const inR = k => Boolean(k) && (!from || k >= from) && (!to || k <= to);
  const blank = () => ({ total: 0, done: 0, onTime: 0, late: 0, pending: 0, fake: 0 });
  const T = { task: blank(), kra: blank(), ticket: blank() };
  const add = (b, date, st, done, onTime) => {
    if (st === "Cancelled" || !inR(date)) return;
    const fake = st === "Rejected";
    if (!done && !fake && date > today) return;
    b.total++;
    if (done) { b.done++; onTime ? b.onTime++ : b.late++; } else if (fake) b.fake++; else b.pending++;
  };
  (S.idx.taskIn.get(ek(email)) || []).forEach(t => {
    const due = d10(t[4]); const sub = d10(t[11]) || d10(t[12]);
    add(T.task, due || d10(t[9]), t[6], t[6] === "Approved", !due || !sub || sub <= due);
  });
  (S.idx.kraIn.get(ek(email)) || []).forEach(k => {
    const day = d10(k[4]); const doneOn = d10(k[8]);
    add(T.kra, day, k[5], k[5] === "Done", !doneOn || doneOn <= day);
  });
  (S.idx.ticketIn.get(ek(email)) || []).forEach(t => {
    const due = d10(t[11]); const res = d10(t[10]);
    add(T.ticket, due || d10(t[5]), t[6], t[6] === "Closed", !due || !res || res <= due);
  });
  const all = blank();
  Object.values(T).forEach(b => Object.keys(all).forEach(k => { all[k] += b[k]; }));
  const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : null;
  [T.task, T.kra, T.ticket, all].forEach(b => { b.completion = pct(b.done, b.total); b.ontime = pct(b.onTime, b.done); });
  return { ...T, all };
}
function monthRange(m) { const [y, mm] = m.split("-").map(Number); const last = new Date(Date.UTC(y, mm, 0)).getUTCDate(); return [m + "-01", m + "-" + String(last).padStart(2, "0")]; }
function pctTxt(v) { return v == null ? "—" : (Number.isInteger(v) ? v : v.toFixed(1)) + "%"; }
function pctCls(v) { return v == null ? "text-muted" : scoreCls(v); }
// ================= ONE SCORING SYSTEM (used on every screen) =================
// Work score of a type = (on time × 1 + late × ½ − fake × 1) ÷ total due × 100
function typeScore(b) { return b.total ? Math.round((b.onTime + 0.5 * b.late - b.fake) / b.total * 1000) / 10 : null; }
// KPI score of a month = Automated KPIs (from KRA) + Manual KPIs (HOD/HR). MD override replaces it.
function kpiBreakdown(email, month) {
  const kpis = userKPIs(email);
  const r = { has: kpis.length > 0, auto: 0, autoMax: 0, manual: 0, manualMax: 0, other: 0, scored: 0, manualCount: 0 };
  kpis.forEach(k => {
    const t = kpiType(k), w = parseFloat(k[4]) || 0, e = kpiEarnedScore(k, email, month);
    if (t === "auto") { r.auto += e; r.autoMax += w; }
    else if (t === "manual") { r.manual += e; r.manualMax += w; r.manualCount++; if (manualScoreRow(k, email, month)) r.scored++; }
    else r.other += w;
  });
  r.sys = r.auto + r.manual;
  const md = mdRow(email, month);
  r.md = md ? parseFloat(md[4]) || 0 : null; r.mdNote = md ? md[5] : "";
  r.kpi = r.md != null ? r.md : r.sys;
  return r;
}
function monthsBetween(from, to) {
  const out = []; let m = (from || to).slice(0, 7); const end = to.slice(0, 7);
  while (m <= end && out.length < 60) { out.push(m); const [y, mm] = m.split("-").map(Number); m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`; }
  return out;
}
function firstDataMonth() {
  if (S.idx._first) return S.idx._first;
  let m = S.data.today.slice(0, 7);
  S.data.kraTasks.forEach(r => { const k = monthKeyOf(r[4]); if (k && k < m) m = k; });
  (S.data.manualScores || []).forEach(r => { const k = String(r[1]).slice(0, 7); if (/^\d{4}-\d{2}$/.test(k) && k < m) m = k; });
  return (S.idx._first = m);
}
// KPI for a date range = average of the monthly KPI scores that exist in that range
function kpiForRange(email, from, to) {
  if (!userKPIs(email).length) return { kpi: null, months: 0 };
  const months = monthsBetween(from || firstDataMonth(), to);
  if (months.length === 1) { const b = kpiBreakdown(email, months[0]); return { kpi: b.kpi, months: 1, breakdown: b, month: months[0] }; }
  const list = months.map(m => [m, kpiBreakdown(email, m).kpi]).filter(x => x[1] > 0);
  const vals = list.map(x => x[1]);
  return { kpi: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100 : null, months: vals.length, monthly: list };
}
// Everything for one person and one period.
function fullScore(email, from, to) {
  const st = workStats(email, from, to);
  const k = kpiForRange(email, from, to);
  const sc = { st, del: typeScore(st.task), kra: typeScore(st.kra), tck: typeScore(st.ticket),
    completion: st.all.completion, ontime: st.all.ontime, kpi: k.kpi, kpiMonths: k.months, kb: k.breakdown || null, kpiMonthly: k.monthly || [] };
  const parts = [sc.del, sc.kra, sc.tck, sc.kpi].filter(v => v != null);
  sc.final = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length * 10) / 10 : null;
  sc.parts = parts.length;
  return sc;
}
function periodOfMonth(m) { const [f, t] = monthRange(m); return [f, t < S.data.today ? t : S.data.today]; }

// Score chain: Delegation → KRA → Tickets → Completion / On-time → KPI (Auto + Manual) → FINAL
function scoreChain(sc, { title = "", sub = "", compact = false } = {}) {
  const v = x => x == null ? "—" : pctTxt(x);
  const ex = scoreExplain(sc);
  const tipKey = { Delegation: "del", KRA: "kra", Tickets: "tck", Completion: "completion", "On-time": "ontime", "KPI score": "kpi", "Final score": "final" };
  const box = (cls, icon, label, value, line, valCls) => `<div class="sc-box ${cls}" ${tipAttr(ex[tipKey[label]])}><div class="sc-l"><i class="fas fa-${icon}"></i>${label}<i class="fas fa-circle-info sc-i"></i></div><div class="sc-v ${valCls || pctCls(value)}">${v(value)}</div><div class="sc-s">${line}</div></div>`;
  const t = sc.st;
  const kb = sc.kb;
  const kpiLine = kb ? (kb.md != null ? `MD final · system ${pctTxt(Math.round(kb.sys * 100) / 100)}` : `Auto ${kb.auto.toFixed(1)} + Manual ${kb.manual.toFixed(1)}`) : (sc.kpiMonths ? `avg of ${sc.kpiMonths} month${sc.kpiMonths === 1 ? "" : "s"}` : "no KPI data");
  const html = `<div class="sc-chain ${compact ? "compact" : ""}">
    <div class="sc-group"><div class="sc-gl">Work score</div><div class="sc-row">
      ${box("", "list-check", "Delegation", sc.del, `${t.task.done}/${t.task.total} done${t.task.late ? ` · ${t.task.late} late` : ""}`)}
      ${box("", "bullseye", "KRA", sc.kra, `${t.kra.done}/${t.kra.total} done${t.kra.late ? ` · ${t.kra.late} late` : ""}`)}
      ${box("", "headset", "Tickets", sc.tck, `${t.ticket.done}/${t.ticket.total} resolved`)}
    </div></div>
    <div class="sc-group"><div class="sc-gl">Discipline</div><div class="sc-row">
      ${box("", "circle-check", "Completion", sc.completion, `${t.all.done} of ${t.all.total} done`)}
      ${box("", "stopwatch", "On-time", sc.ontime, `${t.all.late} late · ${t.all.fake} fake`)}
    </div></div>
    <div class="sc-group"><div class="sc-gl">KPI</div><div class="sc-row">
      ${box("kpi", "chart-simple", "KPI score", sc.kpi, kpiLine)}
    </div></div>
    <div class="sc-group final"><div class="sc-gl">Result</div><div class="sc-row">
      ${box("final", "trophy", "Final score", sc.final, `avg of ${sc.parts} part${sc.parts === 1 ? "" : "s"}`)}
    </div></div>
  </div>`;
  if (compact) return html;
  return `<div class="cardx mb-3"><div class="cardx-head"><h3><i class="fas fa-gauge-high text-brand me-2"></i>${h(title || "Score")}</h3>${sub ? `<span class="small text-muted">${h(sub)}</span>` : ""}</div>
    <div class="cardx-body">${html}${SCORE_HELP}</div></div>`;
}
const SCORE_HELP = `<details class="sc-help"><summary><i class="fas fa-circle-info me-1"></i>How is this calculated?</summary>
  <ul><li><b>Delegation / KRA / Tickets score</b> = (on time × 1 + late × ½ − fake × 1) ÷ total due × 100.</li>
  <li><b>Completion</b> = done ÷ total due. <b>On-time</b> = done on or before deadline ÷ done.</li>
  <li><b>KPI score</b> = Automated KPIs (from KRA tasks) + Manual KPIs (scored by HOD/HR), out of 100. MD score replaces it when set. For more than one month it is the average of the monthly KPI scores.</li>
  <li><b>Final score</b> = average of Delegation, KRA, Tickets and KPI scores (only parts that have data).</li></ul></details>`;
// back-compat helper used by older screens
function scoreTiles(st, label) { return ""; }

// ---------- "How was this calculated?" text for every score (tooltips) ----------
const n1 = x => (Math.round(x * 100) / 100).toString();
function typeExplain(name, b, score) {
  if (!b.total) return `<b>${name}</b><br>No ${name.toLowerCase()} work due in this period, so it is not counted.`;
  return `<b>${name} score = ${pctTxt(score)}</b><br>On time ${b.onTime} × 1 = ${b.onTime}<br>Late ${b.late} × ½ = ${n1(b.late / 2)}<br>Fake ${b.fake} × −1 = −${b.fake}<br>Not done ${b.pending} × 0 = 0<hr>(${b.onTime} + ${n1(b.late / 2)} − ${b.fake}) ÷ ${b.total} due × 100 = <b>${pctTxt(score)}</b>`;
}
function scoreExplain(sc) {
  const t = sc.st, a = t.all;
  const parts = [["Delegation", sc.del], ["KRA", sc.kra], ["Tickets", sc.tck], ["KPI", sc.kpi]];
  const used = parts.filter(p => p[1] != null);
  let kpi;
  if (sc.kpi == null) kpi = "<b>KPI score</b><br>No KPI is mapped / scored for this period.";
  else if (sc.kb) kpi = `<b>KPI score = ${pctTxt(Math.round(sc.kpi * 100) / 100)}</b><br>Automated KPIs (from KRA tasks): ${sc.kb.auto.toFixed(2)} / ${sc.kb.autoMax}<br>Manual KPIs (HOD/HR): ${sc.kb.manual.toFixed(2)} / ${sc.kb.manualMax} (${sc.kb.scored}/${sc.kb.manualCount} scored)<hr>${sc.kb.auto.toFixed(2)} + ${sc.kb.manual.toFixed(2)} = ${sc.kb.sys.toFixed(2)}%` + (sc.kb.md != null ? `<br><b>MD final ${sc.kb.md.toFixed(2)}% replaces it</b>` : "");
  else kpi = `<b>KPI score = ${pctTxt(sc.kpi)}</b><br>Average of monthly KPI scores:<br>${sc.kpiMonthly.map(([m, v]) => `${monthLabel(m)}: ${n1(v)}%`).join("<br>")}`;
  return {
    del: typeExplain("Delegation", t.task, sc.del), kra: typeExplain("KRA", t.kra, sc.kra), tck: typeExplain("Tickets", t.ticket, sc.tck),
    completion: a.total ? `<b>Completion = ${pctTxt(sc.completion)}</b><br>Done ${a.done} ÷ Due ${a.total} × 100<br><small>Delegation approved + KRA done + Tickets resolved. Fake counts as not done.</small>` : "<b>Completion</b><br>No work due.",
    ontime: a.done ? `<b>On-time = ${pctTxt(sc.ontime)}</b><br>Done on/before deadline ${a.onTime} ÷ Done ${a.done} × 100<br>Late: ${a.late}` : "<b>On-time</b><br>Nothing completed yet.",
    kpi,
    final: used.length ? `<b>Final score = ${pctTxt(sc.final)}</b><br>${used.map(p => `${p[0]}: ${pctTxt(p[1])}`).join("<br>")}<hr>(${used.map(p => n1(p[1])).join(" + ")}) ÷ ${used.length} = <b>${pctTxt(sc.final)}</b>` + (used.length < 4 ? `<br><small>Skipped (no data): ${parts.filter(p => p[1] == null).map(p => p[0]).join(", ")}</small>` : "") : "<b>Final score</b><br>No data in this period."
  };
}
function tipAttr(html) { return html ? `data-tip="${h(html)}" tabindex="0"` : ""; }

// ---------- Suggestions: what pulled the final score down ----------
function scoreSuggestions(sc) {
  if (sc.final == null) return [];
  const t = sc.st, n = sc.parts || 1, out = [];
  const add = (area, value, text) => { if (value != null && value < 85) out.push({ area, lost: Math.round((100 - value) / n * 10) / 10, text }); };
  add("Delegation", sc.del, `${t.task.pending ? t.task.pending + " delegated task(s) not done" : ""}${t.task.late ? (t.task.pending ? ", " : "") + t.task.late + " done late" : ""}${t.task.fake ? ", " + t.task.fake + " fake" : ""} — close delegated tasks before the deadline`);
  add("KRA", sc.kra, `${t.kra.pending ? t.kra.pending + " KRA not done" : ""}${t.kra.late ? (t.kra.pending ? ", " : "") + t.kra.late + " done late" : ""}${t.kra.fake ? ", " + t.kra.fake + " fake" : ""} — mark daily KRAs done on the same day`);
  add("Tickets", sc.tck, `${t.ticket.pending ? t.ticket.pending + " ticket(s) unresolved" : ""}${t.ticket.late ? (t.ticket.pending ? ", " : "") + t.ticket.late + " resolved late" : ""} — resolve help tickets on time`);
  if (sc.kb) {
    const autoP = sc.kb.autoMax ? sc.kb.auto / sc.kb.autoMax * 100 : null, manP = sc.kb.manualMax ? sc.kb.manual / sc.kb.manualMax * 100 : null;
    const why = [];
    if (autoP != null && autoP < 85) why.push(`Automated KPI ${sc.kb.auto.toFixed(1)}/${sc.kb.autoMax} (KRA-linked work late/pending)`);
    if (manP != null && manP < 85) why.push(sc.kb.scored < sc.kb.manualCount ? `Manual KPI not fully scored (${sc.kb.scored}/${sc.kb.manualCount})` : `Manual KPI ${sc.kb.manual.toFixed(1)}/${sc.kb.manualMax} from HOD/HR`);
    add("KPI", sc.kpi, why.join("; ") || "improve KPI results");
  } else add("KPI", sc.kpi, "KPI average is low across the months — check KPI breakdown month by month");
  out.sort((a, b) => b.lost - a.lost);
  if (sc.ontime != null && sc.ontime < 80) out.push({ area: "On-time", lost: 0, text: `only ${pctTxt(sc.ontime)} of finished work was on time (${t.all.late} late) — plan work before deadlines` });
  if (t.all.fake) out.push({ area: "Fake work", lost: 0, text: `${t.all.fake} item(s) marked fake (−1 each)` });
  return out.slice(0, 3).map(x => ({ ...x, text: x.text.replace(/^ — /, "").replace(/^, /, "") }));
}
function suggestionText(sc) {
  const s = scoreSuggestions(sc);
  if (!s.length) return sc.final == null ? "" : "Strong performance — keep it up.";
  return s.map(x => `${x.area}${x.lost ? ` (−${x.lost})` : ""}: ${x.text}`).join(" · ");
}

// ---------- tooltip engine (works with mouse hover and tap) ----------
(function () {
  let tipEl = null, owner = null;
  function show(el) {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tipx"; document.body.appendChild(tipEl); }
    owner = el; tipEl.innerHTML = el.getAttribute("data-tip"); tipEl.style.display = "block";
    const r = el.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 8);
    let top = r.top - th - 8; if (top < 8) top = r.bottom + 8;
    tipEl.style.left = left + "px"; tipEl.style.top = top + "px";
  }
  function hide() { if (tipEl) tipEl.style.display = "none"; owner = null; }
  document.addEventListener("mouseover", e => { const el = e.target.closest("[data-tip]"); if (el && el !== owner) show(el); else if (!el && owner) hide(); });
  document.addEventListener("focusin", e => { const el = e.target.closest("[data-tip]"); if (el) show(el); });
  document.addEventListener("click", e => { const el = e.target.closest("[data-tip]"); if (el && "ontouchstart" in window) { owner === el ? hide() : show(el); } else if (!el) hide(); }, true);
  window.addEventListener("scroll", hide, true);
})();
