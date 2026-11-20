/* ============ real-time: chat outbox, live polling, notification bell ============ */
const RT = { since: 0, busy: false, timer: 0, seenKey: "", lastFresh: [] };

// ---------- chat outbox (WhatsApp-like: shows instantly, survives refresh, safe retry) ----------
const OUT = { list: [] };
const outKey = () => "tm_outbox_" + me();
function outboxLoad() { try { OUT.list = JSON.parse(localStorage.getItem(outKey()) || "[]"); } catch (e) { OUT.list = []; } }
function outboxSave() { try { localStorage.setItem(outKey(), JSON.stringify(OUT.list.map(x => ({ ...x, file: undefined })))); } catch (e) {} }
function newCid() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function sendChat(taskId, text, file) {
  const item = { cid: newCid(), taskId: String(taskId), text, ts: nowStamp(), state: "sending", hasFile: Boolean(file), fileName: file ? file.name : "", file };
  OUT.list.push(item); outboxSave();
  paintChat(taskId, true);
  deliver(item);
}
async function deliver(item) {
  item.state = "sending"; item.error = ""; outboxSave(); paintChat(item.taskId);
  try {
    const r = await api("addComment", { id: item.taskId, message: item.text, file: item.file || null, cid: item.cid }, { timeout: 90000 });
    OUT.list = OUT.list.filter(x => x.cid !== item.cid); outboxSave();
    if (r.row) mergeUpdates([r.row], [], []);
    paintChat(item.taskId, true);
  } catch (e) {
    item.state = "failed"; item.error = e.message; outboxSave(); paintChat(item.taskId);
  }
}
ACT.chatRetry = el => { const it = OUT.list.find(x => x.cid === el.dataset.cid); if (it) deliver(it); };
ACT.chatDiscard = el => { const it = OUT.list.find(x => x.cid === el.dataset.cid); OUT.list = OUT.list.filter(x => x.cid !== el.dataset.cid); outboxSave(); if (it) paintChat(it.taskId); };
function outboxHtml(taskId) {
  return OUT.list.filter(x => x.taskId === String(taskId)).map(x => `<div class="msg me pending ${x.state}">
    <div class="bubble">
      ${x.text ? `<div class="txt">${linkify(x.text)}</div>` : ""}
      ${x.hasFile ? `<div class="att"><i class="fas fa-paperclip"></i>${h(x.fileName)}${!x.file ? ' <span class="small text-danger">(re-attach after refresh)</span>' : ""}</div>` : ""}
      <div class="tm">${fmtTime(x.ts)} ${x.state === "sending" ? '<span class="sending"><i class="fas fa-circle-notch fa-spin"></i> Sending…</span>'
        : `<span class="text-danger fw-semibold"><i class="fas fa-circle-exclamation"></i> Not sent</span> <a href="#" data-act="chatRetry" data-cid="${h(x.cid)}">Retry</a> · <a href="#" data-act="chatDiscard" data-cid="${h(x.cid)}">Delete</a>`}</div>
    </div></div>`).join("");
}
// add pending messages to the chat view
const _chatHtml = chatHtml;
chatHtml = function (t) { return _chatHtml(t) + outboxHtml(t[0]); };
function paintChat(taskId, scroll) {
  if (drawerTaskId !== String(taskId)) return;
  const b = $("#drawerBody"); if (!b) return;
  const near = b.scrollHeight - b.scrollTop - b.clientHeight < 140;
  b.innerHTML = chatHtml(S.idx.taskById.get(String(taskId)));
  if (scroll || near) b.scrollTop = b.scrollHeight;
}

// ---------- merge live updates into local data ----------
let saveT = 0;
function saveCacheSoon() { clearTimeout(saveT); saveT = setTimeout(() => { if (S.data) Cache.set("data:" + ek(S.data.user.email), { data: S.data, at: S.lastSync }); }, 1500); }
function mergeUpdates(rows = [], tasks = [], tickets = []) {
  const have = new Set(S.data.activity.map(a => a[0]));
  const fresh = rows.filter(r => r && !have.has(r[0]));
  if (fresh.length) {
    const touched = new Set(fresh.map(r => String(r[1])));
    S.data.activity = S.data.activity.filter(a => !(String(a[0]).startsWith("LOCAL") && touched.has(String(a[1])))).concat(fresh);
  }
  let changedStatus = false;
  tasks.forEach(t => { const i = S.data.tasks.findIndex(x => String(x[0]) === String(t[0])); if (i >= 0) { if (S.data.tasks[i][6] !== t[6]) changedStatus = true; S.data.tasks[i] = t; } else { S.data.tasks.push(t); changedStatus = true; } });
  tickets.forEach(t => { const i = S.data.tickets.findIndex(x => String(x[0]) === String(t[0])); if (i >= 0) { if (S.data.tickets[i][6] !== t[6]) changedStatus = true; S.data.tickets[i] = t; } else { S.data.tickets.push(t); changedStatus = true; } });
  if (fresh.length || tasks.length || tickets.length) { S.idx = buildIndex(S.data); saveCacheSoon(); }
  return { fresh, changedStatus };
}

