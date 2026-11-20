/* ============ team views: approvals, delegate, tracker, performance, analytics, delegation matrix ============ */

// ================= APPROVALS =================
VIEWS.approvals = {
  title: "Approvals", icon: "clipboard-check", team: true,
  render(p) {
    const u = ui("approvals"); if (p.tab) { u.tab = p.tab; delete p.tab; } u.tab = u.tab || "tasks";
    const rq = reviewQueue();
    const subs = rq.filter(t => t[6] === "Submitted").sort((a, b) => String(a[11] || a[9]).localeCompare(String(b[11] || b[9])));
    const exts = rq.filter(t => t[6] === "Extension Requested");
    const below = S.idx.down;
    const teamTasks = S.data.tasks.filter(t => ek(t[1]) !== me() && (below ? below.has(ek(t[1])) : true) && workIsOpen(t[6]));
    const tabs = seg("approvals.tab", u.tab, [{ v: "tasks", l: "Task approvals", icon: "check-double", c: subs.length }, { v: "ext", l: "Extension requests", icon: "calendar-plus", c: exts.length }, { v: "history", l: "Approved history", icon: "clock-rotate-left" }, { v: "team", l: "Team view", icon: "eye", c: teamTasks.filter(t => isAwaiting(t[6])).length }]);
    if (u.tab === "team") return teamView(u, teamTasks, tabs);
    const search = `<input type="search" class="form-control" style="max-width:240px" placeholder="Search…" value="${h(u.q || "")}" data-input="uisearch" data-k="approvals.q">`;
    const q = t => t[3] + " " + nameOf(t[2]);
    if (u.tab === "history") {
      let list = (S.idx.taskOut.get(me()) || []).filter(t => ["Approved", "Rejected"].includes(t[6]));
      if (u.from || u.to) list = list.filter(t => { const k = d10(t[12] || t[9]); return k && (!u.from || k >= u.from) && (!u.to || k <= u.to); });
      list = sortTasks(searchFilter(list, u.q, q), "closed");
      u.page = u.page || 0; const size = 40;
      return `<div class="toolbar">${tabs}<div class="grow"></div><input type="date" class="form-control w-auto" value="${h(u.from || "")}" data-change="ui" data-k="approvals.from" aria-label="From"><input type="date" class="form-control w-auto" value="${h(u.to || "")}" data-change="ui" data-k="approvals.to" aria-label="To">${search}</div>
        <div class="work-grid">${list.slice(u.page * size, u.page * size + size).map(t => taskCard(t, { showTo: true })).join("") || `<div style="grid-column:1/-1">${empty("No history for these dates", "clock-rotate-left")}</div>`}</div>${pager("approvals.page", u.page, list.length, size)}`;
    }
    const list = searchFilter(u.tab === "ext" ? exts : subs, u.q, q);
    const card = t => {
      const sub = lastSubmission(t), late = (() => { const due = d10(t[4]), s = d10(t[11]); return due && s && s > due; })();
      const asked = requestedExtDate(t), req = taskEvents(t).filter(e => e.type === "extension_requested").pop();
      return `<div class="wcard ${u.tab === "ext" ? "a-orange" : "a-violet"}">
        <div class="wcard-top">${statusChip(t[6])}${prioChip(t[5])}${late ? '<span class="chip chip-red">Submitted late</span>' : ""}</div>
        <div class="wcard-title">${h(t[3])}</div>
        <div class="d-flex flex-wrap gap-3 align-items-center small mb-2">${person(t[2])}<span class="text-muted"><i class="far fa-calendar me-1"></i>Due ${fmtD(t[4])}</span>${t[11] && u.tab !== "ext" ? `<span class="text-muted"><i class="fas fa-paper-plane me-1"></i>${fmtDT(t[11])}</span>` : ""}</div>
        ${u.tab === "ext" ? `<div class="info-box"><div class="d-flex gap-2 align-items-center fw-semibold"><span>${fmtD(t[4])}</span><i class="fas fa-arrow-right text-muted"></i><span class="text-warning">${asked ? fmtD(asked) : "—"}</span></div>${req?.message ? `<div class="small mt-1">${linkify(req.message)}</div>` : ""}</div>`
          : sub && (sub.message || sub.attachment) ? `<div class="info-box">${sub.message ? `<div class="small">${linkify(sub.message)}</div>` : ""}${sub.attachment ? `<a class="att" href="${safeUrl(sub.attachment)}" target="_blank" rel="noopener"><i class="fas fa-paperclip"></i>View submitted file</a>` : ""}</div>` : ""}
        <div class="wcard-actions"><button class="btn btn-ghost btn-sm me-auto" data-act="openTask" data-id="${h(t[0])}"><i class="far fa-comments me-1"></i>Full history</button>
          ${u.tab === "ext" ? `<button class="btn btn-danger-soft btn-sm" data-act="extDecide" data-d="reject" data-id="${h(t[0])}">Reject</button><button class="btn btn-success btn-sm" data-act="extDecide" data-d="approve" data-id="${h(t[0])}"><i class="fas fa-calendar-check me-1"></i>Accept</button>`
            : `<button class="btn btn-danger-soft btn-sm" data-act="rejectTask" data-id="${h(t[0])}"><i class="fas fa-ban me-1"></i>Reject</button><button class="btn btn-ghost btn-sm" data-act="reopenTask" data-id="${h(t[0])}"><i class="fas fa-rotate-left me-1"></i>Reopen</button><button class="btn btn-success btn-sm" data-act="approveTask" data-id="${h(t[0])}"><i class="fas fa-check me-1"></i>Approve</button>`}</div>
      </div>`;
    };
    return `<div class="toolbar">${tabs}<div class="grow"></div>${search}</div>
      <div class="work-grid">${list.map(card).join("") || `<div style="grid-column:1/-1">${empty(u.tab === "ext" ? "No extension requests" : "No tasks waiting for approval", "circle-check")}</div>`}</div>`;
  }
};

