/* ============ my work: home, tasks, KRA, tickets, scorecard ============ */
const VIEWS = {};

// ---------- reusable task card ----------
function taskCard(t, { showTo = false, actions = true } = {}) {
  const st = t[6], open = workIsOpen(st);
  const accent = st === "Approved" ? "a-green" : st === "Rejected" ? "a-red" : st === "Submitted" ? "a-violet" : st === "Extension Requested" ? "a-orange" :
    (d10(t[4]) && d10(t[4]) < S.data.today) || st === "Reopened" ? "a-red" : "a-amber";
  const last = lastEventPreview(t);
  const mine = ek(t[2]) === me();
  let btns = "";
  if (actions) {
    if (mine && open && st !== "Submitted" && st !== "Extension Requested") btns = `<button class="btn btn-ghost btn-sm" data-act="extReq" data-id="${h(t[0])}"><i class="fas fa-calendar-plus me-1"></i>Extension</button><button class="btn btn-brand btn-sm" data-act="submitTask" data-id="${h(t[0])}"><i class="fas fa-paper-plane me-1"></i>Submit</button>`;
    else if (canApprove(t) && st === "Submitted") btns = `<button class="btn btn-danger-soft btn-sm" data-act="rejectTask" data-id="${h(t[0])}"><i class="fas fa-ban me-1"></i>Reject</button><button class="btn btn-ghost btn-sm" data-act="reopenTask" data-id="${h(t[0])}"><i class="fas fa-rotate-left me-1"></i>Reopen</button><button class="btn btn-success btn-sm" data-act="approveTask" data-id="${h(t[0])}"><i class="fas fa-check me-1"></i>Approve</button>`;
    else if (canApprove(t) && st === "Extension Requested") btns = `<button class="btn btn-danger-soft btn-sm" data-act="extDecide" data-d="reject" data-id="${h(t[0])}">Reject</button><button class="btn btn-success btn-sm" data-act="extDecide" data-d="approve" data-id="${h(t[0])}">Accept extension</button>`;
  }
  return `<div class="wcard click ${accent}" data-act="openTask" data-id="${h(t[0])}">
    <div class="wcard-top">${statusChip(st)}${prioChip(t[5])}${dueInfo(t[4], open && !isAwaiting(st))}</div>
    <div class="wcard-title">${h(t[3])}</div>
    <div class="wcard-meta">
      <span>${showTo ? `<i class="fas fa-arrow-right"></i>To ${h(nameOf(t[2]))}` : `<i class="fas fa-user-tie"></i>By ${h(nameOf(t[1]))}`}</span>
      <span><i class="far fa-calendar-plus"></i>${fmtD(t[9])}</span>
      ${!open && t[12] ? `<span><i class="fas fa-check-double"></i>Closed ${fmtD(t[12])}</span>` : `<span><i class="far fa-calendar"></i>Due ${fmtD(t[4])}</span>`}
      ${t[10] ? `<span><i class="fas fa-paperclip"></i>File</span>` : ""}
    </div>
    ${last ? `<div class="wcard-last"><i class="far fa-comment-dots mt-1"></i><span>${h(last)}</span></div>` : ""}
    ${btns ? `<div class="wcard-actions">${btns}</div>` : ""}
  </div>`;
}
function sortTasks(list, sort) {
  const due = t => d10(t[4]) || "9999";
  if (sort === "new") return list.sort((a, b) => String(b[9]).localeCompare(String(a[9])));
  if (sort === "old") return list.sort((a, b) => String(a[9]).localeCompare(String(b[9])));
  if (sort === "closed") return list.sort((a, b) => String(b[12] || b[9]).localeCompare(String(a[12] || a[9])));
  return list.sort((a, b) => due(a).localeCompare(due(b)));
}
function searchFilter(list, q, text) { q = ek(q); return q ? list.filter(r => ek(text(r)).includes(q)) : list; }
function statCard(icon, tone, value, label, sub, href) {
  return `<a class="stat" href="${href}"><span class="stat-ic tone-${tone}"><i class="fas fa-${icon}"></i></span><span><div class="stat-v">${value}</div><div class="stat-l">${h(label)}</div>${sub ? `<div class="stat-s">${sub}</div>` : ""}</span></a>`;
}