// ---------- polling ----------
function pollDelay() {
  if (document.visibilityState !== "visible") return 45000;
  if (drawerTaskId) return 4000;           // chat open: near real-time
  return 15000;
}
function schedulePoll(ms) { clearTimeout(RT.timer); RT.timer = setTimeout(pollOnce, ms == null ? pollDelay() : ms); }
async function pollOnce() {
  if (!S.data || !S.token) return schedulePoll(20000);
  if (RT.busy) return schedulePoll();
  RT.busy = true;
  try {
    const r = await api("poll", { since: RT.since || S.data.serverTime || 0 }, { timeout: 30000 });
    RT.since = r.serverTime;
    const { fresh, changedStatus } = mergeUpdates(r.rows, r.tasks, r.tickets);
    if (fresh.length || changedStatus) {
      const affected = new Set(fresh.map(x => String(x[1])).concat((r.tasks || []).map(t => String(t[0]))));
      if (drawerTaskId && affected.has(drawerTaskId)) {
        const tstat = (r.tasks || []).find(t => String(t[0]) === drawerTaskId);
        if (tstat) { const b = $("#drawerBody"); const near = b && b.scrollHeight - b.scrollTop - b.clientHeight < 140; const typing = $("#chatText")?.value || ""; renderDrawer(near); if (typing && $("#chatText")) $("#chatText").value = typing; }
        else paintChat(drawerTaskId);
      }
      rerender();
      announce(fresh);
    }
  } catch (e) { /* network hiccup: try again later */ }
  finally { RT.busy = false; schedulePoll(); }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedulePoll(300); });
window.addEventListener("online", () => { OUT.list.filter(x => x.state === "failed").forEach(deliver); schedulePoll(300); });
$("#taskDrawer").addEventListener("shown.bs.offcanvas", () => schedulePoll(1500));

