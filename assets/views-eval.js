/* ============ KPI board (scorecard + team evaluation) & KPI matrix ============ */
function instrHtml(text) {
  if (!String(text || "").trim()) return "";
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g).map((p, i) => i % 2 ? `<a href="${safeUrl(p)}" target="_blank" rel="noopener" class="fw-semibold">Open link</a>` : h(p)).join("");
  return `<div class="kpi-instr"><i class="fas fa-circle-info"></i>${parts}</div>`;
}
function descHtml(kpi) {
  const d = String(kpi[7] || "").trim();
  return d ? `<div class="kpi-desc">${linkify(d)}</div>` : `<div class="kpi-desc empty-desc">No description yet — add it in KPI_Master column H.</div>`;
}
const AUTO_CLS = { ontime: ["chip-green", "On time · 1"], late: ["chip-amber", "Late · ½"], pending: ["chip-slate", "Pending · 0"], rejected: ["chip-red", "Fake · −1"] };

function kpiBoard(email, month, { editable, route }) {
  const u = ui(route);
  const kpis = userKPIs(email);
  if (!kpis.length) return empty("No KPIs mapped", "chart-simple", "Add rows for this employee in KPI_Master.");
  const manual = kpis.filter(k => kpiType(k) === "manual"), auto = kpis.filter(k => kpiType(k) === "auto"), other = kpis.filter(k => kpiType(k) === "other");
  const sum = (list, f) => list.reduce((s, k) => s + f(k), 0);
  const w = k => parseFloat(k[4]) || 0;
  const mEarned = sum(manual, k => kpiEarnedScore(k, email, month)), aEarned = sum(auto, k => kpiEarnedScore(k, email, month));
  const totalW = sum(kpis, w);
  const { sys, md, final } = finalMonthly(email, month);
  const scored = manual.filter(k => manualScoreRow(k, email, month)).length;
  const canFake = editable && (isAdmin() || S.idx.team.has(ek(email)));

  const summary = `<div class="cardx mb-3"><div class="cardx-body d-flex flex-wrap gap-4 align-items-center">
    <div class="d-flex align-items-center gap-3">${avatar(email, "lg")}<div><div class="fw-bold">${h(nameOf(email))}</div><div class="small text-muted">${h(monthLabel(month))}</div></div></div>
    <div><div class="small text-muted fw-semibold">${md ? "Final (MD override)" : "System score"}</div><div class="score-big ${scoreCls(final)}">${final.toFixed(2)}%</div>${md ? `<div class="small text-muted">System: ${sys.toFixed(2)}%${md[5] ? ` · ${h(md[5])}` : ""}</div>` : ""}</div>
    <div class="flex-grow-1" style="min-width:220px">
      <div class="d-flex justify-content-between small fw-semibold"><span style="color:var(--manual)"><i class="fas fa-pen-to-square me-1"></i>Manual ${mEarned.toFixed(2)} / ${sum(manual, w)}</span><span>${scored}/${manual.length} scored</span></div>
      <div class="bar manual"><span style="width:${Math.min(100, sum(manual, w) ? mEarned / sum(manual, w) * 100 : 0)}%"></span></div>
      <div class="d-flex justify-content-between small fw-semibold mt-2"><span style="color:var(--auto)"><i class="fas fa-gears me-1"></i>Automated ${aEarned.toFixed(2)} / ${sum(auto, w)}</span><span>${auto.length} KPI</span></div>
      <div class="bar auto"><span style="width:${Math.min(100, sum(auto, w) ? aEarned / sum(auto, w) * 100 : 0)}%"></span></div>
    </div>
    ${Math.abs(totalW - 100) > 0.01 ? `<div class="chip chip-amber"><i class="fas fa-triangle-exclamation"></i>Total weightage is ${totalW}% (not 100%)</div>` : ""}
  </div></div>`;

  const manualCards = manual.map(k => {
    const row = manualScoreRow(k, email, month), max = w(k), id = h(k[0]);
    const editing = editable && (!row || u.edit === k[0]);
    const val = row ? parseFloat(row[4]) || 0 : 0;
    return `<div class="kpi-card manual">
      <div class="d-flex justify-content-between gap-2"><div><span class="chip chip-manual mb-1"><i class="fas fa-pen-to-square"></i>Manual</span><div class="kpi-name">${h(k[3])}</div></div>
        <div class="text-end"><div class="kpi-score justify-content-end"><b class="${row ? "" : "text-muted"}">${row ? val.toFixed(2) : "—"}</b><span class="text-muted">/ ${max}</span></div>${row ? `<div class="small-2 text-muted">by ${h(nameOf(row[5]))}</div>` : `<div class="small-2 text-danger fw-semibold">Not scored</div>`}</div></div>
      ${descHtml(k)}${instrHtml(k[6])}
      <div class="bar manual"><span style="width:${max ? Math.min(100, val / max * 100) : 0}%"></span></div>
      ${editing ? `<div class="row g-2 mt-2"><div class="col-4"><input type="number" class="form-control form-control-sm" id="ms_${id}" min="0" max="${max}" step="0.5" value="${row ? h(row[4]) : ""}" placeholder="0-${max}"></div>
        <div class="col-8"><input type="text" class="form-control form-control-sm" id="mr_${id}" value="${row ? h(row[6] || "") : ""}" placeholder="Remarks (optional)"></div>
        <div class="col-12 d-flex gap-2 justify-content-end">${row ? `<button class="btn btn-ghost btn-sm" data-act="msCancel" data-r="${route}">Cancel</button>` : ""}<button class="btn btn-primary btn-sm" style="background:var(--manual);border-color:var(--manual)" data-act="msSave" data-id="${id}" data-email="${h(email)}" data-month="${h(month)}" data-max="${max}"><i class="fas fa-floppy-disk me-1"></i>${row ? "Update" : "Save"} score</button></div></div>`
        : row ? `<div class="d-flex justify-content-between align-items-center mt-2 small"><span class="text-muted">${row[6] ? `<i class="far fa-comment me-1"></i>${h(row[6])}` : ""}</span>${editable ? `<button class="btn btn-ghost btn-xs" data-act="msEdit" data-id="${id}" data-r="${route}"><i class="fas fa-pen me-1"></i>Edit</button>` : ""}</div>` : ""}
    </div>`;
  }).join("");

  const autoCards = auto.map(k => {
    const rows = autoKpiRows(k, email, month), max = w(k), earned = kpiEarnedScore(k, email, month);
    const cnt = c => rows.filter(r => r.cls === c).length;
    const isOpen = u.open === k[0];
    let tasks = "";
    if (isOpen) {
      const f = u.af || "all";
      const list = rows.filter(r => f === "all" || r.cls === f).sort((a, b) => String(b.row[4]).localeCompare(String(a.row[4])));
      tasks = `<div class="kpi-tasks">
        <div class="d-flex flex-wrap gap-2 align-items-center mb-2">${fchips(route + ".af", f, [{ v: "all", l: "All", c: rows.length }, { v: "ontime", l: "On time", c: cnt("ontime") }, { v: "late", l: "Late", c: cnt("late") }, { v: "pending", l: "Pending", c: cnt("pending") }, { v: "rejected", l: "Fake", c: cnt("rejected") }])}</div>
        ${list.length ? `<div class="table-wrap" style="max-height:420px"><table class="tablex compact"><thead><tr><th>Date</th><th>KRA task</th><th>Done on</th><th>Result</th>${canFake ? "<th></th>" : ""}</tr></thead><tbody>
          ${list.map(x => `<tr><td class="kra-row-date">${fmtD(x.row[4])}</td><td><div class="fw-semibold">${h(x.row[3])}</div>${x.row[7] ? `<div class="small-2 text-muted">${linkify(x.row[7])}</div>` : ""}${x.row[6] ? `<a class="small-2" href="${safeUrl(x.row[6])}" target="_blank" rel="noopener"><i class="fas fa-paperclip me-1"></i>File</a>` : ""}</td>
            <td class="kra-row-date">${x.row[8] ? fmtDT(x.row[8]) : "—"}</td><td><span class="chip ${AUTO_CLS[x.cls][0]}">${AUTO_CLS[x.cls][1]}</span></td>
            ${canFake ? `<td class="text-end">${x.row[5] === "Done" ? `<button class="btn btn-danger-soft btn-xs" data-act="fakeKra" data-id="${h(x.row[0])}"><i class="fas fa-ban me-1"></i>Mark fake</button>` : ""}</td>` : ""}</tr>`).join("")}
        </tbody></table></div>` : empty("No KRA tasks for this filter", "filter")}</div>`;
    }
    return `<div class="kpi-card auto ${isOpen ? "open" : ""}">
      <div class="d-flex justify-content-between gap-2 collapse-head" data-act="autoToggle" data-id="${h(k[0])}" data-r="${route}">
        <div><span class="chip chip-auto mb-1"><i class="fas fa-gears"></i>Automated</span><div class="kpi-name">${h(k[3])}</div></div>
        <div class="text-end"><div class="kpi-score justify-content-end"><b>${earned.toFixed(2)}</b><span class="text-muted">/ ${max}</span></div><div class="small-2 text-muted">${rows.length} KRA task${rows.length === 1 ? "" : "s"}</div></div></div>
      ${descHtml(k)}
      <div class="bar auto"><span style="width:${max ? Math.min(100, Math.max(0, earned / max * 100)) : 0}%"></span></div>
      <div class="mini-stats"><span class="chip chip-green">${cnt("ontime")} on time</span><span class="chip chip-amber">${cnt("late")} late</span><span class="chip chip-slate">${cnt("pending")} pending</span>${cnt("rejected") ? `<span class="chip chip-red">${cnt("rejected")} fake</span>` : ""}
        <button class="btn btn-ghost btn-xs ms-auto" data-act="autoToggle" data-id="${h(k[0])}" data-r="${route}">${isOpen ? '<i class="fas fa-chevron-up me-1"></i>Hide tasks' : '<i class="fas fa-list me-1"></i>View tasks'}</button></div>
      ${tasks}
    </div>`;
  }).join("");

  return summary +
    (manual.length ? `<div class="kpi-part manual"><div class="kpi-part-head"><h3><i class="fas fa-pen-to-square me-2"></i>Manual KPIs</h3><span class="small text-muted">Scored by HOD / HR every month</span><span class="ms-auto chip chip-manual">${mEarned.toFixed(2)} / ${sum(manual, w)}</span></div><div class="kpi-grid">${manualCards}</div></div>` : "") +
    (auto.length ? `<div class="kpi-part auto"><div class="kpi-part-head"><h3><i class="fas fa-gears me-2"></i>Automated KPIs</h3><span class="small text-muted">Calculated from KRA tasks: on time = 1, late = ½, fake = −1</span><span class="ms-auto chip chip-auto">${aEarned.toFixed(2)} / ${sum(auto, w)}</span></div><div class="kpi-grid">${autoCards}</div></div>` : "") +
    (other.length ? `<div class="kpi-part"><div class="kpi-part-head"><h3>Other KPIs (type not recognised — counted as 0)</h3></div><div class="kpi-grid">${other.map(k => `<div class="kpi-card"><div class="kpi-name">${h(k[3])}</div><div class="small text-muted">Scoring_Type: "${h(k[5])}" · weight ${w(k)}</div></div>`).join("")}</div></div>` : "");
}
ACT.autoToggle = el => { const u = ui(el.dataset.r); u.open = u.open === el.dataset.id ? "" : el.dataset.id; u.af = "all"; rerender(true); };
ACT.msEdit = el => { ui(el.dataset.r).edit = el.dataset.id; rerender(true); };
ACT.msCancel = el => { ui(el.dataset.r).edit = ""; rerender(true); };
ACT.msSave = async el => {
  const id = el.dataset.id, max = Number(el.dataset.max);
  const score = parseFloat($("#ms_" + CSS.escape(id)).value), remarks = $("#mr_" + CSS.escape(id)).value.trim();
  if (isNaN(score) || score < 0 || score > max) return toast(`Enter a score between 0 and ${max}.`, "warn");
  el.disabled = true; el.innerHTML = '<span class="spinner-border me-1"></span>Saving';
  try {
    const form = { monthYear: el.dataset.month, email: el.dataset.email, kpiId: id, score, remarks };
    await api("manualScore", { form });
    const ex = (S.data.manualScores || []).find(s => ek(s[2]) === ek(form.email) && s[1] === form.monthYear && String(s[3]) === id);
    if (ex) { ex[4] = String(score); ex[5] = S.user.email; ex[6] = remarks; } else S.data.manualScores.push(["LOCAL", form.monthYear, form.email, id, String(score), S.user.email, remarks]);
    ui(S.route).edit = "";
    afterAction("Score saved.");
  } catch (e) { toast(e.message, "err"); el.disabled = false; el.textContent = "Save score"; }
};