// ---------- counts used by nav badges ----------
function myCounts() {
  const email = me();
  const tasks = S.idx.taskIn.get(email) || [];
  const pending = tasks.filter(t => workIsOpen(t[6]) && !isAwaiting(t[6]));
  const overdue = pending.filter(t => d10(t[4]) && d10(t[4]) < S.data.today);
  const awaiting = tasks.filter(t => isAwaiting(t[6]));
  const kra = (S.idx.kraIn.get(email) || []).filter(k => !["Done", "Rejected", "Cancelled"].includes(k[5]));
  const tickets = (S.idx.ticketIn.get(email) || []).filter(t => workIsOpen(t[6]));
  return { pending, overdue, awaiting, kra, tickets };
}
function reviewQueue() {
  const mine = me();
  return S.data.tasks.filter(t => isAwaiting(t[6]) && canApprove(t));
}

// ================= HOME =================
VIEWS.home = {
  title: "Home", icon: "house",
  render() {
    const c = myCounts();
    const pct = todayProgress(me());
    const rq = canManage() ? reviewQueue() : [];
    const approvals = rq.filter(t => t[6] === "Submitted"), exts = rq.filter(t => t[6] === "Extension Requested");
    const teamOverdue = canManage() ? S.data.tasks.filter(t => S.idx.down.has(ek(t[2])) && workIsOpen(t[6]) && !isAwaiting(t[6]) && d10(t[4]) && d10(t[4]) < S.data.today) : [];
    const C = 2 * Math.PI * 30;
    const upNext = sortTasks(c.pending.slice(), "due").slice(0, 6);
    const todayKra = c.kra.slice().sort((a, b) => String(a[4]).localeCompare(String(b[4]))).slice(0, 6);
    return `
    <div class="hero">
      <div><h2>${greet()}, ${h(String(S.user.name || "").split(" ")[0])} 👋</h2>
        <p>${fmtD(S.data.today)} · ${c.pending.length} open task${c.pending.length === 1 ? "" : "s"}, ${c.kra.length} KRA${c.kra.length === 1 ? "" : "s"} pending${canManage() ? `, ${rq.length} waiting for your review` : ""}</p></div>
      <div class="d-flex align-items-center gap-3"><div class="ring-l">Today's goal<br><b>Tasks + KRAs done</b></div>
        <div class="ring"><svg width="72" height="72"><circle cx="36" cy="36" r="30" stroke="rgba(255,255,255,.25)" stroke-width="7" fill="none"/><circle cx="36" cy="36" r="30" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C - pct / 100 * C}"/></svg><div class="ring-t">${pct}%</div></div></div>
    </div>
    ${coverBanner()}
    ${homeScoreCard()}
    <div class="list-sep">My work</div>
    <div class="mb-3"><div class="tiles tiles-4">
        ${statCard("list-check", "amber", c.pending.length, "My open tasks", c.overdue.length ? `<span class="text-danger">${c.overdue.length} overdue</span>` : '<span class="text-muted">none overdue</span>', "#/tasks")}
        ${statCard("bullseye", "red", c.kra.length, "KRA pending", c.kra.length ? '<span class="text-muted">tap to finish</span>' : '<span class="text-success">all done</span>', "#/kra")}
        ${statCard("headset", "orange", c.tickets.length, "Tickets to resolve", "", "#/tickets")}
        ${statCard("hourglass-half", "violet", c.awaiting.length, "Waiting for approval", "", "#/tasks?tab=awaiting")}
      </div></div>
    ${canManage() ? (() => {
      const [mf] = monthRange(S.data.today.slice(0, 7)); let td = 0, tt = 0;
      teamUsers().forEach(x => { const w = workStats(ek(x.email), mf, S.data.today).all; td += w.done; tt += w.total; });
      const tc = tt ? Math.round(td / tt * 1000) / 10 : null;
      return `<div class="list-sep">Team</div><div class="tiles tiles-4 mb-3">
        ${statCard("clipboard-check", "green", approvals.length, "Approvals for you", "", "#/approvals")}
        ${statCard("calendar-plus", "orange", exts.length, "Extension requests", "", "#/approvals?tab=ext")}
        ${statCard("triangle-exclamation", "red", teamOverdue.length, "Team overdue tasks", "", "#/delegate?f=overdue")}
        ${statCard("users", "blue", pctTxt(tc), "Team completion", `<span class="text-muted">${td} of ${tt} · this month</span>`, "#/reports")}
      </div>`; })() : ""}
    <div class="row g-3">
      <div class="col-lg-6"><div class="cardx h-100"><div class="cardx-head"><h3><i class="fas fa-bolt text-brand me-2"></i>Up next</h3><a class="ms-auto small fw-semibold" href="#/tasks">All tasks</a></div>
        <div class="cardx-body"><div class="work-list">${upNext.map(t => taskCard(t, { actions: false })).join("") || empty("Nothing pending", "mug-hot", "You're all caught up.")}</div></div></div></div>
      <div class="col-lg-6"><div class="cardx h-100">${canManage() && rq.length ? `
        <div class="cardx-head"><h3><i class="fas fa-clipboard-check text-success me-2"></i>Needs your review</h3><a class="ms-auto small fw-semibold" href="#/approvals">Open approvals</a></div>
        <div class="cardx-body"><div class="work-list">${rq.slice(0, 6).map(t => taskCard(t, { showTo: true })).join("")}</div></div>` : `
        <div class="cardx-head"><h3><i class="fas fa-bullseye text-danger me-2"></i>KRA to do</h3><a class="ms-auto small fw-semibold" href="#/kra">Open KRA</a></div>
        <div class="cardx-body">${todayKra.length ? `<div class="table-wrap"><table class="tablex compact"><tbody>${todayKra.map(k => `<tr><td><div class="fw-semibold">${h(k[3])}</div><div class="kra-row-date">${relDay(d10(k[4]))} ${freqChip(kraFreq(k))}</div></td></tr>`).join("")}</tbody></table></div>` : empty("KRA done for today!", "circle-check")}</div>`}
      </div></div>
    </div>`;
  }
};

