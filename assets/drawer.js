/* ============ task drawer: details + chat history + actions ============ */
let drawer = null, drawerTaskId = "";

// Fast refresh of a single task + its chat (used after sending and every 15 s while open).
let threadBusy = false;
async function refreshThread(id, force) {
  if (threadBusy && !force) return;
  threadBusy = true;
  try {
    const r = await api("taskActivity", { id }, { timeout: 30000 });
    const key = String(id);
    const before = (S.idx.activity.get(key) || []).map(a => a[0]).join(",") + "|" + (S.idx.taskById.get(key) || [])[6];
    S.data.activity = S.data.activity.filter(a => String(a[1]) !== key).concat(r.activity || []);
    if (r.task) { const i = S.data.tasks.findIndex(t => String(t[0]) === key); if (i >= 0) S.data.tasks[i] = r.task; }
    S.idx = buildIndex(S.data);
    const after = (S.idx.activity.get(key) || []).map(a => a[0]).join(",") + "|" + (S.idx.taskById.get(key) || [])[6];
    if (before !== after) {
      if (drawerTaskId === key) {
        const b = $("#drawerBody"), nearBottom = b.scrollHeight - b.scrollTop - b.clientHeight < 120;
        if (before.split("|")[1] === after.split("|")[1]) { // only new messages: keep the composer as it is
          b.innerHTML = chatHtml(S.idx.taskById.get(key));
          if (nearBottom) b.scrollTop = b.scrollHeight;
        } else {
          const typing = $("#chatText") ? $("#chatText").value : "";
          renderDrawer(nearBottom);
          if ($("#chatText") && typing) $("#chatText").value = typing;
        }
      }
      rerender();
    }
  } catch (e) { /* silent: next poll will retry */ }
  finally { threadBusy = false; }
}
setInterval(() => { if (drawerTaskId && document.visibilityState === "visible") refreshThread(drawerTaskId); }, 15000);

function openTask(id) {
  const t = S.idx.taskById.get(String(id));
  if (!t) return toast("Task not found. Refresh the data.", "warn");
  drawerTaskId = String(id);
  drawer = drawer || new bootstrap.Offcanvas($("#taskDrawer"));
  renderDrawer(true);
  drawer.show();
  refreshThread(drawerTaskId); // pull the latest messages in the background
}
ACT.openTask = el => openTask(el.dataset.id);
$("#taskDrawer").addEventListener("hidden.bs.offcanvas", () => { drawerTaskId = ""; });

function renderDrawer(scroll) {
  if (!drawerTaskId) return;
  const t = S.idx.taskById.get(drawerTaskId);
  if (!t) return;
  const open = workIsOpen(t[6]);
  const long = String(t[3] || "").length > 140;
  $("#drawerHead").innerHTML = `
    <div class="dh-top">${avatar(t[1], "lg")}
      <div class="min-w-0 flex-grow-1">
        <div class="dh-route"><span class="fw-bold">${h(nameOf(t[1]))}</span><i class="fas fa-arrow-right-long mx-2"></i><span class="fw-bold">${h(nameOf(t[2]))}</span></div>
        <div class="d-flex flex-wrap gap-1 mt-1">${statusChip(t[6])}${prioChip(t[5])}</div>
      </div></div>`;
  $("#drawerMeta").innerHTML = `
    <div class="task-brief ${long ? "collapsed" : ""}" id="taskBrief">
      <div class="tb-label"><i class="fas fa-thumbtack me-1"></i>Task</div>
      <div class="tb-text" id="drawerTitle">${linkify(t[3])}</div>
      ${long ? `<button type="button" class="tb-more" data-act="briefToggle">Show full task</button>` : ""}
      ${t[10] ? `<a class="att mt-2" href="${safeUrl(t[10])}" target="_blank" rel="noopener"><i class="fas fa-paperclip"></i>Task attachment</a>` : ""}
    </div>
    <div class="meta-strip">
      <div><span class="k">Created</span><span>${fmtD(t[9])}</span></div>
      <div><span class="k">Deadline</span><span class="fw-bold">${fmtD(t[4])}</span></div>
      <div><span class="k">Status</span><span>${open && !isAwaiting(t[6]) ? dueInfo(t[4], true) : t[6] === "Extension Requested" ? '<span class="due amber">Extension awaiting review</span>' : t[6] === "Submitted" ? '<span class="due" style="color:var(--violet)">Waiting for approval</span>' : t[12] ? "Closed " + fmtShort(t[12]) : statusChip(t[6])}</span></div>
    </div>`;
  $("#drawerBody").innerHTML = chatHtml(t);
  $("#drawerFoot").innerHTML = drawerFooter(t);
  if (scroll) requestAnimationFrame(() => { const b = $("#drawerBody"); b.scrollTop = b.scrollHeight; });
}
ACT.briefToggle = el => { const b = $("#taskBrief"); b.classList.toggle("collapsed"); el.textContent = b.classList.contains("collapsed") ? "Show full task" : "Show less"; };