// ---------- notifications ----------
function isTicketId(id) { return /^TCK-/.test(String(id)); }
// Only what matters to ME: events by others, on my own tasks/tickets, and only the event types meant for my role.
const FOR_ASSIGNEE = new Set(["comment", "created", "approved", "reopened", "extension_approved", "extension_rejected", "rejected", "cancelled", "fake", "reassigned"]);
const FOR_ASSIGNER = new Set(["comment", "submitted", "extension_requested"]);
function relevantRow(a) {
  if (!a || ek(a[3]) === me()) return false;
  const id = String(a[1]), type = String(a[4]);
  if (isTicketId(id)) {
    const t = S.data.tickets.find(x => String(x[0]) === id); if (!t) return false;
    if (ek(t[3]) === me()) return type === "ticket_created" || type === "ticket_reopened";
    if (ek(t[1]) === me()) return type === "ticket_resolved";
    return false;
  }
  const t = S.idx.taskById.get(id); if (!t) return false;
  if (ek(t[2]) === me() && FOR_ASSIGNEE.has(type)) return true;
  if (ek(t[1]) === me() && FOR_ASSIGNER.has(type)) return true;
  if (type === "reassigned") { const m = actMeta(a); return ek(m.to) === me() || ek(m.from) === me(); }
  return false;
}
function notifText(a) {
  const who = nameOf(a[3]), m = actMeta(a), msg = String(a[5] || "");
  const map = {
    comment: `💬 ${msg || "sent an attachment"}`, created: "assigned you a new task", submitted: "submitted work for your approval",
    approved: "approved your task ✅", reopened: "reopened your task", extension_requested: `asked for an extension${m.newDue ? " to " + fmtD(m.newDue) : ""}`,
    extension_approved: `approved your extension${m.newDue ? " · new deadline " + fmtD(m.newDue) : ""}`, extension_rejected: "rejected your extension request",
    rejected: "rejected your work (−1)", cancelled: "cancelled the task", fake: "marked your task as fake (−1)", reassigned: msg || "reassigned a task",
    ticket_created: "raised a help ticket for you", ticket_resolved: "resolved your help ticket ✅", ticket_reopened: "reopened your help ticket"
  };
  return { who, text: map[a[4]] || msg || a[4] };
}
function itemTitle(a) {
  const id = String(a[1]);
  if (isTicketId(id)) { const t = S.data.tickets.find(x => String(x[0]) === id); return t ? "Ticket: " + t[4] : "Help ticket"; }
  const t = S.idx.taskById.get(id); return t ? t[3] : "Task";
}
function seenKey() { return "tm_seen_" + me(); }
function lastSeen() { const v = localStorage.getItem(seenKey()); if (v) return v; const d = addDays(S.data.today, -3) + "T00:00:00"; localStorage.setItem(seenKey(), d); return d; }
function notifications() {
  return S.data.activity.filter(relevantRow).sort((a, b) => String(b[2]).localeCompare(String(a[2]))).slice(0, 40);
}
function unreadCount() { const ls = lastSeen(); return notifications().filter(a => String(a[2]) > ls).length; }
function renderBell() {
  if (!S.data) return;
  const n = unreadCount();
  const dot = $("#bellDot"); if (dot) { dot.textContent = n > 99 ? "99+" : n; dot.classList.toggle("d-none", !n); }
  document.title = (n ? `(${n}) ` : "") + document.title.replace(/^\(\d+\+?\)\s*/, "");
  if ($("#bellPanel").classList.contains("open")) paintBellPanel();
}
function paintBellPanel() {
  const ls = lastSeen(), list = notifications();
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  $("#bellPanel").innerHTML = `<div class="bp-head"><b>Notifications</b><div class="ms-auto d-flex gap-2">${perm === "default" ? `<button class="btn btn-soft btn-xs" data-act="enableAlerts"><i class="fas fa-desktop me-1"></i>Desktop alerts</button>` : ""}<button class="btn btn-ghost btn-xs" data-act="markRead">Mark all read</button></div></div>
    <div class="bp-list">${list.map(a => { const n = notifText(a); return `<button type="button" class="bp-item ${String(a[2]) > ls ? "unread" : ""}" data-act="notifOpen" data-id="${h(a[1])}">
      ${avatar(a[3], "sm")}<span class="min-w-0 flex-grow-1 text-start"><span class="d-block"><b>${h(n.who)}</b> ${h(n.text)}</span><span class="d-block small-2 text-muted text-truncate">${h(itemTitle(a))}</span></span><span class="small-2 text-muted text-nowrap">${h(ago(a[2]))}</span></button>`; }).join("") || `<div class="p-4 text-center text-muted small">No notifications yet</div>`}</div>`;
}
function ago(stamp) {
  const d = parseLocal(stamp); if (!d) return "";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  return m < 1 ? "now" : m < 60 ? m + "m" : m < 1440 ? Math.round(m / 60) + "h" : fmtShort(stamp);
}
ACT.bell = () => { const p = $("#bellPanel"); p.classList.toggle("open"); if (p.classList.contains("open")) paintBellPanel(); };
ACT.markRead = () => { localStorage.setItem(seenKey(), nowStamp()); renderBell(); paintBellPanel(); };
ACT.enableAlerts = async () => { try { await Notification.requestPermission(); } catch (e) {} paintBellPanel(); };
ACT.notifOpen = el => {
  $("#bellPanel").classList.remove("open");
  const id = el.dataset.id;
  if (isTicketId(id)) { const t = S.data.tickets.find(x => String(x[0]) === id); location.hash = "#/tickets?tab=" + (t && ek(t[3]) === me() ? "resolve" : "raised"); }
  else openTask(id);
};
document.addEventListener("click", e => { const p = $("#bellPanel"); if (p && p.classList.contains("open") && !e.target.closest("#bellPanel, [data-act=bell]")) p.classList.remove("open"); });

// pop-up for new events (and a desktop notification when the tab is in the background)
function announce(fresh) {
  const rel = fresh.filter(relevantRow);
  renderBell();
  rel.slice(-3).forEach(a => {
    const n = notifText(a), id = String(a[1]);
    if (drawerTaskId === id && document.visibilityState === "visible") return; // already looking at it
    const el = document.createElement("div");
    el.className = "msg-toast";
    el.innerHTML = `${avatar(a[3])}<div class="min-w-0 flex-grow-1"><div><b>${h(n.who)}</b> ${h(n.text).slice(0, 140)}</div><div class="small-2 text-muted text-truncate">${h(itemTitle(a))}</div></div><button class="btn btn-brand btn-xs" data-act="notifOpen" data-id="${h(id)}">Open</button>`;
    $("#toasts").prepend(el);
    setTimeout(() => el.remove(), 8000);
    if (document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") {
      try { const nn = new Notification(n.who + " · TaskMaster", { body: n.text + "\n" + itemTitle(a), tag: a[0], icon: CFG.LOGO_ROUND }); nn.onclick = () => { window.focus(); ACT.notifOpen({ dataset: { id } }); }; } catch (e) {}
    }
  });
}

// ---------- hooks into the app ----------
const _applyData = applyData;
applyData = function (data) {
  _applyData(data);
  if (data.serverTime) RT.since = Math.max(RT.since || 0, data.serverTime - 1000);
  if (RT.user !== me()) { RT.user = me(); outboxLoad(); OUT.list.filter(x => x.state === "sending").forEach(deliver); schedulePoll(2000); }
  renderBell();
};
const _renderNav = renderNav;
renderNav = function () { _renderNav(); renderBell(); };