// ================= MY TASKS =================
VIEWS.tasks = {
  title: "My Tasks", icon: "list-check",
  render(p) {
    const u = ui("tasks"); if (p.tab) { u.tab = p.tab; delete p.tab; }
    u.tab = u.tab || "pending"; u.sort = u.sort || "due";
    const all = S.idx.taskIn.get(me()) || [];
    const groups = {
      pending: all.filter(t => workIsOpen(t[6]) && !isAwaiting(t[6])),
      awaiting: all.filter(t => isAwaiting(t[6])),
      done: all.filter(t => !workIsOpen(t[6]))
    };
    let list = searchFilter(groups[u.tab].slice(), u.q, t => t[3] + " " + nameOf(t[1]));
    list = sortTasks(list, u.tab === "done" && u.sort === "due" ? "closed" : u.sort);
    const size = 40; u.page = u.page || 0;
    return `<div class="toolbar">
        ${seg("tasks.tab", u.tab, [{ v: "pending", l: "To do", icon: "list-check", c: groups.pending.length }, { v: "awaiting", l: "Awaiting review", icon: "hourglass-half", c: groups.awaiting.length }, { v: "done", l: "Completed", icon: "trophy", c: groups.done.length }])}
        <div class="grow"></div>
        <select class="form-select w-auto" data-change="ui" data-k="tasks.sort"><option value="due" ${u.sort === "due" ? "selected" : ""}>${u.tab === "done" ? "Recently closed" : "Deadline first"}</option><option value="new" ${u.sort === "new" ? "selected" : ""}>Newest assigned</option><option value="old" ${u.sort === "old" ? "selected" : ""}>Oldest assigned</option></select>
        <input type="search" class="form-control" style="max-width:260px" placeholder="Search tasks…" value="${h(u.q || "")}" data-input="uisearch" data-k="tasks.q">
      </div>
      <div class="work-grid">${list.slice(u.page * size, u.page * size + size).map(t => taskCard(t)).join("") || `<div style="grid-column:1/-1">${empty(u.tab === "pending" ? "No pending tasks" : u.tab === "awaiting" ? "Nothing waiting for review" : "No completed tasks yet", "clipboard-list")}</div>`}</div>
      ${pager("tasks.page", u.page, list.length, size)}`;
  }
};