function chatHtml(t) {
  const events = taskEvents(t);
  let lastDay = null, prevActor = null, html = "";
  events.forEach(e => {
    // Old entries without a time stay under the previous date (they happened after it).
    const day = d10(e.ts) || (lastDay === null ? "unknown" : lastDay);
    if (day !== lastDay) {
      html += `<div class="day-sep"><span>${day === "unknown" ? "Earlier · time not recorded" : h(relDay(day))}</span></div>`;
      lastDay = day; prevActor = null;
    }
    const out = eventHtml(e, t, prevActor);
    html += out.html;
    prevActor = out.bubble ? ek(e.actor) : null;
  });
  return html || empty("No history yet", "comments");
}

function attHtml(url) {
  if (!url) return "";
  if (url === "#uploading") return `<div class="att"><span class="spinner-border spinner-border-sm"></span>Uploading file…</div>`;
  return `<a class="att" href="${safeUrl(url)}" target="_blank" rel="noopener"><span class="att-ic"><i class="fas fa-file-arrow-down"></i></span><span>Open attachment<br><small class="text-muted fw-normal">Google Drive</small></span></a>`;
}

function eventHtml(e, t, prevActor) {
  const L = EVENT_LABEL[e.type] || EVENT_LABEL.note;
  const time = fmtTime(e.ts);
  const meta = e.meta || {};
  const who = h(nameOf(e.actor));
  const pill = (cls, text, extra = "") => ({ bubble: false, html: `<div class="ev-pill ${cls}"><i class="fas ${L.icon}"></i><span>${text}${time ? `<span class="t">· ${time}</span>` : ""}</span>${extra}</div>` });
  // System events are compact centred pills.
  if (e.type === "reassigned") return pill("", h(e.message || "Task reassigned"));
  if (e.type === "created") return pill("brand", `<b>${who}</b> assigned this task${meta.due ? ` · due <b>${fmtD(meta.due)}</b>` : ""}`, e.attachment ? attHtml(e.attachment) : "");
  if (!e.message && !e.attachment) {
    if (e.type === "approved") return pill("green", `<b>${who}</b> approved the task`);
    if (e.type === "submitted") return pill("violet", `<b>${who}</b> submitted the work`);
    if (e.type === "extension_approved") return pill("green", `Extension approved${meta.newDue ? ` · new deadline <b>${fmtD(meta.newDue)}</b>` : ""}`);
    if (e.type === "reopened") return pill("red", `<b>${who}</b> reopened the task${meta.newDue ? ` · new deadline <b>${fmtD(meta.newDue)}</b>` : ""}`);
  }
  let tag = "";
  if (e.type === "extension_requested") tag = `Extension request${meta.newDue ? ` · ${meta.oldDue ? fmtShort(meta.oldDue) + " → " : "to "}<b>${fmtD(meta.newDue)}</b>` : ""}`;
  else if (e.type === "extension_approved") tag = `Extension approved${meta.newDue ? ` · <b>${fmtD(meta.newDue)}</b>` : ""}`;
  else if (e.type === "reopened") tag = `Reopened${meta.newDue ? ` · new deadline <b>${fmtD(meta.newDue)}</b>` : ""}`;
  else if (e.type !== "comment") tag = L.text;
  const mine = e.actor && ek(e.actor) === me();
  const cont = prevActor && prevActor === ek(e.actor);
  return { bubble: true, html: `<div class="msg ${mine ? "me" : "other"} ${cont ? "cont" : ""}">
    ${!mine ? `<div class="msg-av">${cont || !e.actor ? "" : avatar(e.actor, "sm")}</div>` : ""}
    <div class="bubble">
      ${!mine && !cont && e.actor ? `<div class="who" style="color:hsl(${hue(ek(e.actor))} 55% 40%)">${who}</div>` : ""}
      ${tag ? `<div class="tag ${L.cls}"><i class="fas ${L.icon}"></i><span>${tag}</span></div>` : ""}
      ${e.message ? `<div class="txt">${linkify(e.message)}</div>` : ""}
      ${attHtml(e.attachment)}
      <div class="tm">${time}${mine ? (String(e.id || "").startsWith("LOCAL") ? ' <i class="far fa-clock"></i>' : ' <i class="fas fa-check-double"></i>') : ""}</div>
    </div></div>` };
}