// ================= TEAM EVALUATION =================
VIEWS.evaluation = {
  title: "Team Evaluation", icon: "scale-balanced", team: true,
  render(p) {
    const u = ui("evaluation");
    if (p.emp) { u.emp = p.emp; delete p.emp; } if (p.month) { u.month = p.month; delete p.month; }
    u.month = u.month || S.data.today.slice(0, 7);
    const people = (isAdmin() ? (S.data.users || []).filter(x => x.active) : teamUsers()).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (!u.emp && people.length) u.emp = ek(people.find(x => S.idx.team.has(ek(x.email)))?.email || people[0].email);
    const controls = `<div class="toolbar">
      <div class="grow"><label class="form-label">Employee</label><select class="form-select" data-change="ui" data-k="evaluation.emp">${people.map(x => `<option value="${h(ek(x.email))}" ${ek(x.email) === u.emp ? "selected" : ""}>${h(x.name)} · ${h(x.dept || x.role)}</option>`).join("")}</select></div>
      <div><label class="form-label">Month</label><input type="month" class="form-control" value="${h(u.month)}" data-change="ui" data-k="evaluation.month"></div>
      <div class="legend pb-2"><span class="chip chip-manual">Manual</span><span class="chip chip-auto">Automated</span></div></div>`;
    if (!u.emp) return controls + empty("No team members", "users-slash");
    const [rf, rt] = monthRange(u.month);
    return controls + scoreTiles(workStats(u.emp, rf, rt < S.data.today ? rt : S.data.today), "Work score · " + monthLabel(u.month)) +
      kpiBoard(u.emp, u.month, { editable: true, route: "evaluation" }) + evalTasksPanel(u.emp, u.month);
  }
};
function evalTasksPanel(email, month) {
  const u = ui("evaluation"); u.tf = u.tf || "all";
  const inMonth = t => monthKeyOf(t[4] || t[9]) === month || monthKeyOf(t[12]) === month;
  const list = (S.idx.taskIn.get(email) || []).filter(inMonth);
  const groups = { approved: list.filter(t => t[6] === "Approved"), open: list.filter(t => workIsOpen(t[6]) && !isAwaiting(t[6])), awaiting: list.filter(t => isAwaiting(t[6])), rejected: list.filter(t => t[6] === "Rejected") };
  const shown = u.tf === "all" ? list : groups[u.tf];
  const late = t => { const due = parseLocal(t[4]); if (!due || !t[11]) return false; due.setHours(23, 59, 59, 999); return parseLocal(t[11]) > due; };
  return `<div class="cardx mb-3"><div class="cardx-head"><h3><i class="fas fa-list-check text-brand me-2"></i>Delegation tasks · ${h(monthLabel(month))}</h3><span class="small text-muted">Used in the Performance Scoreboard, not in the KPI score</span></div>
    <div class="cardx-body">${fchips("evaluation.tf", u.tf, [{ v: "all", l: "All", c: list.length }, { v: "approved", l: "Approved", c: groups.approved.length }, { v: "open", l: "Pending", c: groups.open.length }, { v: "awaiting", l: "Awaiting", c: groups.awaiting.length }, { v: "rejected", l: "Fake", c: groups.rejected.length }])}
    ${shown.length ? `<div class="table-wrap mt-3"><table class="tablex compact"><thead><tr><th>Task</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${sortTasks(shown.slice(), "due").map(t => `<tr>
      <td><a href="#" data-act="openTask" data-id="${h(t[0])}" class="fw-semibold text-reset clamp2" title="${h(t[3])}">${h(t[3])}</a><div class="small-2 text-muted">By ${h(nameOf(t[1]))}</div></td>
      <td class="kra-row-date">${fmtD(t[4])}</td><td>${statusChip(t[6])}${t[6] === "Approved" && late(t) ? ' <span class="chip chip-amber">Late</span>' : ""}</td>
      <td class="text-end"><div class="row-actions"><button class="btn btn-ghost btn-xs" data-act="openTask" data-id="${h(t[0])}"><i class="far fa-comments me-1"></i>History</button>${t[6] === "Approved" ? `<button class="btn btn-danger-soft btn-xs" data-act="fakeTask" data-id="${h(t[0])}"><i class="fas fa-ban me-1"></i>Mark fake</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>` : `<div class="mt-3">${empty("No delegation tasks in this period", "list-check")}</div>`}
    </div></div>`;
}

// ================= KPI MATRIX =================
function fyOptions() {
  const now = Number(S.data.today.slice(0, 4)), m = Number(S.data.today.slice(5, 7));
  const cur = m >= 4 ? now : now - 1, list = [];
  for (let y = Math.min(2025, cur); y <= cur + 1; y++) list.push(`${y}-${y + 1}`);
  return { list, cur: `${cur}-${cur + 1}` };
}
VIEWS.kpi = {
  title: "KPI Matrix", icon: "table-cells", team: true,
  render() {
    const u = ui("kpi"); u.view = u.view || "monthly"; u.month = u.month || S.data.today.slice(0, 7); u.emp = u.emp || "all";
    const fy = fyOptions(); u.fy = u.fy || fy.cur;
    let users = teamUsers(); if (u.emp !== "all") users = users.filter(x => ek(x.email) === u.emp);
    users = searchFilter(users, u.q, x => x.name + " " + x.email + " " + x.dept);
    const controls = `<div class="toolbar">
      ${seg("kpi.view", u.view, [{ v: "monthly", l: "Monthly" }, { v: "fy", l: "Financial year" }])}
      ${u.view === "monthly" ? `<input type="month" class="form-control w-auto" value="${h(u.month)}" data-change="ui" data-k="kpi.month">` : `<select class="form-select w-auto" data-change="ui" data-k="kpi.fy">${fy.list.map(f => `<option ${f === u.fy ? "selected" : ""} value="${f}">FY ${f}</option>`).join("")}</select>`}
      <select class="form-select w-auto" data-change="ui" data-k="kpi.emp"><option value="all">All team members</option>${teamUsers().map(x => `<option value="${h(ek(x.email))}" ${ek(x.email) === u.emp ? "selected" : ""}>${h(x.name)}</option>`).join("")}</select>
      <input type="search" class="form-control" style="max-width:200px" placeholder="Search…" value="${h(u.q || "")}" data-input="uisearch" data-k="kpi.q">
      <div class="grow"></div>
      <div class="legend"><span class="chip chip-manual">Manual</span><span class="chip chip-auto">Automated</span><span><span class="dot g"></span> ≥80%</span><span><span class="dot y"></span> 50–80%</span><span><span class="dot r"></span> &lt;50%</span></div></div>`;
    if (!teamUsers().length) return controls + empty("No team assigned to you", "users-slash");
    if (u.view === "fy") {
      const [sy, ey] = u.fy.split("-"); const months = [];
      for (let m = 4; m <= 12; m++) months.push(`${sy}-${String(m).padStart(2, "0")}`);
      for (let m = 1; m <= 3; m++) months.push(`${ey}-${String(m).padStart(2, "0")}`);
      return controls + `<div class="table-wrap"><table class="tablex"><thead><tr><th>Employee</th>${months.map(m => `<th class="text-center">${MONTHS[Number(m.slice(5)) - 1]}</th>`).join("")}<th class="text-center">FY avg</th></tr></thead><tbody>
        ${users.map(x => { let tot = 0, n = 0; const cells = months.map(m => { const s = finalMonthly(x.email, m).final; if (s > 0) { tot += s; n++; } return `<td class="text-center mono ${s > 0 ? scoreCls(s) : "text-muted"}">${s > 0 ? s.toFixed(0) : "–"}</td>`; }).join(""); const avg = n ? tot / n : 0;
          return `<tr><td>${person(x.email)}</td>${cells}<td class="text-center"><b class="${scoreCls(avg)}">${avg.toFixed(2)}%</b></td></tr>`; }).join("")}
        </tbody></table></div><div class="small text-muted mt-2">FY average = average of months that have a score (MD override used where set).</div>`;
    }
    return controls + `<div class="work-list">${users.map(x => {
      const email = ek(x.email), { sys, md, final } = finalMonthly(email, u.month);
      const kp = userKPIs(email);
      const chips = kp.map(k => { const t = kpiType(k), e = kpiEarnedScore(k, email, u.month), mx = parseFloat(k[4]) || 0;
        return `<div class="kchip ${t}"><span class="kn">${scoreDot(e, mx)}${t === "manual" ? '<i class="fas fa-pen-to-square"></i>' : t === "auto" ? '<i class="fas fa-gears"></i>' : ""}${h(k[3])}</span><span><span class="kv">${e.toFixed(2)}</span> <span class="text-muted">/ ${mx}</span>${t === "manual" && !manualScoreRow(k, email, u.month) ? ' <span class="text-danger fw-semibold">· not scored</span>' : ""}</span></div>`; }).join("");
      return `<div class="cardx"><div class="cardx-body d-flex flex-column flex-lg-row gap-3">
        <div style="min-width:220px">${person(email, "")}<div class="small text-muted mt-1">${h(x.dept || "")}</div>
          <div class="mt-2"><span class="score-big ${scoreCls(final)}" style="font-size:2rem">${final.toFixed(2)}%</span><div class="small text-muted">${md ? `MD override · system ${sys.toFixed(2)}%` : "System score"}</div></div>
          <div class="d-flex gap-2 mt-2 flex-wrap"><a class="btn btn-soft btn-sm" href="#/evaluation?emp=${encodeURIComponent(email)}&month=${u.month}"><i class="fas fa-scale-balanced me-1"></i>Evaluate</a>${isAdmin() ? `<button class="btn btn-ghost btn-sm" data-act="mdScore" data-email="${h(email)}" data-month="${h(u.month)}" data-sys="${sys.toFixed(2)}"><i class="fas fa-crown me-1 text-warning"></i>MD score</button>` : ""}</div></div>
        <div class="d-flex flex-wrap gap-2 align-content-start flex-grow-1">${chips || '<span class="text-muted small">No KPIs mapped.</span>'}</div>
      </div></div>`;
    }).join("") || empty("No data found", "user-slash")}</div>`;
  }
};
ACT.mdScore = el => {
  const email = el.dataset.email, month = el.dataset.month, sys = el.dataset.sys, row = mdRow(email, month);
  dialog({
    title: '<i class="fas fa-crown text-warning me-2"></i>MD score override', submit: "Save override", submitClass: "btn-dark",
    body: `<div class="info-box mb-3">${person(email)}<div class="small mt-2">${h(monthLabel(month))} · System score <b>${sys}%</b></div></div>
      <label class="form-label">Final MD score (%) *</label><input type="number" class="form-control" name="md" min="0" max="100" step="0.01" value="${h(row ? row[4] : sys)}" required>
      <label class="form-label mt-3">Remarks</label><textarea class="form-control" name="remarks" rows="2">${h(row ? row[5] : "")}</textarea>`,
    onSubmit: async f => {
      const md = parseFloat(formVal(f, "md")); need(!isNaN(md) && md >= 0 && md <= 100, "Enter a score between 0 and 100.");
      const remarks = formVal(f, "remarks");
      await api("mdScore", { form: { monthYear: month, email, sysScore: sys, mdScore: md, remarks } });
      if (row) { row[4] = String(md); row[5] = remarks; } else S.data.mdScores.push(["LOCAL", month, email, sys, String(md), remarks, nowStamp()]);
      afterAction("MD score saved.");
    }
  });
};