// ================= MY KRA =================
VIEWS.kra = {
  title: "My KRA", icon: "bullseye",
  render() {
    const u = ui("kra"); u.tab = u.tab || "pending"; u.freq = u.freq || "all"; u.page = u.page || 0;
    const email = me();
    const mine = S.idx.kraIn.get(email) || [];
    const pendingAll = mine.filter(k => !["Done", "Rejected", "Cancelled"].includes(k[5]));
    const master = (S.data.kraMaster || []).filter(m => ek(m[2]).includes(email) || ek(m[2]) === "all");
    const tabs = seg("kra.tab", u.tab, [{ v: "pending", l: "Pending", icon: "bullseye", c: pendingAll.length }, { v: "history", l: "History", icon: "clock-rotate-left" }, { v: "config", l: "My KRA list", icon: "list", c: master.length }]);
    if (u.tab === "config") {
      return `<div class="toolbar">${tabs}</div><div class="work-grid">${master.map(m => `<div class="wcard a-brand"><div class="wcard-top">${freqChip(ek(m[4]))}${m[5] && m[5] !== "All" ? `<span class="chip chip-outline">${h(m[5])}</span>` : ""}</div><div class="wcard-title">${h(m[3])}</div><div class="wcard-meta"><span>${h(m[0])}</span>${m[1] ? `<span>KPI ${h(m[1])}</span>` : ""}</div></div>`).join("") || empty("No KRA assigned to you", "list")}</div>`;
    }
    if (u.tab === "history") {
      u.month = u.month || S.data.today.slice(0, 7);
      const rows = mine.filter(k => monthKeyOf(k[4]) === u.month && ["Done", "Rejected"].includes(k[5])).sort((a, b) => String(b[4]).localeCompare(String(a[4])));
      const late = k => { const t = parseLocal(k[4]); if (!t) return false; t.setHours(23, 59, 59, 999); return k[8] && parseLocal(k[8]) > t; };
      return `<div class="toolbar">${tabs}<div class="grow"></div><input type="month" class="form-control w-auto" value="${h(u.month)}" data-change="ui" data-k="kra.month"></div>
        ${rows.length ? `<div class="table-wrap"><table class="tablex"><thead><tr><th>KRA</th><th>Date</th><th>Done on</th><th>Result</th></tr></thead><tbody>${rows.map(k => `<tr><td class="fw-semibold">${h(k[3])} ${freqChip(kraFreq(k))}</td><td class="kra-row-date">${fmtD(k[4])}</td><td class="kra-row-date">${fmtDT(k[8])}</td><td>${k[5] === "Rejected" ? statusChip("Rejected") : late(k) ? '<span class="chip chip-amber">Late · ½ point</span>' : '<span class="chip chip-green">On time</span>'}</td></tr>`).join("")}</tbody></table></div>` : empty("No completed KRA in " + monthLabel(u.month), "clock-rotate-left")}`;
    }
    const freqs = ["daily", "weekly", "monthly"];
    const pending = pendingAll.filter(k => u.freq === "all" || (u.freq === "other" ? !freqs.includes(kraFreq(k)) : kraFreq(k) === u.freq))
      .sort((a, b) => String(a[4]).localeCompare(String(b[4])));
    const size = 100, slice = pending.slice(u.page * size, u.page * size + size);
    let lastDay = "", body = "";
    slice.forEach(k => {
      const day = d10(k[4]);
      if (day !== lastDay) { lastDay = day; body += `<tr class="group-head"><td colspan="3">${day < S.data.today ? '<i class="fas fa-triangle-exclamation text-danger me-1"></i>' : ""}${h(relDay(day))}</td></tr>`; }
      body += `<tr><td style="width:40px"><input type="checkbox" class="form-check-input kra-check" value="${h(k[0])}" data-change="kraSel" aria-label="Select KRA"></td>
        <td><div class="fw-semibold">${h(k[3])}</div><div class="mt-1">${freqChip(kraFreq(k))}</div></td>
        <td class="text-end" style="width:120px"><button class="btn btn-success-soft btn-sm" data-act="kraOne" data-id="${h(k[0])}"><i class="fas fa-check me-1"></i>Done</button></td></tr>`;
    });
    return `<div class="toolbar">${tabs}<div class="grow"></div>${fchips("kra.freq", u.freq, [{ v: "all", l: "All" }, { v: "daily", l: "Daily" }, { v: "weekly", l: "Weekly" }, { v: "monthly", l: "Monthly" }, { v: "other", l: "Other" }])}</div>
      ${pending.length ? `<div class="table-wrap"><table class="tablex"><thead><tr><th><input type="checkbox" class="form-check-input" data-change="kraAll" aria-label="Select all on this page"></th><th>KRA</th><th class="text-end">Action</th></tr></thead><tbody>${body}</tbody></table></div>
        ${pager("kra.page", u.page, pending.length, size)}
        <div class="bulkbar d-none" id="kraBulk"><span><b id="kraSelCount">0</b> selected</span><button class="btn btn-light btn-sm fw-bold" data-act="kraBulk"><i class="fas fa-check-double me-1"></i>Mark selected as done</button></div>`
      : empty("KRA done for today! 🎉", "circle-check")}`;
  }
};
function kraSelUpdate() { const n = $$(".kra-check:checked").length; const bar = $("#kraBulk"); if (bar) { bar.classList.toggle("d-none", !n); $("#kraSelCount").textContent = n; } }
ON_CHANGE.kraSel = kraSelUpdate;
ON_CHANGE.kraAll = el => { $$(".kra-check").forEach(c => { c.checked = el.checked; }); kraSelUpdate(); };
ACT.kraOne = el => kraSubmitDialog([el.dataset.id]);
ACT.kraBulk = () => kraSubmitDialog($$(".kra-check:checked").map(c => c.value));
function kraSubmitDialog(ids) {
  if (!ids.length) return toast("Select at least one KRA.", "warn");
  const rows = ids.map(id => S.data.kraTasks.find(r => String(r[0]) === id)).filter(Boolean);
  dialog({
    title: `<i class="fas fa-check-double text-success me-2"></i>Mark ${ids.length} KRA as done`, submit: "Mark done", submitClass: "btn-success",
    body: `<div class="info-box mb-3" style="max-height:160px;overflow:auto">${rows.map(r => `<div class="small">• ${h(r[3])} <span class="text-muted">(${fmtShort(r[4])})</span></div>`).join("")}</div>
      <label class="form-label">Remarks *</label><textarea class="form-control" name="remarks" rows="2" required placeholder="e.g. Done"></textarea>` + fileField(),
    onSubmit: async f => {
      const remarks = formVal(f, "remarks"); need(remarks, "Remarks are mandatory.");
      const file = await readFile(f.elements.file);
      await api("submitBulkKRA", { ids, file, remarks });
      const now = nowStamp(); rows.forEach(r => { r[5] = "Done"; r[8] = now; }); S.idx = buildIndex(S.data);
      afterAction(ids.length + " KRA marked done.");
    }
  });
}