// View-only: what each HOD / manager below me has delegated and is waiting to approve
function teamView(u, all, tabs) {
  u.tf = u.tf || "awaiting"; u.by = u.by || "all";
  const over = t => !isAwaiting(t[6]) && d10(t[4]) && d10(t[4]) < S.data.today;
  const F = { awaiting: all.filter(t => isAwaiting(t[6])), overdue: all.filter(over), open: all };
  let list = (F[u.tf] || F.awaiting).filter(t => u.by === "all" || ek(t[1]) === u.by);
  list = searchFilter(list, u.q, t => t[3] + " " + nameOf(t[1]) + " " + nameOf(t[2]));
  const groups = new Map();
  sortTasks(list.slice(), "due").forEach(t => { const k = ek(t[1]); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
  const owners = [...new Set(all.map(t => ek(t[1])))].sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b))));
  return `<div class="toolbar">${tabs}<div class="grow"></div>
      ${fchips("approvals.tf", u.tf, [{ v: "awaiting", l: "Waiting for their approval", c: F.awaiting.length }, { v: "overdue", l: "Overdue", c: F.overdue.length }, { v: "open", l: "All open", c: F.open.length }])}
      <select class="form-select w-auto" data-change="ui" data-k="approvals.by"><option value="all">All managers / HODs</option>${owners.map(e => `<option value="${h(e)}" ${u.by === e ? "selected" : ""}>${h(nameOf(e))}</option>`).join("")}</select>
      <input type="search" class="form-control" style="max-width:200px" placeholder="Search…" value="${h(u.q || "")}" data-input="uisearch" data-k="approvals.q"></div>
    <div class="alert alert-info small py-2"><i class="fas fa-eye me-1"></i><b>View only.</b> These tasks were delegated by people in your team. Only the person who delegated a task can approve, reopen or reject it.</div>
    ${groups.size ? [...groups.entries()].map(([owner, ts]) => `<div class="tv-group"><div class="tv-head">${person(owner, "")}<span class="chip chip-violet">${ts.filter(t => isAwaiting(t[6])).length} waiting for approval</span><span class="chip chip-outline">${ts.length} shown</span></div>
      <div class="work-grid">${ts.map(t => taskCard(t, { showTo: true, actions: false })).join("")}</div></div>`).join("") : empty("Nothing here", "eye")}`;
}

// ================= DELEGATE (delegation dashboard) =================
VIEWS.delegate = {
  title: "Delegation", icon: "paper-plane", team: true,
  render(p) {
    const u = ui("delegate");
    if (p.f) { u.f = p.f; if (p.f === "overdue") u.scope = "team"; delete p.f; }
    if (p.to) { const to = ek(p.to); delete p.to; setTimeout(() => openNewTask([to]), 50); }
    u.f = u.f || "open"; u.sort = u.sort || "new"; u.scope = u.scope || "me"; u.person = u.person || "";
    const mineAll = u.scope === "team" ? S.data.tasks.filter(t => S.idx.down.has(ek(t[2]))) : (S.idx.taskOut.get(me()) || []);
    const base = u.person ? mineAll.filter(t => ek(t[2]) === u.person) : mineAll;
    const over = t => workIsOpen(t[6]) && !isAwaiting(t[6]) && d10(t[4]) && d10(t[4]) < S.data.today;
    const F = {
      open: base.filter(t => workIsOpen(t[6]) && !isAwaiting(t[6])), overdue: base.filter(over),
      awaiting: base.filter(t => isAwaiting(t[6])), reopened: base.filter(t => t[6] === "Reopened"),
      done: base.filter(t => !workIsOpen(t[6])), all: base
    };
    let list = searchFilter((F[u.f] || F.open).slice(), u.q, t => t[3] + " " + nameOf(t[2]) + " " + nameOf(t[1]));
    list = sortTasks(list, u.sort);
    u.page = u.page || 0; const size = 30;
    const approved = base.filter(t => t[6] === "Approved");
    const onTime = approved.filter(t => !d10(t[4]) || !d10(t[11]) || d10(t[11]) <= d10(t[4])).length;
    const due = base.filter(t => t[6] !== "Cancelled" && (!workIsOpen(t[6]) || (d10(t[4]) && d10(t[4]) <= S.data.today)));
    const comp = due.length ? Math.round(due.filter(t => t[6] === "Approved").length / due.length * 1000) / 10 : null;
    const ont = approved.length ? Math.round(onTime / approved.length * 1000) / 10 : null;
    // people panel
    const people = new Map();
    mineAll.forEach(t => { const e = ek(t[2]); if (!people.has(e)) people.set(e, { open: 0, over: 0, wait: 0, done: 0 }); const x = people.get(e);
      if (isAwaiting(t[6])) x.wait++; else if (workIsOpen(t[6])) { x.open++; if (over(t)) x.over++; } else x.done++; });
    const plist = [...people.entries()].sort((a, b) => b[1].over - a[1].over || b[1].open - a[1].open || String(nameOf(a[0])).localeCompare(String(nameOf(b[0]))));
    const tile = (f, icon, tone, v, l) => `<button type="button" class="stat ${u.f === f ? "on" : ""}" data-act="seg" data-seg="delegate.f" data-v="${f}"><span class="stat-ic tone-${tone}"><i class="fas fa-${icon}"></i></span><span><div class="stat-v">${v}</div><div class="stat-l">${l}</div></span></button>`;
    return `<div class="d-flex flex-wrap gap-2 align-items-center mb-3">
        ${seg("delegate.scope", u.scope, [{ v: "me", l: "Delegated by me", icon: "user" }, { v: "team", l: "My whole team", icon: "users" }])}
        <div class="flex-grow-1"></div>
        <button class="btn btn-brand" data-act="newTask" ${directUsers().length ? "" : "disabled"}><i class="fas fa-plus me-1"></i>New task</button></div>
      <div class="tiles tiles-6 mb-3">
        ${tile("open", "list-check", "amber", F.open.length, "Open")}
        ${tile("overdue", "triangle-exclamation", "red", F.overdue.length, "Overdue")}
        ${tile("awaiting", "hourglass-half", "violet", F.awaiting.length, "Awaiting review")}
        ${tile("done", "circle-check", "green", F.done.length, "Completed")}
        <div class="stat"><span class="stat-ic tone-brand"><i class="fas fa-percent"></i></span><span><div class="stat-v ${pctCls(comp)}">${pctTxt(comp)}</div><div class="stat-l">Completion</div></span></div>
        <div class="stat"><span class="stat-ic tone-green"><i class="fas fa-stopwatch"></i></span><span><div class="stat-v ${pctCls(ont)}">${pctTxt(ont)}</div><div class="stat-l">On-time</div></span></div>
      </div>
      <div class="row g-3">
        <div class="col-lg-3"><div class="cardx people-panel"><div class="cardx-head"><h3><i class="fas fa-users text-brand me-2"></i>People</h3>${u.person ? `<button class="btn btn-ghost btn-xs ms-auto" data-act="pickPerson" data-e="">Show all</button>` : ""}</div>
          <div class="pp-list">${plist.map(([e, x]) => `<button type="button" class="pp-item ${u.person === e ? "on" : ""}" data-act="pickPerson" data-e="${h(e)}">${avatar(e, "sm")}<span class="min-w-0 flex-grow-1 text-start"><span class="d-block fw-semibold text-truncate">${h(nameOf(e))}</span><span class="small-2 text-muted">${x.open} open · ${x.wait} review · ${x.done} done</span></span>${x.over ? `<span class="nav-badge">${x.over}</span>` : ""}</button>`).join("") || `<div class="p-3 small text-muted">No delegated tasks yet.</div>`}</div></div></div>
        <div class="col-lg-9">
          <div class="toolbar sticky-inner">
            ${fchips("delegate.f", u.f, [{ v: "open", l: "Open", c: F.open.length }, { v: "overdue", l: "Overdue", c: F.overdue.length }, { v: "awaiting", l: "Awaiting", c: F.awaiting.length }, { v: "reopened", l: "Reopened", c: F.reopened.length }, { v: "done", l: "Completed", c: F.done.length }, { v: "all", l: "All", c: base.length }])}
            <div class="grow"></div>
            <select class="form-select w-auto" data-change="ui" data-k="delegate.sort"><option value="new" ${u.sort === "new" ? "selected" : ""}>Latest assigned</option><option value="old" ${u.sort === "old" ? "selected" : ""}>Oldest first</option><option value="due" ${u.sort === "due" ? "selected" : ""}>Deadline first</option><option value="closed" ${u.sort === "closed" ? "selected" : ""}>Recently closed</option></select>
            <input type="search" class="form-control" style="max-width:220px" placeholder="Search task / person…" value="${h(u.q || "")}" data-input="uisearch" data-k="delegate.q">
          </div>
          ${u.person ? `<div class="mb-2"><span class="chip chip-brand">${h(nameOf(u.person))} <a href="#" data-act="pickPerson" data-e="" class="ms-1"><i class="fas fa-xmark"></i></a></span></div>` : ""}
          <div class="work-grid two">${list.slice(u.page * size, u.page * size + size).map(t => taskCard(t, { showTo: true })).join("") || `<div style="grid-column:1/-1">${empty("No tasks here", "list-check")}</div>`}</div>${pager("delegate.page", u.page, list.length, size)}
        </div>
      </div>`;
  }
};
ACT.pickPerson = el => { const u = ui("delegate"); u.person = u.person === el.dataset.e ? "" : el.dataset.e; u.page = 0; rerender(true); };
ACT.newTask = () => openNewTask([]);
function openNewTask(pre) {
  const team = directUsers();
  if (!team.length) return toast("No active direct reports to assign.", "warn");
  dialog({
    title: '<i class="fas fa-paper-plane text-brand me-2"></i>New task', submit: '<i class="fas fa-paper-plane me-1"></i>Assign task', size: "modal-lg",
    body: `<div class="row g-3"><div class="col-md-5"><label class="form-label">Assign to *</label>
        <div class="picker"><input type="search" class="form-control picker-search" placeholder="Search team…" data-input="pickFilter">
          <div class="picker-list">${team.map(x => `<label class="picker-item" data-name="${h(ek(x.name + " " + x.dept))}"><input type="checkbox" class="form-check-input m-0" name="assignee" value="${h(ek(x.email))}" ${pre.includes(ek(x.email)) ? "checked" : ""} data-change="pickSel">${avatar(x.email, "sm")}<span class="min-w-0"><span class="fw-semibold d-block text-truncate">${h(x.name)}</span><span class="small-2 text-muted">${h(x.dept || x.role)}</span></span></label>`).join("")}</div>
          <div class="picker-chips" id="pickChips">${pre.map(e => `<span class="chip chip-brand">${h(nameOf(e))}</span>`).join("")}</div></div></div>
      <div class="col-md-7"><label class="form-label">Task description *</label><textarea class="form-control" name="desc" rows="5" required placeholder="What needs to be done? Be specific."></textarea>
        <div class="row g-2 mt-1"><div class="col-6"><label class="form-label">Deadline</label><input type="date" class="form-control" name="deadline" min="${h(S.data.today)}"></div>
          <div class="col-6"><label class="form-label">Priority</label><select class="form-select" name="priority"><option>High</option><option selected>Medium</option><option>Low</option></select></div></div>
        ${fileField("file", "Attachment / screenshot (optional)")}</div></div>`,
    onSubmit: async f => {
      const sel = $$('input[name="assignee"]:checked', f).map(i => i.value), desc = formVal(f, "desc");
      need(sel.length && desc, "Select a team member and write the task.");
      const file = await readFile(f.elements.file);
      await api("createTask", { form: { assignedTo: sel.join(","), desc, deadline: formVal(f, "deadline"), priority: formVal(f, "priority") }, file });
      toast(`Task assigned to ${sel.length} ${sel.length === 1 ? "person" : "people"}.`);
      sync(true);
    }
  });
}
ON_INPUT.pickFilter = el => { const q = ek(el.value); $$(".picker-item").forEach(i => { i.style.display = i.dataset.name.includes(q) ? "" : "none"; }); };
ON_CHANGE.pickSel = el => {
  const sel = $$('input[name="assignee"]:checked', el.closest("form")).map(i => i.value);
  $("#pickChips").innerHTML = sel.map(e => `<span class="chip chip-brand">${h(nameOf(e))}</span>`).join("");
};

