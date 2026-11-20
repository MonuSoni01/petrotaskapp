/* ============ Reports: printable performance report (notice board) ============ */
function reportPeople() {
  const list = teamUsers();
  return list.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
function reportPeriod(u) {
  if (u.mode === "all") return { from: "", to: S.data.today, label: "All time (till " + fmtD(S.data.today) + ")", month: "" };
  if (u.mode === "custom") {
    const from = u.from || S.data.today.slice(0, 8) + "01", to = u.to || S.data.today;
    return { from, to, label: fmtD(from) + " – " + fmtD(to), month: "" };
  }
  const [from, end] = monthRange(u.month);
  return { from, to: end < S.data.today ? end : S.data.today, label: monthLabel(u.month), month: u.month };
}
function reportRows(u, p) {
  let people = reportPeople();
  if (u.dept && u.dept !== "all") people = people.filter(x => x.dept === u.dept);
  if (u.emp && u.emp !== "all") people = people.filter(x => ek(x.email) === u.emp);
  const rows = people.map(x => { const email = ek(x.email), sc = fullScore(email, p.from, p.to); return { x, email, sc, st: sc.st, kpi: sc.kpi }; })
    .filter(r => u.showEmpty === "yes" || r.st.all.total > 0 || r.kpi != null);
  const key = u.sort || "final";
  const val = r => ({ final: r.sc.final, completion: r.sc.completion, ontime: r.sc.ontime, kpi: r.sc.kpi }[key] ?? -999);
  rows.sort((a, b) => key === "name" ? String(a.x.name).localeCompare(String(b.x.name)) : val(b) - val(a));
  return rows;
}
function badge(v) {
  if (v == null) return `<span class="rb rb-na">—</span>`;
  const c = v >= 80 ? "rb-g" : v >= 60 ? "rb-y" : "rb-r";
  return `<span class="rb ${c}">${pctTxt(v)}</span>`;
}

VIEWS.reports = {
  title: "Reports", icon: "file-lines", team: true,
  render() {
    const u = ui("reports");
    u.mode = u.mode || "month"; u.month = u.month || S.data.today.slice(0, 7); u.emp = u.emp || "all"; u.dept = u.dept || "all"; u.sort = u.sort || "final"; u.showEmpty = u.showEmpty || "no";
    const people = reportPeople();
    const depts = [...new Set(people.map(x => x.dept).filter(Boolean))].sort();
    const p = reportPeriod(u);
    const controls = `<div class="toolbar no-print">
      ${seg("reports.mode", u.mode, [{ v: "month", l: "Month" }, { v: "custom", l: "Custom dates" }, { v: "all", l: "All time" }])}
      ${u.mode === "all" ? "" : u.mode === "month" ? `<input type="month" class="form-control w-auto" value="${h(u.month)}" data-change="ui" data-k="reports.month">`
        : `<input type="date" class="form-control w-auto" value="${h(u.from || "")}" data-change="ui" data-k="reports.from" aria-label="From"><input type="date" class="form-control w-auto" value="${h(u.to || "")}" data-change="ui" data-k="reports.to" aria-label="To">`}
      <select class="form-select w-auto" data-change="ui" data-k="reports.dept"><option value="all">All departments</option>${depts.map(d => `<option ${d === u.dept ? "selected" : ""}>${h(d)}</option>`).join("")}</select>
      <select class="form-select w-auto" data-change="ui" data-k="reports.emp"><option value="all">Whole team (${people.length})</option>${people.map(x => `<option value="${h(ek(x.email))}" ${ek(x.email) === u.emp ? "selected" : ""}>${h(x.name)}</option>`).join("")}</select>
      <select class="form-select w-auto" data-change="ui" data-k="reports.sort">${[["final", "Rank by Final score"], ["completion", "Rank by completion"], ["ontime", "Rank by on-time"], ["kpi", "Rank by KPI score"], ["name", "Sort by name"]].map(([v, l]) => `<option value="${v}" ${u.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select class="form-select w-auto" data-change="ui" data-k="reports.sugg"><option value="on" ${u.sugg !== "off" ? "selected" : ""}>With suggestions</option><option value="off" ${u.sugg === "off" ? "selected" : ""}>Without suggestions</option></select>
      ${resetBtn("reports")}<div class="grow"></div>
      <button class="btn btn-ghost" data-act="reportCsv"><i class="fas fa-file-excel me-1 text-success"></i>Download Excel</button>
      <button class="btn btn-brand" data-act="reportPrint"><i class="fas fa-print me-1"></i>Print / Save PDF</button></div>`;
    return controls + (u.emp !== "all" ? personReport(u.emp, p) : teamReport(u, p));
  }
};

function reportHead(title, p) {
  return `<div class="rp-head"><img src="${h(CFG.LOGO || "")}" alt="" onerror="this.style.display='none'">
    <div class="flex-grow-1"><div class="rp-title">${h(title)}</div><div class="rp-sub">Period: <b>${h(p.label)}</b> · Generated ${fmtD(S.data.today)} by ${h(S.user.name)}</div></div>
    <div class="rp-brand">${h(CFG.COMPANY || "")}<br><span>TaskMaster</span></div></div>`;
}
const RP_LEGEND = `<div class="rp-legend"><b>Delegation / KRA / Tickets score</b> = (on time × 1 + late × ½ − fake × 1) ÷ total due × 100. <b>Completion</b> = done ÷ due. <b>On-time</b> = done on/before deadline ÷ done. <b>KPI</b> = Automated KPIs (from KRA) + Manual KPIs (HOD/HR); MD score replaces it when set; for many months = average. <b>Final score</b> = average of Delegation, KRA, Tickets and KPI scores.</div>`;

function teamReport(u, p) {
  const rows = reportRows(u, p);
  if (!rows.length) return empty("No work in this period", "file-lines");
  const sum = { total: 0, done: 0, onTime: 0, fake: 0 };
  rows.forEach(r => { sum.total += r.st.all.total; sum.done += r.st.all.done; sum.onTime += r.st.all.onTime; sum.fake += r.st.all.fake; });
  const avg = arr => { const v = arr.filter(x => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; };
  const comp = sum.total ? Math.round(sum.done / sum.total * 1000) / 10 : null, ont = sum.done ? Math.round(sum.onTime / sum.done * 1000) / 10 : null;
  const fin = avg(rows.map(r => r.sc.final)), kp = avg(rows.map(r => r.sc.kpi));
  const sortVal = r => ({ final: r.sc.final, completion: r.sc.completion, ontime: r.sc.ontime, kpi: r.sc.kpi }[u.sort]);
  const top = rows.filter(r => sortVal(r) != null).slice(0, 3);
  return `<div class="report" id="reportDoc">${reportHead("Team Performance Report", p)}
    <div class="rp-tiles">
      <div><span>Team completion</span><b class="${pctCls(comp)}">${pctTxt(comp)}</b><small>${sum.done} of ${sum.total} done</small></div>
      <div><span>Team on-time</span><b class="${pctCls(ont)}">${pctTxt(ont)}</b></div>
      <div><span>Avg KPI score</span><b class="${pctCls(kp)}">${pctTxt(kp)}</b></div>
      <div class="rp-final"><span>Avg final score</span><b>${pctTxt(fin)}</b></div>
      <div><span>People · Fake</span><b>${rows.length} · <span class="${sum.fake ? "text-danger" : ""}">${sum.fake}</span></b></div>
    </div>
    ${top.length && u.sort !== "name" ? `<div class="rp-podium">${top.map((r, i) => `<div class="pod p${i + 1}"><div class="pod-rank">${["🥇", "🥈", "🥉"][i]}</div><div class="pod-name">${h(r.x.name)}</div><div class="pod-v">${pctTxt(sortVal(r))}</div></div>`).join("")}</div>` : ""}
    <table class="rp-table sc-table"><thead><tr><th>#</th><th>Employee</th><th>Department</th>${scoreHeaderCells()}</tr></thead>
    <tbody>${rows.map((r, i) => { const sg = scoreSuggestions(r.sc);
      return `<tr class="rp-main"><td>${i + 1}</td><td class="fw-semibold">${h(r.x.name)}</td><td>${h(r.x.dept || "")}</td>${scoreRowCells(r.sc)}</tr>
      ${u.sugg !== "off" ? `<tr class="rp-sugg"><td></td><td colspan="10">${sg.length ? `<i class="fas fa-lightbulb"></i> <b>Focus:</b> ${sg.map(x => `<span class="sg"><b>${h(x.area)}${x.lost ? ` (−${x.lost})` : ""}</b> ${h(x.text)}</span>`).join("")}` : r.sc.final != null ? '<i class="fas fa-circle-check text-success"></i> Strong performance — keep it up.' : ""}</td></tr>` : ""}`; }).join("")}</tbody></table>
    ${RP_LEGEND}
    <div class="rp-sign"><div>Prepared by</div><div>HOD</div><div>Managing Director</div></div>
  </div>`;
}

function personReport(email, p) {
  const sc = fullScore(email, p.from, p.to), st = sc.st, user = S.idx.users.get(email) || {};
  const kpis = p.month ? userKPIs(email) : [];
  const fm = p.month ? finalMonthly(email, p.month) : null;
  const block = (n, b) => `<div><span>${n}</span><b>${b.total ? `${b.done}/${b.total}` : "—"}</b><small>Completion ${pctTxt(b.completion)} · On-time ${pctTxt(b.ontime)}</small></div>`;
  // open / late items for the period
  const inR = k => k && k >= p.from && k <= p.to;
  const items = [];
  (S.idx.taskIn.get(email) || []).forEach(t => { const due = d10(t[4]) || d10(t[9]); if (!inR(due)) return; const late = t[6] === "Approved" && d10(t[4]) && (d10(t[11]) || d10(t[12])) > d10(t[4]);
    if (workIsOpen(t[6]) && due <= S.data.today) items.push(["Delegation", t[3], due, t[6] === "Submitted" ? "Awaiting approval" : "Not done"]); else if (late) items.push(["Delegation", t[3], due, "Late"]); else if (t[6] === "Rejected") items.push(["Delegation", t[3], due, "Fake"]); });
  (S.idx.kraIn.get(email) || []).forEach(k => { const day = d10(k[4]); if (!inR(day)) return;
    if (workIsOpen(k[5]) && day <= S.data.today) items.push(["KRA", k[3], day, "Not done"]); else if (k[5] === "Done" && d10(k[8]) > day) items.push(["KRA", k[3], day, "Late"]); else if (k[5] === "Rejected") items.push(["KRA", k[3], day, "Fake"]); });
  (S.idx.ticketIn.get(email) || []).forEach(t => { const due = d10(t[11]) || d10(t[5]); if (!inR(due)) return;
    if (workIsOpen(t[6]) && due <= S.data.today) items.push(["Ticket", t[4], due, "Not resolved"]); else if (t[6] === "Closed" && d10(t[11]) && d10(t[10]) > d10(t[11])) items.push(["Ticket", t[4], due, "Late"]); });
  items.sort((a, b) => String(b[2]).localeCompare(String(a[2])));
  return `<div class="report" id="reportDoc">${reportHead("Individual Performance Report", p)}
    <div class="rp-person">${avatar(email, "lg")}<div><div class="fw-bold fs-5">${h(nameOf(email))}</div><div class="text-muted small">${h(user.role || "")} · ${h(user.dept || "")} · ${h(email)}</div></div>
      <div class="ms-auto rp-big rp-final"><span>Final score</span><b>${pctTxt(sc.final)}</b></div></div>
    ${scoreChain(sc, { compact: true })}
    ${kpis.length ? `<h4 class="rp-h">KPI breakdown · ${h(monthLabel(p.month))}</h4><table class="rp-table"><thead><tr><th>KPI</th><th>Type</th><th>Weight</th><th>Earned</th><th>Remarks</th></tr></thead><tbody>
      ${kpis.map(k => { const t = kpiType(k), e = kpiEarnedScore(k, email, p.month), r = t === "manual" ? manualScoreRow(k, email, p.month) : null;
        return `<tr><td class="fw-semibold">${h(k[3])}</td><td><span class="rb ${t === "manual" ? "rb-m" : "rb-a"}">${t === "manual" ? "Manual" : t === "auto" ? "Automated" : h(k[5])}</span></td><td class="mono">${h(k[4])}</td><td class="mono fw-bold">${e.toFixed(2)}</td><td class="small">${t === "manual" ? (r ? h(r[6] || "") : '<span class="text-danger">Not scored</span>') : ""}</td></tr>`; }).join("")}
      ${(() => { const kb = kpiBreakdown(email, p.month); return `<tr class="rp-sub"><td colspan="3">Automated KPIs (from KRA)</td><td class="mono">${kb.auto.toFixed(2)} / ${kb.autoMax}</td><td></td></tr>
        <tr class="rp-sub"><td colspan="3">Manual KPIs (HOD / HR)</td><td class="mono">${kb.manual.toFixed(2)} / ${kb.manualMax}</td><td class="small">${kb.scored}/${kb.manualCount} scored</td></tr>
        <tr class="rp-total"><td colspan="3">KPI score = Auto + Manual${kb.md != null ? " → MD final" : ""}</td><td class="mono">${kb.kpi.toFixed(2)}%</td><td class="small">${kb.md != null ? "System " + kb.sys.toFixed(2) + "%" : ""}</td></tr>`; })()}</tbody></table>` : ""}
    ${(() => { const sg = scoreSuggestions(sc); return `<h4 class="rp-h"><i class="fas fa-lightbulb text-warning me-1"></i>Suggestions to improve the score</h4>
      ${sg.length ? `<table class="rp-table"><thead><tr><th>Area</th><th>Points lost in Final</th><th>What to improve</th></tr></thead><tbody>${sg.map(x => `<tr><td class="fw-bold">${h(x.area)}</td><td class="mono">${x.lost ? "−" + x.lost : "—"}</td><td>${h(x.text)}</td></tr>`).join("")}</tbody></table>` : `<div class="text-success fw-semibold mb-2">${sc.final != null ? "Strong performance in all areas — keep it up. 🎉" : "No data in this period."}</div>`}`; })()}
    <h4 class="rp-h">Needs attention (${items.length})</h4>
    ${items.length ? `<table class="rp-table"><thead><tr><th>Type</th><th>Work</th><th>Date</th><th>Result</th></tr></thead><tbody>${items.slice(0, 40).map(i => `<tr><td>${i[0]}</td><td>${h(String(i[1]).slice(0, 140))}</td><td class="mono">${fmtD(i[2])}</td><td><span class="rb ${i[3] === "Late" ? "rb-y" : "rb-r"}">${i[3]}</span></td></tr>`).join("")}</tbody></table>${items.length > 40 ? `<div class="small text-muted">+${items.length - 40} more</div>` : ""}` : st.all.total ? `<div class="text-success fw-semibold">Everything in this period was completed on time. 🎉</div>` : `<div class="text-muted fw-semibold">No work was due in this period.</div>`}
    ${RP_LEGEND}
    <div class="rp-sign"><div>Employee</div><div>HOD</div><div>Managing Director</div></div>
  </div>`;
}

ACT.reportPrint = () => {
  const p = reportPeriod(ui("reports"));
  const old = document.title; document.title = "Performance Report " + p.label;
  window.print();
  setTimeout(() => { document.title = old; }, 500);
};
ACT.reportCsv = () => {
  const u = ui("reports"), p = reportPeriod(u);
  const q = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const head = ["Delegation done", "Delegation total", "Delegation score %", "KRA done", "KRA total", "KRA score %", "Tickets done", "Tickets total", "Tickets score %", "Completion %", "On-time %", "KPI auto", "KPI manual", "KPI score %", "Final score %", "Suggestion"];
  const cells = sc => [sc.st.task.done, sc.st.task.total, sc.del ?? "", sc.st.kra.done, sc.st.kra.total, sc.kra ?? "", sc.st.ticket.done, sc.st.ticket.total, sc.tck ?? "", sc.completion ?? "", sc.ontime ?? "",
    sc.kb ? sc.kb.auto.toFixed(2) : "", sc.kb ? sc.kb.manual.toFixed(2) : "", sc.kpi == null ? "" : Number(sc.kpi).toFixed(2), sc.final ?? "", suggestionText(sc)];
  let lines;
  if (u.emp !== "all") {
    const sc = fullScore(u.emp, p.from, p.to);
    lines = [["Employee", nameOf(u.emp)], ["Period", p.label], [], head, cells(sc)];
    if (p.month) { lines.push([], ["KPI", "Type", "Weight", "Earned"]); userKPIs(u.emp).forEach(k => lines.push([k[3], k[5], k[4], kpiEarnedScore(k, u.emp, p.month).toFixed(2)])); }
  } else {
    lines = [["Team Performance Report", p.label], [], ["Rank", "Employee", "Email", "Department", ...head],
      ...reportRows(u, p).map((r, i) => [i + 1, r.x.name, r.email, r.x.dept, ...cells(r.sc)])];
  }
  const blob = new Blob(["﻿" + lines.map(l => l.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `Performance_${(u.emp !== "all" ? nameOf(u.emp) + "_" : "Team_") + p.label.replace(/[^\w]+/g, "_")}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  toast("Excel file downloaded.");
};