// ================= TICKETS =================
function ticketCard(t, mode) {
  const st = t[6], open = workIsOpen(st);
  const last = lastTicketPreview(t);
  const file1 = t[9], file2 = t[7];
  return `<div class="wcard click ${open ? (d10(t[11]) && d10(t[11]) < S.data.today ? "a-red" : "a-amber") : "a-green"}" data-act="openTicket" data-id="${h(t[0])}">
    <div class="wcard-top">${statusChip(st)}<span class="chip chip-outline">${h(t[2])}</span>${open ? dueInfo(t[11], true).replace("No deadline", "No deadline set") : ""}</div>
    <div class="wcard-title">${h(t[4])}</div>
    <div class="wcard-meta">
      ${mode === "raised" ? `<span><i class="fas fa-arrow-right"></i>To ${h(nameOf(t[3]))}</span>` : `<span><i class="fas fa-user"></i>From ${h(nameOf(t[1]))}</span>`}
      <span><i class="far fa-calendar-plus"></i>${fmtD(t[5])}</span>
      ${t[10] ? `<span><i class="fas fa-check-double"></i>Resolved ${fmtD(t[10])}</span>` : ""}
    </div>
    ${last ? `<div class="wcard-last"><i class="far fa-comment-dots mt-1"></i><span>${h(last)}</span></div>` : ""}
    ${file1 || file2 ? `<div class="mt-2 d-flex gap-2 flex-wrap">${file1 ? `<a class="att" href="${safeUrl(file1)}" target="_blank" rel="noopener"><i class="fas fa-image"></i>Ticket file</a>` : ""}${file2 ? `<a class="att" href="${safeUrl(file2)}" target="_blank" rel="noopener"><i class="fas fa-paperclip"></i>Resolution file</a>` : ""}</div>` : ""}
    <div class="wcard-actions"><button class="btn btn-ghost btn-sm me-auto" data-act="openTicket" data-id="${h(t[0])}"><i class="far fa-comments me-1"></i>Open & chat</button>
    ${mode === "resolve" && open ? `<button class="btn btn-success btn-sm" data-act="resolveTicket" data-id="${h(t[0])}"><i class="fas fa-check me-1"></i>Resolve</button>` : ""}
    ${mode === "raised" && st === "Closed" ? `<button class="btn btn-danger-soft btn-sm" data-act="reopenTicket" data-id="${h(t[0])}"><i class="fas fa-rotate-left me-1"></i>Reopen</button>` : ""}</div>
  </div>`;
}
VIEWS.tickets = {
  title: "Help Tickets", icon: "headset",
  render(p) {
    const u = ui("tickets"); if (p.tab) { u.tab = p.tab; delete p.tab; } u.tab = u.tab || "resolve";
    const email = me();
    const toResolve = (S.idx.ticketIn.get(email) || []).filter(t => workIsOpen(t[6])).sort((a, b) => String(a[5]).localeCompare(String(b[5])));
    const raised = (S.idx.ticketOut.get(email) || []).slice().sort((a, b) => String(b[5]).localeCompare(String(a[5])));
    let resolved = (S.idx.ticketIn.get(email) || []).filter(t => t[6] === "Closed");
    if (u.from || u.to) resolved = resolved.filter(t => { const k = d10(t[10] || t[5]); return k && (!u.from || k >= u.from) && (!u.to || k <= u.to); });
    resolved.sort((a, b) => String(b[10]).localeCompare(String(a[10])));
    let list = u.tab === "resolve" ? toResolve : u.tab === "raised" ? raised : resolved;
    list = searchFilter(list.slice(), u.q, t => t[4] + " " + nameOf(t[1]) + " " + nameOf(t[3]) + " " + t[2]);
    u.page = u.page || 0; const size = 40;
    return `<div class="toolbar">
      ${seg("tickets.tab", u.tab, [{ v: "resolve", l: "To resolve", icon: "headset", c: toResolve.length }, { v: "raised", l: "Raised by me", icon: "paper-plane", c: raised.length }, { v: "resolved", l: "Resolved by me", icon: "circle-check" }])}
      <div class="grow"></div>
      ${u.tab === "resolved" ? `<input type="date" class="form-control w-auto" value="${h(u.from || "")}" data-change="ui" data-k="tickets.from" aria-label="From"><input type="date" class="form-control w-auto" value="${h(u.to || "")}" data-change="ui" data-k="tickets.to" aria-label="To">` : ""}
      <input type="search" class="form-control" style="max-width:220px" placeholder="Search…" value="${h(u.q || "")}" data-input="uisearch" data-k="tickets.q">
      <button class="btn btn-brand" data-act="raiseTicket"><i class="fas fa-plus me-1"></i>Raise ticket</button></div>
      <div class="work-grid">${list.slice(u.page * size, u.page * size + size).map(t => ticketCard(t, u.tab === "raised" ? "raised" : "resolve")).join("") || `<div style="grid-column:1/-1">${empty(u.tab === "resolve" ? "No tickets to resolve" : "No tickets here", "ticket")}</div>`}</div>
      ${pager("tickets.page", u.page, list.length, size)}`;
  }
};
ACT.raiseTicket = () => {
  const depts = [...new Set((S.data.users || []).filter(x => x.active).map(x => String(x.dept || "").trim()).filter(Boolean))].sort();
  dialog({
    title: '<i class="fas fa-ticket text-brand me-2"></i>Raise a help ticket', submit: "Raise ticket",
    body: `<div class="row g-2"><div class="col-md-6"><label class="form-label">Department *</label><select class="form-select" name="dept" data-change="ticketDept" required><option value="">Select department</option>${depts.map(d => `<option>${h(d)}</option>`).join("")}</select></div>
      <div class="col-md-6"><label class="form-label">Assign to *</label><select class="form-select" name="assignedTo" required><option value="">Select person</option></select></div></div>
      <label class="form-label mt-3">Deadline (optional)</label><input type="date" class="form-control" name="deadline" min="${h(S.data.today)}">
      <label class="form-label mt-3">Describe the issue *</label><textarea class="form-control" name="desc" rows="4" required></textarea>` + fileField("file", "Screenshot / file (optional)"),
    onSubmit: async f => {
      const form = { dept: formVal(f, "dept"), assignedTo: formVal(f, "assignedTo"), desc: formVal(f, "desc"), deadline: formVal(f, "deadline") };
      need(form.dept && form.assignedTo && form.desc, "Select a department, a person and describe the issue.");
      const file = await readFile(f.elements.file);
      await api("createTicket", { form, file });
      afterAction("Ticket raised.");
    }
  });
};
ON_CHANGE.ticketDept = el => {
  const sel = el.form.elements.assignedTo, d = ek(el.value);
  sel.innerHTML = '<option value="">Select person</option>' + (S.data.users || []).filter(x => x.active && ek(x.dept) === d)
    .sort((a, b) => String(a.name).localeCompare(String(b.name))).map(x => `<option value="${h(x.email)}">${h(x.name)} (${h(x.role)})</option>`).join("");
};
ACT.resolveTicket = el => {
  const t = S.data.tickets.find(r => String(r[0]) === el.dataset.id);
  dialog({
    title: '<i class="fas fa-circle-check text-success me-2"></i>Resolve ticket', submit: "Resolve & close", submitClass: "btn-success",
    body: `<div class="info-box mb-3"><div class="fw-semibold">${h(t[4])}</div><div class="small text-muted mt-1">From ${h(nameOf(t[1]))} · ${fmtD(t[5])}</div></div>
      <label class="form-label">Resolution *</label><textarea class="form-control" name="remarks" rows="3" required></textarea>` + fileField(),
    onSubmit: async f => {
      const remarks = formVal(f, "remarks"); need(remarks, "Remarks are mandatory.");
      const file = await readFile(f.elements.file);
      await api("submitWork", { type: "ticket", id: t[0], file, remarks });
      t[6] = "Closed"; t[10] = nowStamp(); t[8] = (t[8] ? t[8] + " | " : "") + "Resolved: " + remarks; S.idx = buildIndex(S.data);
      afterAction("Ticket resolved.");
    }
  });
};
ACT.reopenTicket = el => {
  const t = S.data.tickets.find(r => String(r[0]) === el.dataset.id);
  dialog({
    title: '<i class="fas fa-rotate-left text-danger me-2"></i>Reopen ticket', submit: "Reopen", submitClass: "btn-danger",
    body: `<div class="info-box mb-3 fw-semibold">${h(t[4])}</div><label class="form-label">Why reopen? *</label><textarea class="form-control" name="reason" rows="3" required></textarea>`,
    onSubmit: async f => {
      const reason = formVal(f, "reason"); need(reason, "Reason is mandatory.");
      await api("reopenTicket", { id: t[0], reason });
      t[6] = "Reopened"; t[8] = (t[8] ? t[8] + " | " : "") + "Reopened Reason: " + reason; S.idx = buildIndex(S.data);
      afterAction("Ticket reopened.");
    }
  });
};