// ================= TRACKER =================
function trackerItems(email) {
  const items = [];
  (S.idx.taskIn.get(email) || []).forEach(r => items.push({ id: r[0], type: "Delegation", title: r[3], status: r[6], done: r[6] === "Approved", date: r[4], closed: r[12], person: r[1], label: "By" }));
  (S.idx.kraIn.get(email) || []).forEach(r => items.push({ id: r[0], type: "KRA", title: r[3], status: r[5], done: r[5] === "Done", date: r[4], closed: r[8], freq: kraFreq(r) }));
  (S.idx.ticketIn.get(email) || []).forEach(r => items.push({ id: r[0], type: "Help Ticket", title: r[4], status: r[6], done: r[6] === "Closed", date: r[11] || r[5], closed: r[10], person: r[1], label: "From" }));
  return items;
}
VIEWS.tracker = {
  title: "Complete Tracker", icon: "street-view", team: true,
  render() {
    const u = ui("tracker"); u.type = u.type || "all"; u.status = u.status || "default"; u.page = u.page || 0;
    const team = teamUsers();
    if (!u.emp && team.length) u.emp = ek(team[0].email);
    const controls = `<div class="toolbar">
      <div class="grow"><label class="form-label">Team member</label><select class="form-select" data-change="ui" data-k="tracker.emp">${team.map(x => `<option value="${h(ek(x.email))}" ${ek(x.email) === u.emp ? "selected" : ""}>${h(x.name)} · ${h(x.dept || "")}</option>`).join("")}</select></div>
      <div><label class="form-label">Work type</label><select class="form-select" data-change="ui" data-k="tracker.type">${[["all", "All work"], ["Delegation", "Delegation"], ["KRA", "KRA"], ["Help Ticket", "Help Ticket"]].map(([v, l]) => `<option value="${v}" ${u.type === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div><label class="form-label">Status</label><select class="form-select" data-change="ui" data-k="tracker.status">${[["default", "Open + completed in range"], ["active", "Open work"], ["approval", "Awaiting review"], ["completed", "Completed"]].map(([v, l]) => `<option value="${v}" ${u.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div><label class="form-label">Done from</label><input type="date" class="form-control" value="${h(u.from || "")}" data-change="ui" data-k="tracker.from"></div>
      <div><label class="form-label">Done to</label><input type="date" class="form-control" value="${h(u.to || "")}" data-change="ui" data-k="tracker.to"></div>
      ${resetBtn("tracker")}
      ${u.emp ? `<a class="btn btn-brand" href="#/delegate?to=${encodeURIComponent(u.emp)}"><i class="fas fa-plus me-1"></i>Delegate</a>` : ""}</div>`;
    if (!u.emp) return controls + empty("No active direct reports", "users-slash");
    const inRange = v => { if (!u.from && !u.to) return true; const k = d10(v); return Boolean(k && (!u.from || k >= u.from) && (!u.to || k <= u.to)); };
    const rangeOk = !u.from || !u.to || u.from <= u.to, hasDates = Boolean(u.from || u.to);
    const open = [], completed = []; let awaiting = 0;
    trackerItems(u.emp).forEach(it => {
      if (u.type !== "all" && it.type !== u.type) return;
      if (it.done) { if (rangeOk && (hasDates || u.status === "completed") && inRange(it.closed)) completed.push(it); return; }
      if (["Rejected", "Cancelled"].includes(it.status)) return;
      if (isAwaiting(it.status)) awaiting++;
      open.push(it);
    });
    const visible = u.status === "completed" ? completed : u.status === "approval" ? open.filter(i => isAwaiting(i.status)) : u.status === "active" ? open : open.concat(completed);
    visible.sort((a, b) => Number(a.done) - Number(b.done) || (a.done ? String(b.closed).localeCompare(String(a.closed)) : String(a.date || "9999").localeCompare(String(b.date || "9999"))));
    const size = 50;
    const typeIcon = { Delegation: "list-check", KRA: "bullseye", "Help Ticket": "headset" };
    const cards = visible.slice(u.page * size, u.page * size + size).map(it => {
      const overdue = !it.done && !isAwaiting(it.status) && d10(it.date) && d10(it.date) < S.data.today;
      return `<div class="wcard ${it.done ? "a-green" : isAwaiting(it.status) ? "a-violet" : overdue ? "a-red" : "a-amber"} ${it.type === "Delegation" ? "click" : ""}" ${it.type === "Delegation" ? `data-act="openTask" data-id="${h(it.id)}"` : ""}>
        <div class="wcard-top"><span class="chip chip-outline"><i class="fas fa-${typeIcon[it.type]}"></i>${it.type}</span>${statusChip(it.status)}${freqChip(it.freq)}</div>
        <div class="wcard-title">${h(it.title)}</div>
        <div class="wcard-meta">${it.person ? `<span><i class="fas fa-user"></i>${it.label} ${h(nameOf(it.person))}</span>` : ""}<span>${it.done ? `<i class="fas fa-check-double"></i>Completed ${fmtD(it.closed)}` : `<i class="far fa-calendar"></i>${it.type === "KRA" ? "Date" : "Due"} ${fmtD(it.date)}`}</span>${overdue ? '<span class="due red">Overdue</span>' : ""}</div>
        ${it.done && (it.type === "KRA" || it.type === "Delegation") ? `<div class="wcard-actions"><button class="btn btn-danger-soft btn-xs" data-act="${it.type === "KRA" ? "fakeKra" : "fakeTask"}" data-id="${h(it.id)}"><i class="fas fa-ban me-1"></i>Mark fake</button></div>` : ""}
      </div>`;
    }).join("");
    return controls + `${!rangeOk ? '<div class="alert alert-warning small py-2">End date must be on or after the start date.</div>' : ""}
      <div class="stat-grid mb-3">
        <div class="stat"><span class="stat-ic tone-amber"><i class="fas fa-list"></i></span><span><div class="stat-v">${open.length}</div><div class="stat-l">Open</div></span></div>
        <div class="stat"><span class="stat-ic tone-violet"><i class="fas fa-hourglass-half"></i></span><span><div class="stat-v">${awaiting}</div><div class="stat-l">Awaiting review</div></span></div>
        <div class="stat"><span class="stat-ic tone-green"><i class="fas fa-check"></i></span><span><div class="stat-v">${completed.length}</div><div class="stat-l">Completed${hasDates ? " in range" : ""}</div></span></div></div>
      <div class="work-grid">${cards || `<div style="grid-column:1/-1">${empty("No work matches these filters", "clipboard-list")}</div>`}</div>${pager("tracker.page", u.page, visible.length, size)}`;
  }
};

// ================= PERFORMANCE SCOREBOARD (same formula as V2) =================
function rangeFilter(from, to) {
  const s = from ? new Date(from + "T00:00:00") : null, e = to ? new Date(to + "T23:59:59.999") : null;
  return v => { if (!s && !e) return true; const d = parseLocal(v); if (!d) return false; return (!s || d >= s) && (!e || d <= e); };
}
function perfFor(email, inRange) {
  const tasks = (S.idx.taskIn.get(email) || []).filter(t => inRange(t[4] || t[9]));
  const kras = (S.idx.kraIn.get(email) || []).filter(k => inRange(k[4]));
  const tickets = (S.idx.ticketIn.get(email) || []).filter(t => inRange(t[5]));
  let tE = 0, tD = 0, tL = 0, tF = 0;
  tasks.forEach(t => { if (t[6] === "Approved") { tD++; const due = parseLocal(t[4]) || new Date(NaN); due.setHours(23, 59, 59, 999); const sub = t[11] ? parseLocal(t[11]) : new Date(); if (sub <= due) tE += 1; else { tE += .5; tL++; } } else if (t[6] === "Rejected") { tE -= 1; tF++; } });
  let kE = 0, kD = 0, kL = 0, kF = 0;
  kras.forEach(k => { if (k[5] === "Done") { kD++; const g = parseLocal(k[4]) || new Date(NaN); g.setHours(23, 59, 59, 999); const dd = k[8] ? parseLocal(k[8]) : new Date(); if (dd <= g) kE += 1; else { kE += .5; kL++; } } else if (k[5] === "Rejected") { kE -= 1; kF++; } });
  const cD = tickets.filter(t => t[6] === "Closed").length;
  const tS = tasks.length ? tE / tasks.length * 100 : 0, kS = kras.length ? kE / kras.length * 100 : 0, cS = tickets.length ? cD / tickets.length * 100 : 0;
  let n = 0, sum = 0; if (tasks.length) { n++; sum += tS; } if (kras.length) { n++; sum += kS; } if (tickets.length) { n++; sum += cS; }
  return { score: n ? Math.round(sum / n) : 0, task: { done: tD, total: tasks.length, score: tS, late: tL, fake: tF }, kra: { done: kD, total: kras.length, score: kS, late: kL, fake: kF }, tck: { done: cD, total: tickets.length, score: cS } };
}
// period helpers shared by Performance (Month / Dates / All time)
function periodState(u) {
  u.mode = u.mode || "month"; u.month = u.month || S.data.today.slice(0, 7);
  if (u.mode === "all") return { from: "", to: S.data.today, label: "All time (till " + fmtD(S.data.today) + ")" };
  if (u.mode === "custom") return { from: u.from || "", to: u.to || S.data.today, label: (u.from ? fmtD(u.from) : "Start") + " – " + fmtD(u.to || S.data.today) };
  const [f, t] = periodOfMonth(u.month); return { from: f, to: t, label: monthLabel(u.month) };
}
function periodControls(route, u) {
  return `${seg(route + ".mode", u.mode, [{ v: "month", l: "Month" }, { v: "custom", l: "Dates" }, { v: "all", l: "All time" }])}
    ${u.mode === "month" ? `<input type="month" class="form-control w-auto" value="${h(u.month)}" data-change="ui" data-k="${route}.month">` : u.mode === "custom" ? `<input type="date" class="form-control w-auto" value="${h(u.from || "")}" data-change="ui" data-k="${route}.from" aria-label="From"><input type="date" class="form-control w-auto" value="${h(u.to || "")}" data-change="ui" data-k="${route}.to" aria-label="To">` : ""}`;
}
function scCell(v, line, tip) { return `<td class="text-center" ${tipAttr(tip)}><div class="fw-bold ${pctCls(v)}">${pctTxt(v)}</div>${line ? `<div class="small-2 text-muted">${line}</div>` : ""}</td>`; }
function scoreHeaderCells() {
  return `<th class="text-center">Delegation</th><th class="text-center">KRA</th><th class="text-center">Tickets</th><th class="text-center sc-th-d">Completion</th><th class="text-center sc-th-d">On-time</th><th class="text-center sc-th-k">KPI<br><small>Auto + Manual</small></th><th class="text-center sc-th-f">Final score</th>`;
}
function scoreRowCells(sc) {
  const t = sc.st, ex = scoreExplain(sc);
  const sug = scoreSuggestions(sc);
  return scCell(sc.del, `${t.task.done}/${t.task.total}`, ex.del) + scCell(sc.kra, `${t.kra.done}/${t.kra.total}`, ex.kra) + scCell(sc.tck, `${t.ticket.done}/${t.ticket.total}`, ex.tck) +
    scCell(sc.completion, `${t.all.done}/${t.all.total}`, ex.completion) + scCell(sc.ontime, `${t.all.late} late`, ex.ontime) +
    scCell(sc.kpi, sc.kb ? (sc.kb.md != null ? "MD final" : `${sc.kb.auto.toFixed(1)} + ${sc.kb.manual.toFixed(1)}`) : sc.kpiMonths > 1 ? `${sc.kpiMonths}-mo avg` : "", ex.kpi) +
    `<td class="text-center sc-final-cell" ${tipAttr(ex.final + (sug.length ? "<hr><b>Pulled down by:</b><br>" + sug.map(x => "• " + h(x.area) + (x.lost ? " (−" + x.lost + ")" : "")).join("<br>") : ""))}><span class="final-pill ${sc.final == null ? "" : sc.final >= 80 ? "g" : sc.final >= 60 ? "y" : "r"}">${pctTxt(sc.final)}</span></td>`;
}
VIEWS.performance = {
  title: "Performance Scoreboard", icon: "ranking-star", team: true,
  render() {
    const u = ui("performance"); const p = periodState(u); u.sort = u.sort || "final";
    let rows = teamUsers().map(x => ({ user: x, email: ek(x.email), sc: fullScore(ek(x.email), p.from, p.to) }));
    const key = { final: r => r.sc.final, completion: r => r.sc.completion, ontime: r => r.sc.ontime, kpi: r => r.sc.kpi }[u.sort] || (r => r.sc.final);
    rows.sort((a, b) => (key(b) ?? -999) - (key(a) ?? -999));
    rows.forEach((r, i) => { r.rank = i + 1; });
    rows = searchFilter(rows, u.q, r => r.user.name + " " + r.email);
    return `<div class="toolbar">${periodControls("performance", u)}
      <select class="form-select w-auto" data-change="ui" data-k="performance.sort">${[["final", "Rank by Final score"], ["completion", "Rank by Completion"], ["ontime", "Rank by On-time"], ["kpi", "Rank by KPI"]].map(([v, l]) => `<option value="${v}" ${u.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <input type="search" class="form-control" style="max-width:220px" placeholder="Team member…" value="${h(u.q || "")}" data-input="uisearch" data-k="performance.q">
      ${resetBtn("performance")}<div class="grow"></div><span class="chip chip-brand"><i class="far fa-calendar"></i>${h(p.label)}</span></div>
      ${rows.length ? `<div class="table-wrap"><table class="tablex sc-table"><thead><tr><th>#</th><th>Employee</th>${scoreHeaderCells()}</tr></thead>
        <tbody>${rows.map(r => `<tr class="click-row" data-act="perfDetail" data-email="${h(r.email)}"><td><span class="rank ${r.rank <= 3 ? "r" + r.rank : ""}">${r.rank}</span></td><td>${person(r.email)}<div class="small-2 text-muted ms-4 ps-2">${h(r.user.dept || "")}</div></td>${scoreRowCells(r.sc)}</tr>`).join("")}</tbody></table></div>
        ${SCORE_HELP}` : empty("No team data found", "chart-bar")}`;
  }
};
ACT.perfDetail = el => {
  const email = el.dataset.email, u = ui("performance"), pp = periodState(u), inRange = rangeFilter(pp.from, pp.to);
  const items = [];
  (S.idx.taskIn.get(email) || []).filter(t => inRange(t[4] || t[9])).forEach(t => { const due = parseLocal(t[4]) || new Date(NaN); due.setHours(23, 59, 59, 999); const late = t[6] === "Approved" && (t[11] ? parseLocal(t[11]) : new Date()) > due; items.push({ kind: "Task", id: t[0], title: t[3], st: t[6], late, date: t[9] || t[4], due: t[4], closed: t[12], from: t[1] }); });
  (S.idx.kraIn.get(email) || []).filter(k => inRange(k[4])).forEach(k => { const g = parseLocal(k[4]) || new Date(NaN); g.setHours(23, 59, 59, 999); const late = k[5] === "Done" && (k[8] ? parseLocal(k[8]) : new Date()) > g; items.push({ kind: "KRA", id: k[0], title: k[3], st: k[5], late, date: k[4], due: k[4], closed: k[8], freq: kraFreq(k) }); });
  (S.idx.ticketIn.get(email) || []).filter(t => inRange(t[5])).forEach(t => items.push({ kind: "Ticket", id: t[0], title: t[4], st: t[6], late: false, date: t[5], due: t[11] || t[5], closed: t[10], from: t[1] }));
  items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const row = it => `<tr><td><span class="chip chip-outline">${it.kind}</span></td><td>${it.kind === "Task" ? `<a href="#" class="fw-semibold text-reset" data-act="openTask" data-id="${h(it.id)}">${h(it.title)}</a>` : `<span class="fw-semibold">${h(it.title)}</span>`} ${freqChip(it.freq)}${it.from ? `<div class="small-2 text-muted">From ${h(nameOf(it.from))}</div>` : ""}</td>
    <td class="kra-row-date">${fmtD(it.due)}</td><td>${statusChip(it.st)}${it.late ? ' <span class="chip chip-amber">Late</span>' : ""}</td><td class="kra-row-date">${it.closed ? fmtD(it.closed) : "—"}</td>
    <td class="text-end">${it.kind === "KRA" && it.st === "Done" ? `<button class="btn btn-danger-soft btn-xs" data-act="fakeKra" data-id="${h(it.id)}">Mark fake</button>` : it.kind === "Task" && it.st === "Approved" ? `<button class="btn btn-danger-soft btn-xs" data-act="fakeTask" data-id="${h(it.id)}">Mark fake</button>` : ""}</td></tr>`;
  const table = list => list.length ? `<div class="table-wrap"><table class="tablex compact"><thead><tr><th>Type</th><th>Work</th><th>Due</th><th>Status</th><th>Closed</th><th></th></tr></thead><tbody>${list.slice(0, 300).map(row).join("")}</tbody></table></div>${list.length > 300 ? `<div class="small text-muted mt-1">Showing 300 of ${list.length}. Narrow the date range to see more.</div>` : ""}` : empty("Nothing here", "inbox");
  const open = items.filter(i => workIsOpen(i.st)), hist = items.filter(i => !workIsOpen(i.st));
  dialog({ title: `${avatar(email, "sm")} <span class="ms-2">${h(nameOf(email))}</span><span class="chip chip-outline ms-2">${h(pp.label)}</span>`, size: "modal-xl", noFooter: true,
    body: `${scoreChain(fullScore(email, pp.from, pp.to), { compact: true })}<h6 class="fw-bold mt-3">Pending / active (${open.length})</h6>${table(open)}<h6 class="fw-bold mt-4">Completed & history (${hist.length})</h6>${table(hist)}` });
};

// ================= ANALYTICS =================
VIEWS.analytics = {
  title: "Analytics", icon: "chart-pie", team: true,
  render() {
    const u = ui("analytics"); u.mode = u.mode || "month"; u.month = u.month || S.data.today.slice(0, 7); u.dept = u.dept || "all"; u.emp = u.emp || "all";
    let team = teamUsers();
    const depts = [...new Set(team.map(x => x.dept).filter(Boolean))].sort();
    if (u.dept !== "all") team = team.filter(x => x.dept === u.dept);
    const empOpts = team.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (u.emp !== "all") team = team.filter(x => ek(x.email) === u.emp);
    let from = "", to = S.data.today, label = "All time";
    if (u.mode === "month") { [from, to] = monthRange(u.month); if (to > S.data.today) to = S.data.today; label = monthLabel(u.month); }
    else if (u.mode === "custom") { from = u.from || ""; to = u.to || S.data.today; label = (from ? fmtD(from) : "Start") + " – " + fmtD(to); }
    const per = team.map(x => { const sc = fullScore(ek(x.email), from, to); return { x, e: ek(x.email), st: sc.st, sc }; });
    const sum = k => per.reduce((s, r) => s + r.st.all[k], 0);
    const tot = { total: sum("total"), done: sum("done"), onTime: sum("onTime"), late: sum("late"), fake: sum("fake"), pending: sum("pending") };
    const comp = tot.total ? Math.round(tot.done / tot.total * 1000) / 10 : null, ont = tot.done ? Math.round(tot.onTime / tot.done * 1000) / 10 : null;
    const typeSum = (t, k) => per.reduce((s, r) => s + r.st[t][k], 0);
    const overdueNow = per.reduce((s, r) => s + (S.idx.taskIn.get(r.e) || []).filter(t => workIsOpen(t[6]) && !isAwaiting(t[6]) && d10(t[4]) && d10(t[4]) < S.data.today).length, 0);
    // daily trend (completed per day) for the period (max 62 days)
    const days = []; const start = from || addDays(to, -29);
    for (let d = (dayDiff(start, to) > 61 ? addDays(to, -61) : start); d <= to; d = addDays(d, 1)) days.push(d);
    const doneBy = Object.fromEntries(days.map(d => [d, 0])), dueBy = Object.fromEntries(days.map(d => [d, 0]));
    per.forEach(r => {
      (S.idx.kraIn.get(r.e) || []).forEach(k => { const d = d10(k[4]); if (d in dueBy) dueBy[d]++; const c = d10(k[8]); if (k[5] === "Done" && c in doneBy) doneBy[c]++; });
      (S.idx.taskIn.get(r.e) || []).forEach(t => { const d = d10(t[4]); if (d in dueBy) dueBy[d]++; const c = d10(t[12]); if (t[6] === "Approved" && c in doneBy) doneBy[c]++; });
      (S.idx.ticketIn.get(r.e) || []).forEach(t => { const d = d10(t[11]) || d10(t[5]); if (d in dueBy) dueBy[d]++; const c = d10(t[10]); if (t[6] === "Closed" && c in doneBy) doneBy[c]++; });
    });
    // department comparison
    const deptMap = {};
    per.forEach(r => { const d = r.x.dept || "Other"; deptMap[d] = deptMap[d] || { t: 0, d: 0 }; deptMap[d].t += r.st.all.total; deptMap[d].d += r.st.all.done; });
    const deptRows = Object.entries(deptMap).filter(([, v]) => v.t).map(([k, v]) => [k, Math.round(v.d / v.t * 1000) / 10]).sort((a, b) => b[1] - a[1]);
    const ranked = per.filter(r => r.sc.final != null).sort((a, b) => (b.sc.final ?? 0) - (a.sc.final ?? 0));
    S.pendingCharts = [
      ["cTrend", "line", days.map(d => fmtShort(d)), [{ label: "Completed", data: days.map(d => doneBy[d]), borderColor: "#108082", backgroundColor: "rgba(16,128,130,.12)", fill: true, tension: .25, pointRadius: 0 }, { label: "Due", data: days.map(d => dueBy[d]), borderColor: "#94a3b8", borderDash: [5, 4], tension: .25, pointRadius: 0 }]],
      ["cDept", "bar", deptRows.map(d => d[0]), [{ label: "Completion %", data: deptRows.map(d => d[1]), backgroundColor: deptRows.map(d => d[1] >= 80 ? "#059669" : d[1] >= 60 ? "#f59e0b" : "#dc2626"), borderRadius: 6 }], { indexAxis: "y", max: 100 }],
      ["cMix", "doughnut", ["On time", "Late", "Pending", "Fake"], [{ data: [tot.onTime, tot.late, tot.pending, tot.fake], backgroundColor: ["#059669", "#f59e0b", "#cbd5e1", "#dc2626"], borderWidth: 0 }]],
      ["cType", "bar", ["Delegation", "KRA", "Tickets"], [{ label: "Done", data: ["task", "kra", "ticket"].map(t => typeSum(t, "done")), backgroundColor: "#108082", borderRadius: 6 }, { label: "Not done", data: ["task", "kra", "ticket"].map(t => typeSum(t, "pending") + typeSum(t, "fake")), backgroundColor: "#fca5a5", borderRadius: 6 }], { stacked: true }]
    ];
    const kpi = (icon, tone, v, l, sub, cls = "") => `<div class="stat"><span class="stat-ic tone-${tone}"><i class="fas fa-${icon}"></i></span><span><div class="stat-v ${cls}">${v}</div><div class="stat-l">${l}</div>${sub ? `<div class="stat-s text-muted">${sub}</div>` : ""}</span></div>`;
    const prow = (r, i) => `<tr><td><span class="rank ${i < 3 ? "r" + (i + 1) : ""}" style="width:24px;height:24px;font-size:.72rem">${i + 1}</span></td><td>${person(r.e)}</td><td>${badgeSm(r.st.all.completion)}</td><td>${badgeSm(r.st.all.ontime)}</td><td>${badgeSm(r.sc.kpi == null ? null : Math.round(r.sc.kpi * 10) / 10)}</td><td><b class="${pctCls(r.sc.final)}">${pctTxt(r.sc.final)}</b></td></tr>`;
    return `<div class="toolbar">
      ${seg("analytics.mode", u.mode, [{ v: "month", l: "Month" }, { v: "custom", l: "Dates" }, { v: "all", l: "All time" }])}
      ${u.mode === "month" ? `<input type="month" class="form-control w-auto" value="${h(u.month)}" data-change="ui" data-k="analytics.month">` : u.mode === "custom" ? `<input type="date" class="form-control w-auto" value="${h(u.from || "")}" data-change="ui" data-k="analytics.from" aria-label="From"><input type="date" class="form-control w-auto" value="${h(u.to || "")}" data-change="ui" data-k="analytics.to" aria-label="To">` : ""}
      <select class="form-select w-auto" data-change="ui" data-k="analytics.dept"><option value="all">All departments</option>${depts.map(d => `<option ${d === u.dept ? "selected" : ""}>${h(d)}</option>`).join("")}</select>
      <select class="form-select w-auto" data-change="ui" data-k="analytics.emp"><option value="all">All employees</option>${empOpts.map(x => `<option value="${h(ek(x.email))}" ${ek(x.email) === u.emp ? "selected" : ""}>${h(x.name)}</option>`).join("")}</select>
      ${resetBtn("analytics")}<div class="grow"></div><span class="chip chip-brand"><i class="far fa-calendar"></i>${h(label)}</span></div>
      ${!per.length ? empty("No team data for this filter", "users-slash") : `
      <div class="tiles tiles-3 mb-3">
        ${kpi("circle-check", "brand", pctTxt(comp), "Completion", `${tot.done} of ${tot.total} done`, pctCls(comp))}
        ${kpi("stopwatch", "green", pctTxt(ont), "On-time", `${tot.late} late`, pctCls(ont))}
        ${kpi("list-check", "amber", `${typeSum("task", "done")}/${typeSum("task", "total")}`, "Delegation done", pctTxt(per.length && typeSum("task", "total") ? Math.round(typeSum("task", "done") / typeSum("task", "total") * 100) : null))}
        ${kpi("bullseye", "blue", `${typeSum("kra", "done")}/${typeSum("kra", "total")}`, "KRA done", pctTxt(typeSum("kra", "total") ? Math.round(typeSum("kra", "done") / typeSum("kra", "total") * 100) : null))}
        ${kpi("headset", "orange", `${typeSum("ticket", "done")}/${typeSum("ticket", "total")}`, "Tickets resolved", pctTxt(typeSum("ticket", "total") ? Math.round(typeSum("ticket", "done") / typeSum("ticket", "total") * 100) : null))}
        ${kpi("triangle-exclamation", "red", overdueNow, "Overdue right now", tot.fake ? `${tot.fake} fake in period` : "")}
      </div>
      <div class="row g-3 mb-3">
        <div class="col-lg-8"><div class="cardx cardx-body h-100"><h3 class="section-title"><i class="fas fa-chart-line text-brand"></i>Daily trend · completed vs due</h3><div class="chart-box"><canvas id="cTrend"></canvas></div></div></div>
        <div class="col-lg-4"><div class="cardx cardx-body h-100"><h3 class="section-title"><i class="fas fa-chart-pie text-brand"></i>Work result mix</h3><div class="chart-box"><canvas id="cMix"></canvas></div></div></div>
        <div class="col-lg-6"><div class="cardx cardx-body h-100"><h3 class="section-title"><i class="fas fa-building text-brand"></i>Completion by department</h3><div class="chart-box" style="height:${Math.max(200, deptRows.length * 34)}px"><canvas id="cDept"></canvas></div></div></div>
        <div class="col-lg-6"><div class="cardx cardx-body h-100"><h3 class="section-title"><i class="fas fa-layer-group text-brand"></i>By work type</h3><div class="chart-box"><canvas id="cType"></canvas></div></div></div>
      </div>
      <div class="row g-3">
        <div class="col-lg-6"><div class="cardx h-100"><div class="cardx-head"><h3><i class="fas fa-trophy text-warning me-2"></i>Top performers</h3></div><div class="table-wrap border-0 rounded-0"><table class="tablex compact"><thead><tr><th></th><th>Employee</th><th>Completion</th><th>On-time</th><th>KPI</th><th>Final</th></tr></thead><tbody>${ranked.slice(0, 7).map(prow).join("") || '<tr><td colspan="6" class="text-muted">No data</td></tr>'}</tbody></table></div></div></div>
        <div class="col-lg-6"><div class="cardx h-100"><div class="cardx-head"><h3><i class="fas fa-circle-exclamation text-danger me-2"></i>Needs attention</h3></div><div class="table-wrap border-0 rounded-0"><table class="tablex compact"><thead><tr><th></th><th>Employee</th><th>Completion</th><th>On-time</th><th>KPI</th><th>Final</th></tr></thead><tbody>${(() => { const weak = ranked.map((r, i) => [r, i]).filter(([r]) => (r.sc.final ?? 100) < 80 || (r.st.all.completion ?? 100) < 80 || r.st.all.fake).reverse().slice(0, 7);
          return weak.map(([r, i]) => prow(r, i)).join("") || '<tr><td colspan="6" class="text-success fw-semibold">Everyone is at 80%+ final score 🎉</td></tr>'; })()}</tbody></table></div></div></div>
      </div>`}`;
  },
  after() {
    const dark = document.documentElement.getAttribute("data-bs-theme") === "dark", tc = dark ? "#cbd5e1" : "#475569", gc = dark ? "rgba(255,255,255,.06)" : "rgba(15,23,42,.06)";
    (S.pendingCharts || []).forEach(([id, type, labels, datasets, opt = {}]) => {
      const el = document.getElementById(id); if (!el || !window.Chart) return;
      if (S.charts[id]) S.charts[id].destroy();
      const axes = type === "doughnut" ? undefined : {
        x: { stacked: opt.stacked, grid: { display: opt.indexAxis === "y", color: gc }, ticks: { color: tc, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, ...(opt.indexAxis === "y" ? { max: opt.max, beginAtZero: true } : {}) },
        y: { stacked: opt.stacked, beginAtZero: true, grid: { color: gc, display: opt.indexAxis !== "y" }, ticks: { color: tc, precision: 0 } } };
      S.charts[id] = new Chart(el, { type, data: { labels, datasets },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: opt.indexAxis || "x", cutout: type === "doughnut" ? "64%" : undefined, interaction: { mode: "index", intersect: false },
          plugins: { legend: { display: type !== "bar" || opt.stacked, position: "bottom", labels: { color: tc, usePointStyle: true, boxWidth: 8 } } }, scales: axes } });
    });
  }
};
function badgeSm(v) { return v == null ? '<span class="text-muted">—</span>' : `<span class="chip ${v >= 80 ? "chip-green" : v >= 60 ? "chip-amber" : "chip-red"}">${pctTxt(v)}</span>`; }

// ================= DELEGATION MATRIX =================
VIEWS.delmatrix = {
  title: "Delegation Matrix", icon: "network-wired", team: true,
  render() {
    const u = ui("delmatrix"); u.emp = u.emp || "all";
    const inRange = rangeFilter(u.from, u.to);
    let users = teamUsers(); if (u.emp !== "all") users = users.filter(x => ek(x.email) === u.emp);
    const lateOpen = t => { const due = parseLocal(t[4]); if (!due) return false; due.setHours(23, 59, 59, 999); return new Date() > due && t[6] !== "Submitted" && workIsOpen(t[6]); };
    return `<div class="toolbar"><div><label class="form-label">Created from</label><input type="date" class="form-control" value="${h(u.from || "")}" data-change="ui" data-k="delmatrix.from"></div>
      <div><label class="form-label">Created to</label><input type="date" class="form-control" value="${h(u.to || "")}" data-change="ui" data-k="delmatrix.to"></div>
      <div class="grow"><label class="form-label">Employee</label><select class="form-select" data-change="ui" data-k="delmatrix.emp"><option value="all">All employees</option>${teamUsers().map(x => `<option value="${h(ek(x.email))}" ${ek(x.email) === u.emp ? "selected" : ""}>${h(x.name)}</option>`).join("")}</select></div>${resetBtn("delmatrix")}</div>
      <div class="small text-muted mb-3"><i class="fas fa-circle-info me-1"></i>All tasks (pending & done) assigned <b>to</b> each person and delegated <b>by</b> them, by creation date.</div>
      <div class="work-grid">${users.map(x => {
        const e = ek(x.email);
        const wl = (S.idx.taskIn.get(e) || []).filter(t => inRange(t[9] || t[4])), dl = (S.idx.taskOut.get(e) || []).filter(t => inRange(t[9] || t[4]));
        const box = (lbl, list, color) => `<div class="flex-fill text-center p-2 rounded-3" style="background:var(--surface-2)"><div class="stat-v" style="color:${color}">${list.length}</div><div class="stat-l">${lbl}</div>
          <div class="small-2 mt-1"><span class="text-success fw-semibold">${list.filter(t => t[6] === "Approved").length} done</span> · <span class="fw-semibold">${list.filter(t => workIsOpen(t[6])).length} open</span></div>${list.filter(lateOpen).length ? `<span class="chip chip-red mt-1">${list.filter(lateOpen).length} late</span>` : ""}</div>`;
        return `<div class="wcard click a-violet" data-act="matrixDetail" data-email="${h(e)}"><div class="mb-3">${person(e, "")}<div class="small-2 text-muted mt-1">${h(x.dept || "")}</div></div>
          <div class="d-flex gap-2">${box("Assigned to them", wl, "var(--red)")}${box("Delegated by them", dl, "var(--violet)")}</div></div>`;
      }).join("") || empty("No data for this filter", "search")}</div>`;
  }
};
ACT.matrixDetail = el => {
  const e = el.dataset.email, u = ui("delmatrix"), inRange = rangeFilter(u.from, u.to);
  const newest = (a, b) => String(b[9] || b[4]).localeCompare(String(a[9] || a[4]));
  const wl = (S.idx.taskIn.get(e) || []).filter(t => inRange(t[9] || t[4])).sort(newest), dl = (S.idx.taskOut.get(e) || []).filter(t => inRange(t[9] || t[4])).sort(newest);
  const list = (arr, showTo) => arr.length ? `<div class="work-list">${arr.slice(0, 200).map(t => taskCard(t, { showTo, actions: false })).join("")}</div>${arr.length > 200 ? `<div class="small text-muted mt-2">Showing 200 of ${arr.length}.</div>` : ""}` : empty("No tasks in this category", "inbox");
  dialog({ title: `${avatar(e, "sm")} <span class="ms-2">${h(nameOf(e))} · delegation matrix</span>`, size: "modal-xl", noFooter: true,
    body: `<div class="row g-3"><div class="col-lg-6"><h6 class="fw-bold">Assigned to them (${wl.length})</h6>${list(wl, false)}</div><div class="col-lg-6"><h6 class="fw-bold">Delegated by them (${dl.length})</h6>${list(dl, true)}</div></div>` });
};
// opening a task from inside a dialog: close the dialog first
const _openTask = ACT.openTask;
ACT.openTask = el => { if ($("#dlg").classList.contains("show")) closeDialog(); _openTask(el); };