function drawerFooter(t) {
  const id = h(t[0]);
  const mine = ek(t[2]) === me();
  const reviewer = canReview(t);
  const st = t[6];
  const btns = [];
  if (mine && workIsOpen(st) && st !== "Submitted") {
    if (st !== "Extension Requested") btns.push(`<button class="btn btn-ghost btn-sm" data-act="extReq" data-id="${id}"><i class="fas fa-calendar-plus me-1"></i>Request extension</button>`);
    btns.push(`<button class="btn btn-brand btn-sm" data-act="submitTask" data-id="${id}"><i class="fas fa-paper-plane me-1"></i>Submit work</button>`);
  }
  if (reviewer && st === "Submitted") {
    btns.push(`<button class="btn btn-danger-soft btn-sm" data-act="reopenTask" data-id="${id}"><i class="fas fa-rotate-left me-1"></i>Reopen</button>`);
    btns.push(`<button class="btn btn-success btn-sm" data-act="approveTask" data-id="${id}"><i class="fas fa-check me-1"></i>Approve & close</button>`);
  }
  if (reviewer && st === "Extension Requested") {
    btns.push(`<button class="btn btn-danger-soft btn-sm" data-act="extDecide" data-d="reject" data-id="${id}"><i class="fas fa-xmark me-1"></i>Reject extension</button>`);
    btns.push(`<button class="btn btn-success btn-sm" data-act="extDecide" data-d="approve" data-id="${id}"><i class="fas fa-calendar-check me-1"></i>Accept extension</button>`);
  }
  if ((reviewer || isAdmin()) && st === "Approved" && !mine) btns.push(`<button class="btn btn-danger-soft btn-sm" data-act="fakeTask" data-id="${id}"><i class="fas fa-ban me-1"></i>Mark fake</button>`);
  const canChat = mine || reviewer || isAdmin();
  return (btns.length ? `<div class="drawer-actions">${btns.join("")}</div>` : "") + (canChat ? `
    <div id="chatPreview" class="chat-preview d-none"></div>
    <form class="composer" id="composer" data-id="${id}">
      <div class="composer-box">
        <button type="button" class="cbtn" title="Attach file" data-act="chatBrowse"><i class="fas fa-paperclip"></i></button>
        <button type="button" class="cbtn" title="Paste screenshot (or press Ctrl+V)" data-act="chatPaste"><i class="fas fa-camera"></i></button>
        <input type="file" id="chatFile" class="d-none" data-change="chatFile">
        <textarea id="chatText" rows="1" placeholder="Message… (Ctrl+V to paste a screenshot)" data-input="autogrow"></textarea>
      </div>
      <button class="send-btn" type="submit" title="Send"><i class="fas fa-paper-plane"></i></button>
    </form>` : "");
}
ON_INPUT.autogrow = el => { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; };
ACT.chatBrowse = () => $("#chatFile").click();
ACT.chatPaste = async () => {
  try {
    const items = await navigator.clipboard.read();
    for (const it of items) { const type = it.types.find(x => x.startsWith("image/")); if (type) return setInputFile($("#chatFile"), shotFile(await it.getType(type))); }
    toast("No screenshot in clipboard. Take one (Win+Shift+S) and try again.", "warn");
  } catch (e) { toast("Click in the message box and press Ctrl+V.", "warn"); $("#chatText")?.focus(); }
};
ON_CHANGE.chatFile = el => {
  const n = $("#chatPreview"), f = el.files[0];
  n.classList.toggle("d-none", !f);
  n.innerHTML = f ? previewHtml(f).replace('data-act="attachClear"', 'data-act="clearChatFile"') : "";
};
ACT.clearChatFile = () => { $("#chatFile").value = ""; ON_CHANGE.chatFile($("#chatFile")); };
document.addEventListener("keydown", e => {
  if (e.target.id === "chatText" && e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 768px)").matches) { e.preventDefault(); $("#composer").requestSubmit(); }
});
document.addEventListener("submit", async e => {
  if (e.target.id !== "composer") return;
  e.preventDefault();
  const form = e.target, id = form.dataset.id, text = $("#chatText").value.trim(), input = $("#chatFile");
  if (!text && !input.files.length) return;
  const btn = form.querySelector(".send-btn"); btn.disabled = true;
  try {
    const file = await readFile(input);
    patchTask(id, {}, { type: "comment", message: text, attachment: file ? "#uploading" : "" });
    $("#chatText").value = ""; $("#chatText").style.height = "auto"; ACT.clearChatFile();
    renderDrawer(true);
    btn.disabled = false; $("#chatText").focus();
    await api("addComment", { id, message: text, file });
    await refreshThread(id, true); // only this chat — no full reload
  } catch (err) { toast(err.message, "err"); refreshThread(id, true); }
  finally { btn.disabled = false; }
});