// ================= MY SCORECARD =================
VIEWS.scorecard = {
  title: "My Scorecard", icon: "chart-line",
  render() {
    const u = ui("scorecard"); u.month = u.month || S.data.today.slice(0, 7);
    const [f, t] = monthRange(u.month);
    return `<div class="toolbar"><div><label class="form-label">Month</label><input type="month" class="form-control" value="${h(u.month)}" data-change="ui" data-k="scorecard.month"></div></div>
      ${scoreChain(fullScore(me(), f, t < S.data.today ? t : S.data.today), { title: "My score · " + monthLabel(u.month), sub: "Delegation → KRA → Tickets → Completion & On-time → KPI → Final" })}
      ${kpiBoard(me(), u.month, { editable: false, route: "scorecard" })}`;
  }
};

function coverBanner() {
  const today = S.data.today;
  return (S.data.covers || []).filter(c => c.status === "Active" && (c.cover === me() || c.emp === me())).map(c =>
    `<div class="alert ${c.cover === me() ? "alert-info" : "alert-warning"} d-flex gap-2 align-items-center"><i class="fas fa-people-arrows"></i><div>${c.cover === me()
      ? `You are covering for <b>${h(nameOf(c.emp))}</b> until <b>${fmtD(c.to)}</b>. Their work is in your lists (KRAs start with “Cover for”).`
      : `You are on leave cover until <b>${fmtD(c.to)}</b>. Your work is with <b>${h(nameOf(c.cover))}</b>.`}</div></div>`).join("");
}

function homeScoreCard() {
  const m = S.data.today.slice(0, 7), [f, t] = periodOfMonth(m);
  const sc = fullScore(me(), f, t);
  return `<div class="cardx mb-3"><div class="cardx-head"><h3><i class="fas fa-gauge-high text-brand me-2"></i>My score · ${h(monthLabel(m))}</h3><a class="ms-auto small fw-semibold" href="#/scorecard">Full scorecard <i class="fas fa-chevron-right"></i></a></div>
    <div class="cardx-body">${sc.st.all.total || sc.kpi != null ? scoreChain(sc, { compact: true }) : `<div class="text-muted small py-2 text-center"><i class="fas fa-mug-hot me-1"></i>No work due for you yet this month.</div>`}</div></div>`;
}
