/* ============ Admin panel: leave cover, migration, launch emails ============ */
const COVER_CHIP = { Scheduled: "chip-violet", Active: "chip-green", Ended: "chip-slate", Cancelled: "chip-slate", Expired: "chip-slate" };

VIEWS.admin = {
  title: "Admin Panel", icon: "user-shield", team: true, admin: true,
  render() {
    const u = ui("admin"); u.tab = u.tab || "leave";
    const tabs = seg("admin.tab", u.tab, [{ v: "leave", l: "Leave & cover", icon: "people-arrows" }, { v: "migrate", l: "Data migration", icon: "database" }, { v: "launch", l: "Launch & logins", icon: "rocket" }]);
    const body = u.tab === "migrate" ? adminMigrate() : u.tab === "launch" ? adminLaunch() : adminLeave();
    return `<div class="toolbar">${tabs}</div>${body}`;
  }
};

// ---------- Leave & cover ----------
function adminLeave() {
  const users = (S.data.users || []).filter(x => x.active).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const opts = users.map(x => `<option value="${h(ek(x.email))}">${h(x.name)} · ${h(x.dept || "")}</option>`).join("");
  const covers = (S.data.covers || []).slice().sort((a, b) => String(b.from).localeCompare(String(a.from)));
  return `<div class="row g-3">
    <div class="col-xl-5"><form id="coverForm" class="cardx"><div class="cardx-head"><h3><i class="fas fa-people-arrows text-brand me-2"></i>Set leave cover</h3></div><div class="cardx-body">
      <label class="form-label">Employee on leave *</label><select class="form-select" name="emp" required><option value="">Select employee</option>${opts}</select>
      <label class="form-label mt-3">Work goes to (cover person) *</label><select class="form-select" name="cover" required><option value="">Select person</option>${opts}</select>
      <div class="row g-2 mt-1"><div class="col-6"><label class="form-label">From *</label><input type="date" class="form-control" name="from" value="${h(S.data.today)}" required></div>
        <div class="col-6"><label class="form-label">To *</label><input type="date" class="form-control" name="to" required></div></div>
      <label class="form-label mt-3">What to move</label>
      <div class="d-grid gap-2">
        <label class="form-check m-0"><input class="form-check-input" type="checkbox" name="moveKRA" checked> <span class="fw-semibold">KRA tasks</span> <span class="small text-muted d-block">Pending KRAs dated in this period + new KRAs generated during the leave</span></label>
        <label class="form-check m-0"><input class="form-check-input" type="checkbox" name="moveTasks" checked> <span class="fw-semibold">Open delegation tasks</span> <span class="small text-muted d-block">Pending / reopened tasks (not the ones waiting for approval)</span></label>
        <label class="form-check m-0"><input class="form-check-input" type="checkbox" name="moveTickets" checked> <span class="fw-semibold">Open help tickets</span></label>
        <label class="form-check m-0 mt-1"><input class="form-check-input" type="checkbox" name="returnAtEnd" checked> <span class="fw-semibold">Return unfinished delegation tasks & tickets after leave</span> <span class="small text-muted d-block">KRAs of the leave days stay with the cover person</span></label>
      </div>
      <label class="form-label mt-3">Note</label><input class="form-control" name="note" placeholder="e.g. Medical leave">
      <div class="d-flex justify-content-end mt-3"><button class="btn btn-brand" type="submit" id="coverBtn"><i class="fas fa-check me-1"></i>Save leave cover</button></div>
      <div class="small text-muted mt-2"><i class="fas fa-circle-info me-1"></i>Starts automatically on the From date (every morning with KRA generation). If From is today, work moves right now. Both people get an email.</div>
    </div></form></div>
    <div class="col-xl-7"><div class="cardx"><div class="cardx-head"><h3><i class="fas fa-calendar-days text-brand me-2"></i>Leave covers</h3></div><div class="cardx-body">
      ${covers.length ? `<div class="work-list">${covers.map(c => `<div class="wcard ${c.status === "Active" ? "a-green" : c.status === "Scheduled" ? "a-violet" : ""}">
        <div class="wcard-top"><span class="chip ${COVER_CHIP[c.status] || "chip-slate"}">${h(c.status)}</span><span class="chip chip-outline">${fmtD(c.from)} → ${fmtD(c.to)}</span>${c.moved ? `<span class="chip chip-brand">${c.moved} items moved</span>` : ""}</div>
        <div class="d-flex flex-wrap align-items-center gap-2 my-2">${person(c.emp)}<i class="fas fa-arrow-right-long text-muted"></i>${person(c.cover)}</div>
        <div class="wcard-meta"><span>${[c.moveKRA && "KRA", c.moveTasks && "Delegation", c.moveTickets && "Tickets"].filter(Boolean).join(" + ")}</span><span>${c.returnAtEnd ? "Returns after leave" : "Stays with cover"}</span>${c.note ? `<span><i class="far fa-comment"></i>${h(c.note)}</span>` : ""}</div>
        ${c.status === "Scheduled" || c.status === "Active" ? `<div class="wcard-actions">${c.status === "Scheduled" ? `<button class="btn btn-danger-soft btn-sm" data-act="coverEnd" data-mode="cancel" data-id="${h(c.id)}">Cancel</button>` : `<button class="btn btn-ghost btn-sm" data-act="coverEnd" data-mode="end" data-id="${h(c.id)}"><i class="fas fa-flag-checkered me-1"></i>End now</button>`}</div>` : ""}
      </div>`).join("")}</div>` : empty("No leave covers yet", "umbrella-beach")}
    </div></div></div></div>`;
}
document.addEventListener("submit", async e => {
  if (e.target.id !== "coverForm") return;
  e.preventDefault();
  const f = e.target, btn = $("#coverBtn");
  const form = { emp: formVal(f, "emp"), cover: formVal(f, "cover"), from: formVal(f, "from"), to: formVal(f, "to"), note: formVal(f, "note"),
    moveKRA: f.elements.moveKRA.checked, moveTasks: f.elements.moveTasks.checked, moveTickets: f.elements.moveTickets.checked, returnAtEnd: f.elements.returnAtEnd.checked };
  if (!form.emp || !form.cover || !form.from || !form.to) return toast("Fill employee, cover person and dates.", "warn");
  if (form.emp === form.cover) return toast("Cover person must be different.", "warn");
  if (form.from > form.to) return toast("To date must be after From date.", "warn");
  const ok = await confirmBox("Save leave cover?", `<b>${h(nameOf(form.emp))}</b>'s work will go to <b>${h(nameOf(form.cover))}</b> from <b>${fmtD(form.from)}</b> to <b>${fmtD(form.to)}</b>.${form.from <= S.data.today ? "<br><br>Work moves <b>right now</b> because the leave starts today." : ""}`, "Save");
  if (!ok) return;
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border me-2"></span>Saving…';
  try {
    const r = await api("createCover", { form }, { timeout: 300000 });
    toast(r.started ? "Leave cover started — work moved." : "Leave cover scheduled.");
    f.reset(); await sync(true);
  } catch (err) { toast(err.message, "err"); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check me-1"></i>Save leave cover'; }
});
ACT.coverEnd = async el => {
  const cancel = el.dataset.mode === "cancel";
  const ok = await confirmBox(cancel ? "Cancel this leave cover?" : "End leave cover now?", cancel ? "Nothing has moved yet. The cover will be cancelled." : "If 'return after leave' was on, unfinished delegation tasks and tickets go back to the employee.", cancel ? "Cancel cover" : "End now", "btn-danger");
  if (!ok) return;
  try { await api("endCover", { id: el.dataset.id, mode: el.dataset.mode }, { timeout: 300000 }); toast(cancel ? "Cancelled." : "Leave cover ended."); await sync(true); }
  catch (e) { toast(e.message, "err"); }
};

// ---------- Migration ----------
function adminMigrate() {
  const u = ui("admin"), r = u.mig;
  const table = res => `<div class="table-wrap mt-3"><table class="tablex compact"><thead><tr><th>Sheet</th><th>Old sheet rows</th><th>This sheet rows</th><th>New rows</th><th>Updated rows</th><th>Only in this sheet</th>${res.applied ? "<th>Removed</th>" : ""}<th>Status</th></tr></thead><tbody>
    ${res.report.map(x => `<tr><td class="fw-semibold">${h(x.sheet)}</td><td class="mono">${x.oldRows}</td><td class="mono">${x.curRows}</td><td class="mono ${x.newRows ? "text-success fw-bold" : ""}">${x.newRows}</td><td class="mono ${x.changedRows ? "text-primary fw-bold" : ""}">${x.changedRows}</td><td class="mono ${x.onlyInCurrent ? "text-warning fw-bold" : ""}">${x.onlyInCurrent}</td>${res.applied ? `<td class="mono">${x.removed}</td>` : ""}
      <td>${x.status === "ok" ? '<span class="chip chip-green">OK</span>' : x.status === "skip" ? '<span class="chip chip-slate">Skipped</span>' : '<span class="chip chip-red">Error</span>'} <span class="small text-muted">${h(x.note || "")}</span></td></tr>`).join("")}</tbody></table></div>`;
  return `<div class="cardx"><div class="cardx-head"><h3><i class="fas fa-database text-brand me-2"></i>Copy data from the old (live) sheet</h3></div><div class="cardx-body">
    <div class="info-box mb-3"><b>How it works:</b> rows are matched by their ID (column A). Rows that exist only in the old sheet are <b>added</b>. Rows whose values differ are <b>updated from the old sheet</b> (old sheet = live data). Extra columns of this sheet (like KPI <b>Description</b> in column H, TaskActivity, LeaveCover) are <b>never touched</b>. A full <b>backup copy</b> of this sheet is saved in your Drive before anything is written.</div>
    <label class="form-label">Old Google Sheet link *</label>
    <div class="d-flex gap-2 flex-wrap"><input class="form-control flex-grow-1" id="migUrl" style="min-width:260px" placeholder="https://docs.google.com/spreadsheets/d/…/edit" value="${h(u.migUrl || "")}">
      <button class="btn btn-ghost" data-act="migCheck" id="migCheckBtn"><i class="fas fa-magnifying-glass me-1"></i>1. Check (no changes)</button></div>
    ${r ? `${table(r)}
      ${r.applied ? `<div class="alert alert-success mt-3"><i class="fas fa-circle-check me-1"></i><b>Migration done.</b> Backup: <a href="${safeUrl(r.backupUrl)}" target="_blank" rel="noopener">open backup copy</a>. Press Refresh to load the data.</div>` : `
      <div class="mt-3 p-3 rounded-3" style="background:var(--amber-50)">
        <label class="form-check mb-2"><input class="form-check-input" type="checkbox" id="migRemove"> <b>Also remove rows that exist only in this sheet</b> <span class="small d-block">Use this to delete test data created in the copy. (${r.report.reduce((s, x) => s + x.onlyInCurrent, 0)} rows)</span></label>
        <button class="btn btn-danger" data-act="migApply"><i class="fas fa-database me-1"></i>2. Run migration now</button>
        <span class="small ms-2">Old: <b>${h(r.oldName)}</b> → This: <b>${h(r.currentName)}</b></span></div>`}` : ""}
    <div class="small text-muted mt-3"><i class="fas fa-lock me-1"></i>The Apps Script owner's Google account must have at least <b>view</b> access to the old sheet. The old sheet is only read, never changed.</div>
  </div></div>`;
}
ACT.migCheck = async el => {
  const u = ui("admin"); u.migUrl = $("#migUrl").value.trim();
  if (!u.migUrl) return toast("Paste the old sheet link.", "warn");
  el.disabled = true; el.innerHTML = '<span class="spinner-border me-2"></span>Checking… (can take a minute)';
  try { u.mig = await api("migrate", { url: u.migUrl, apply: false }, { timeout: 360000 }); rerender(true); }
  catch (e) { toast(e.message, "err"); el.disabled = false; el.innerHTML = '<i class="fas fa-magnifying-glass me-1"></i>1. Check (no changes)'; }
};
ACT.migApply = async el => {
  const u = ui("admin"), removeExtra = $("#migRemove").checked;
  const ok = await confirmBox("Run migration?", `Data from <b>${h(u.mig.oldName)}</b> will be written into <b>${h(u.mig.currentName)}</b>. A backup is made first.${removeExtra ? "<br><br><b class='text-danger'>Rows that exist only in this sheet will be deleted.</b>" : ""}`, "Yes, migrate", "btn-danger");
  if (!ok) return;
  el.disabled = true; el.innerHTML = '<span class="spinner-border me-2"></span>Migrating… don’t close this page';
  try { u.mig = await api("migrate", { url: u.migUrl, apply: true, removeExtra }, { timeout: 360000 }); toast("Migration complete."); rerender(true); sync(true); }
  catch (e) { toast(e.message, "err"); el.disabled = false; el.innerHTML = '<i class="fas fa-database me-1"></i>2. Run migration now'; }
};

// ---------- Launch emails ----------
function adminLaunch() {
  const u = ui("admin");
  if (!u.info && !u.infoLoading) { u.infoLoading = true; api("adminInfo").then(r => { u.info = r; u.infoLoading = false; if (S.route === "admin") rerender(true); }).catch(e => { u.infoLoading = false; toast(e.message, "err"); }); }
  const users = (S.data.users || []).filter(x => x.active);
  const info = u.info || {};
  const link = u.launchUrl || info.appUrl || (location.protocol === "https:" ? location.origin + "/" : "");
  return `<div class="row g-3"><div class="col-lg-7"><div class="cardx"><div class="cardx-head"><h3><i class="fas fa-rocket text-brand me-2"></i>Send “App is live” email with login details</h3></div><div class="cardx-body">
    <p class="small text-muted mb-3">Every active user gets their own email with the app link, their <b>Login ID</b> and <b>password</b> from the Users sheet, and how to add the app to their phone's home screen. The link is also saved for the “Open Dashboard” button in all emails.</p>
    <label class="form-label">App link (Netlify) *</label><input class="form-control" id="launchUrl" value="${h(link)}" placeholder="https://your-site.netlify.app" data-input="launchUrl">
    <div class="d-flex flex-wrap gap-2 mt-3">
      <button class="btn btn-ghost" data-act="launchSend" data-test="1"><i class="fas fa-flask me-1"></i>Send test to me only</button>
      <button class="btn btn-brand" data-act="launchSend"><i class="fas fa-paper-plane me-1"></i>Send to all ${users.length} users</button></div>
    ${u.launchResult ? `<div class="alert ${u.launchResult.failed.length ? "alert-warning" : "alert-success"} mt-3 small"><b>${u.launchResult.testOnly ? "Test email" : "Emails"} sent: ${u.launchResult.sent}</b>
      ${u.launchResult.skipped.length ? `<div class="mt-1">No password in Users sheet (skipped): ${u.launchResult.skipped.map(h).join(", ")}</div>` : ""}
      ${u.launchResult.failed.length ? `<div class="mt-1 text-danger">Failed: ${u.launchResult.failed.map(h).join(", ")}</div>` : ""}</div>` : ""}
  </div></div></div>
  <div class="col-lg-5"><div class="cardx"><div class="cardx-body">
    <div class="d-flex justify-content-between small mb-2"><span class="text-muted">Email quota left today</span><b>${info.quota ?? "…"}</b></div>
    <div class="d-flex justify-content-between small mb-2"><span class="text-muted">Active users</span><b>${users.length}</b></div>
    <div class="d-flex justify-content-between small mb-2"><span class="text-muted">Saved app link</span><b class="text-truncate ms-2">${h(info.appUrl || "—")}</b></div>
    <div class="d-flex justify-content-between small"><span class="text-muted">Backend sheet</span>${info.sheetUrl ? `<a class="text-truncate ms-2" href="${safeUrl(info.sheetUrl)}" target="_blank" rel="noopener">${h(info.sheetName)}</a>` : "…"}</div>
    <hr><div class="small text-muted"><i class="fas fa-triangle-exclamation text-warning me-1"></i>Run the <b>migration first</b> so passwords and users are the latest, then send this email once.</div>
  </div></div></div></div>`;
}
ON_INPUT.launchUrl = el => { ui("admin").launchUrl = el.value.trim(); };
ACT.launchSend = async el => {
  const u = ui("admin"), test = Boolean(el.dataset.test), url = $("#launchUrl").value.trim();
  if (!/^https:\/\//i.test(url)) return toast("Enter the full link starting with https://", "warn");
  if (!test) {
    const ok = await confirmBox("Send login emails to everyone?", `Each of the <b>${(S.data.users || []).filter(x => x.active).length}</b> active users gets an email with <b>${h(url)}</b>, their login ID and password.`, "Send to all");
    if (!ok) return;
  }
  const old = el.innerHTML; el.disabled = true; el.innerHTML = '<span class="spinner-border me-2"></span>Sending…';
  try { u.launchResult = await api("launchEmails", { appUrl: url, testOnly: test }, { timeout: 300000 }); u.info = null; toast(test ? "Test email sent to you." : "Emails sent."); rerender(true); }
  catch (e) { toast(e.message, "err"); }
  finally { el.disabled = false; el.innerHTML = old; }
};