// ---------- shared task actions (used by cards and drawer) ----------
function afterAction(msg) {
  if (msg) toast(msg);
  rerender(true); renderDrawer(false);
  sync(true); // quietly reload real data from the sheet
}
function taskLine(t) { return `<div class="info-box mb-3"><div class="fw-semibold">${h(t[3])}</div><div class="small text-muted mt-1">${person(t[2])} · Due ${fmtD(t[4])}</div></div>`; }

ACT.submitTask = el => {
  const t = S.idx.taskById.get(el.dataset.id);
  dialog({
    title: '<i class="fas fa-paper-plane text-brand me-2"></i>Submit work', submit: "Submit work",
    body: taskLine(t) + `<label class="form-label">What did you do? *</label><textarea class="form-control" name="remarks" rows="4" required placeholder="Write a short update for the reviewer"></textarea>` + fileField(),
    onSubmit: async f => {
      const remarks = formVal(f, "remarks"); need(remarks, "Remarks are mandatory.");
      const file = await readFile(f.elements.file);
      await api("submitWork", { type: "task", id: t[0], file, remarks });
      patchTask(t[0], { 6: "Submitted", 11: nowStamp(), 8: appendRemark(t, "Emp (Submit): " + remarks) }, { type: "submitted", message: remarks, meta: { remark: 1 }, attachment: file ? "#uploading" : "" });
      afterAction("Work submitted for approval.");
    }
  });
};
ACT.extReq = el => {
  const t = S.idx.taskById.get(el.dataset.id);
  dialog({
    title: '<i class="fas fa-calendar-plus text-warning me-2"></i>Request deadline extension', submit: "Send request", submitClass: "btn-warning",
    body: taskLine(t) + `<div class="row g-2"><div class="col-6"><label class="form-label">Current deadline</label><input class="form-control" value="${h(fmtD(t[4]))}" disabled></div>
      <div class="col-6"><label class="form-label">New date *</label><input type="date" class="form-control" name="date" min="${h(S.data.today)}" required></div></div>
      <label class="form-label mt-3">Reason *</label><textarea class="form-control" name="reason" rows="3" required></textarea>`,
    onSubmit: async f => {
      const date = formVal(f, "date"), reason = formVal(f, "reason"); need(date && reason, "Enter the new date and a reason.");
      await api("requestExtension", { id: t[0], newDate: date, reason });
      patchTask(t[0], { 6: "Extension Requested", 8: appendRemark(t, "Emp (Ext Req): " + date + " - " + reason) }, { type: "extension_requested", message: reason, meta: { remark: 1, oldDue: d10(t[4]), newDue: date } });
      afterAction("Extension request sent.");
    }
  });
};
ACT.approveTask = async el => {
  const t = S.idx.taskById.get(el.dataset.id);
  dialog({
    title: '<i class="fas fa-circle-check text-success me-2"></i>Approve & close task', submit: "Approve", submitClass: "btn-success",
    body: taskLine(t) + `<label class="form-label">Remarks (optional)</label><textarea class="form-control" name="remarks" rows="2" placeholder="e.g. Good work"></textarea>`,
    onSubmit: async f => {
      const remarks = formVal(f, "remarks");
      await api("taskAction", { id: t[0], action: "Approved", remarks, newDate: "" });
      patchTask(t[0], { 6: "Approved", 12: nowStamp(), ...(remarks ? { 8: appendRemark(t, "Admin (Approved): " + remarks) } : {}) }, { type: "approved", message: remarks, meta: { remark: remarks ? 1 : 0 } });
      afterAction("Task approved.");
    }
  });
};
ACT.reopenTask = el => {
  const t = S.idx.taskById.get(el.dataset.id);
  dialog({
    title: '<i class="fas fa-rotate-left text-danger me-2"></i>Reopen task', submit: "Reopen", submitClass: "btn-danger",
    body: taskLine(t) + `<label class="form-label">New deadline *</label><input type="date" class="form-control" name="date" value="${h(d10(t[4]) >= S.data.today ? d10(t[4]) : "")}" required>
      <label class="form-label mt-3">What needs to change? *</label><textarea class="form-control" name="remarks" rows="3" required></textarea>`,
    onSubmit: async f => {
      const date = formVal(f, "date"), remarks = formVal(f, "remarks"); need(date && remarks, "Date and reason are mandatory.");
      await api("taskAction", { id: t[0], action: "Reopened", remarks, newDate: date });
      patchTask(t[0], { 6: "Reopened", 4: date, 13: nowStamp(), 8: appendRemark(t, "Admin (Reopened): " + remarks) }, { type: "reopened", message: remarks, meta: { remark: 1, newDue: date } });
      afterAction("Task reopened.");
    }
  });
};
ACT.extDecide = el => {
  const t = S.idx.taskById.get(el.dataset.id), approve = el.dataset.d === "approve";
  const asked = requestedExtDate(t);
  const lastReq = taskEvents(t).filter(e => e.type === "extension_requested").pop();
  dialog({
    title: approve ? '<i class="fas fa-calendar-check text-success me-2"></i>Accept extension' : '<i class="fas fa-calendar-xmark text-danger me-2"></i>Reject extension',
    submit: approve ? "Accept & set date" : "Reject request", submitClass: approve ? "btn-success" : "btn-danger",
    body: taskLine(t) + `<div class="info-box mb-3"><div><b>Current deadline:</b> ${fmtD(t[4])}</div><div><b>Requested:</b> ${asked ? fmtD(asked) : "—"}</div>${lastReq?.message ? `<div class="mt-1"><b>Reason:</b> ${h(lastReq.message)}</div>` : ""}</div>` +
      (approve ? `<label class="form-label">New deadline *</label><input type="date" class="form-control" name="date" value="${h(asked)}" required>
        <label class="form-label mt-3">Remarks (optional)</label><textarea class="form-control" name="remarks" rows="2"></textarea>`
        : `<div class="small text-muted mb-2">The deadline stays <b>${fmtD(t[4])}</b> and the task goes back to Pending.</div><label class="form-label">Reason *</label><textarea class="form-control" name="remarks" rows="3" required></textarea>`),
    onSubmit: async f => {
      const date = formVal(f, "date"), remarks = formVal(f, "remarks");
      if (approve) need(date, "Choose the new deadline."); else need(remarks, "Write a reason.");
      await api("extensionDecision", { id: t[0], decision: approve ? "approve" : "reject", newDate: date, remarks });
      patchTask(t[0], { 6: "Pending", ...(approve ? { 4: date } : {}), 8: appendRemark(t, approve ? "Admin (Extension Approved): " + date : "Admin (Extension Rejected): " + remarks) },
        { type: approve ? "extension_approved" : "extension_rejected", message: remarks, meta: { remark: 1, oldDue: d10(t[4]), newDue: approve ? date : d10(t[4]) } });
      afterAction(approve ? "Extension accepted." : "Extension rejected.");
    }
  });
};
ACT.fakeTask = el => {
  const t = S.idx.taskById.get(el.dataset.id);
  dialog({
    title: '<i class="fas fa-ban text-danger me-2"></i>Mark task as fake', submit: "Apply penalty", submitClass: "btn-danger",
    body: taskLine(t) + `<div class="alert alert-danger small py-2">The task becomes <b>Rejected</b> and −1 point is applied to the score. The employee gets an email.</div><label class="form-label">Reason *</label><textarea class="form-control" name="reason" rows="3" required></textarea>`,
    onSubmit: async f => {
      const reason = formVal(f, "reason"); need(reason, "Reason is mandatory.");
      await api("markTaskFake", { id: t[0], reason });
      patchTask(t[0], { 6: "Rejected", 8: appendRemark(t, "Admin Penalty: Marked Fake (" + reason + ")") }, { type: "fake", message: reason, meta: { remark: 1 } });
      afterAction("Penalty applied.");
    }
  });
};
ACT.fakeKra = el => {
  const id = el.dataset.id;
  const k = S.data.kraTasks.find(r => String(r[0]) === id);
  dialog({
    title: '<i class="fas fa-ban text-danger me-2"></i>Mark KRA as fake', submit: "Apply penalty", submitClass: "btn-danger",
    body: `<div class="info-box mb-3"><div class="fw-semibold">${h(k ? k[3] : id)}</div>${k ? `<div class="small text-muted mt-1">${person(k[2])} · ${fmtD(k[4])} · done ${fmtDT(k[8])}</div>` : ""}</div>
      <div class="alert alert-danger small py-2">The KRA becomes <b>Rejected</b> and −1 point is applied to the score.</div><label class="form-label">Reason *</label><textarea class="form-control" name="reason" rows="3" required></textarea>`,
    onSubmit: async f => {
      const reason = formVal(f, "reason"); need(reason, "Reason is mandatory.");
      await api("markKRAFake", { id, reason });
      if (k) { k[5] = "Rejected"; k[7] = (k[7] ? k[7] + " | " : "") + "Admin Penalty: Marked Fake (" + reason + ")"; S.idx = buildIndex(S.data); }
      afterAction("Penalty applied.");
    }
  });
};
