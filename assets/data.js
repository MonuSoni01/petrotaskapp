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
function teamUsers() { return (S.data?.users || []).filter(u => S.idx.team.has(ek(u.email))).sort((a, b) => String(a.name).localeCompare(String(b.name))); }
function workIsOpen(s) { return !["Approved", "Done", "Closed", "Rejected", "Cancelled"].includes(s); }
function canReview(t) { return ek(t[1]) === me() || S.idx.team.has(ek(t[2])); }
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
  reassigned: { text: "Reassigned (leave cover)", icon: "fa-people-arrows", cls: "chip-slate" }
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
function scoreTiles(st, label) {
  const ring = (v, color) => { const C = 2 * Math.PI * 26, p = v == null ? 0 : Math.max(0, Math.min(100, v));
    return `<div class="ring sm"><svg width="62" height="62"><circle cx="31" cy="31" r="26" stroke="var(--slate-50)" stroke-width="6" fill="none"/><circle cx="31" cy="31" r="26" stroke="${color}" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C - p / 100 * C}"/></svg><div class="ring-t" style="color:var(--text)">${v == null ? "—" : Math.round(v) + "%"}</div></div>`; };
  const row = (n, b) => `<tr><td>${n}</td><td class="mono">${b.done}/${b.total}</td><td class="mono ${pctCls(b.completion)}">${pctTxt(b.completion)}</td><td class="mono ${pctCls(b.ontime)}">${pctTxt(b.ontime)}</td><td class="mono">${b.late}</td><td class="mono">${b.fake ? `<span class="text-danger">${b.fake}</span>` : 0}</td></tr>`;
  return `<div class="cardx mb-3"><div class="cardx-head"><h3><i class="fas fa-gauge-high text-brand me-2"></i>${h(label)}</h3><span class="small text-muted">Delegation + KRA + Help tickets</span></div>
    <div class="cardx-body"><div class="d-flex flex-wrap gap-4 align-items-center">
      <div class="d-flex align-items-center gap-3">${ring(st.all.completion, "var(--brand)")}<div><div class="fw-bold">Completion</div><div class="small text-muted">${st.all.done} of ${st.all.total} done</div></div></div>
      <div class="d-flex align-items-center gap-3">${ring(st.all.ontime, "var(--green)")}<div><div class="fw-bold">On-time</div><div class="small text-muted">${st.all.onTime} of ${st.all.done} on time</div></div></div>
      <div class="table-wrap flex-grow-1" style="min-width:280px"><table class="tablex compact"><thead><tr><th>Work</th><th>Done</th><th>Completion</th><th>On-time</th><th>Late</th><th>Fake</th></tr></thead>
        <tbody>${row("Delegation", st.task)}${row("KRA", st.kra)}${row("Help tickets", st.ticket)}</tbody></table></div>
    </div></div></div>`;
}
