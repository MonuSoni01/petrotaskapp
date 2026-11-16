/* ============ app: navigation, router, sync, login ============ */
const NAV = [
  { section: "My work" },
  { r: "home", l: "Home", i: "house" },
  { r: "tasks", l: "My Tasks", i: "list-check", badge: () => myCounts().pending.length },
  { r: "kra", l: "My KRA", i: "bullseye", badge: () => myCounts().kra.length },
  { r: "tickets", l: "Help Tickets", i: "headset", badge: () => myCounts().tickets.length },
  { r: "scorecard", l: "My Scorecard", i: "chart-line" },
  { section: "Team", team: true },
  { r: "approvals", l: "Approvals", i: "clipboard-check", team: true, badge: () => reviewQueue().length },
  { r: "delegate", l: "Delegation", i: "paper-plane", team: true },
  { r: "evaluation", l: "Team Evaluation", i: "scale-balanced", team: true },
  { r: "kpi", l: "KPI Matrix", i: "table-cells", team: true },
  { r: "tracker", l: "Complete Tracker", i: "street-view", team: true },
  { r: "performance", l: "Performance", i: "ranking-star", team: true },
  { r: "analytics", l: "Analytics", i: "chart-pie", team: true },
  { r: "delmatrix", l: "Delegation Matrix", i: "network-wired", team: true },
  { r: "reports", l: "Reports", i: "file-lines", team: true },
  { section: "Admin", admin: true },
  { r: "admin", l: "Admin Panel", i: "user-shield", admin: true }
];

function renderNav() {
  const mgr = canManage();
  $("#nav").innerHTML = NAV.filter(n => (!n.team || mgr) && (!n.admin || isAdmin())).map(n => {
    if (n.section) return `<div class="nav-section">${h(n.section)}</div>`;
    const b = n.badge ? n.badge() : 0;
    return `<a class="nav-item-x ${S.route === n.r ? "active" : ""}" href="#/${n.r}"><i class="fas fa-${n.i}"></i><span>${h(n.l)}</span>${b ? `<span class="nav-badge">${b > 99 ? "99+" : b}</span>` : ""}</a>`;
  }).join("");
  const bottom = [["home", "Home", "house"], ["tasks", "Tasks", "list-check"], ["kra", "KRA", "bullseye"], mgr ? ["approvals", "Review", "clipboard-check"] : ["tickets", "Tickets", "headset"]];
  const badge = { tasks: myCounts().pending.length, kra: myCounts().kra.length, approvals: mgr ? reviewQueue().length : 0, tickets: myCounts().tickets.length };
  $("#bottomNav").innerHTML = bottom.map(([r, l, i]) => `<a href="#/${r}" class="${S.route === r ? "active" : ""}"><i class="fas fa-${i}"></i>${l}${badge[r] ? `<span class="dot">${badge[r] > 99 ? "99+" : badge[r]}</span>` : ""}</a>`).join("") +
    `<a href="#" data-act="openSidebar"><i class="fas fa-bars"></i>More</a>`;
  const u = S.user;
  $("#sidebarUser").innerHTML = `${avatar(u.email)}<div class="min-w-0"><div class="fw-semibold text-truncate">${h(u.name)}</div><div class="small-2 text-muted text-truncate">${h(u.role)} · ${h(u.dept || "")}</div></div>`;
  $("#topAvatar").innerHTML = avatar(u.email);
  $("#menuUser").innerHTML = `<div class="fw-bold text-body">${h(u.name)}</div><div class="small">${h(u.email)}</div>`;
}

// ---------- router ----------
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  const params = Object.fromEntries(new URLSearchParams(qs || ""));
  return { route: path || "home", params };
}
function navigate() {
  if (!S.data) return;
  const { route, params } = parseHash();
  let r = VIEWS[route] ? route : "home";
  if ((VIEWS[r].team && !canManage()) || (VIEWS[r].admin && !isAdmin())) r = "home";
  S.route = r; S.params = params;
  closeSidebar();
  renderView();
  window.scrollTo(0, 0);
}
function renderView() {
  const v = VIEWS[S.route];
  $("#pageTitle").textContent = v.title;
  $("#pageSub").textContent = S.route === "home" ? (S.user.dept || "") : "";
  document.title = v.title + " · TaskMaster";
  try { $("#view").innerHTML = v.render(S.params || {}); }
  catch (e) { console.error(e); $("#view").innerHTML = empty("Something went wrong on this screen", "bug", e.message); }
  if (v.after) v.after();
  renderNav();
  S.pendingRender = false;
}
// Re-render current screen; postpone while the user is typing in it.
function rerender(force) {
  if (!S.data) return;
  const a = document.activeElement;
  const typing = a && $("#view").contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox" && a.dataset.input !== "uisearch";
  if (!force && typing) { S.pendingRender = true; renderNav(); return; }
  renderView();
}
document.addEventListener("focusout", () => setTimeout(() => {
  if (S.pendingRender && !$("#view").contains(document.activeElement)) rerender(true);
}, 150));
window.addEventListener("hashchange", navigate);

// ---------- sync ----------
async function sync(silent = false) {
  if (S.syncing) { S.syncAgain = true; return; }
  S.syncing = true; setSyncPill();
  try {
    const data = await api("dashboard");
    let cursor = data.kraNext;
    while (cursor) { const page = await api("kraPage", { cursor }); data.kraTasks.push(...page.rows); cursor = page.next; }
    applyData(data);
    S.lastSync = Date.now();
    Cache.set("data:" + ek(data.user.email), { data, at: S.lastSync });
    if (!silent) toast("Data refreshed from Google Sheet.");
  } catch (e) {
    if (!/session expired/i.test(e.message)) toast(e.message, "err");
  } finally {
    S.syncing = false; setSyncPill();
    if (S.syncAgain) { S.syncAgain = false; sync(true); }
  }
}
function applyData(data) {
  S.data = data; S.user = data.user || S.user; S.idx = buildIndex(data);
  saveSession();
  const first = $("#shell").classList.contains("d-none");
  showShell();
  if (first) navigate(); else rerender();
  if (drawerTaskId) renderDrawer(false);
}
function setSyncPill() {
  const pill = $("#syncPill"), t = $("#syncText");
  if (!pill) return;
  pill.classList.toggle("busy", S.syncing);
  if (S.syncing) { t.textContent = "Syncing…"; pill.classList.remove("stale"); return; }
  if (!S.lastSync) { t.textContent = "Refresh"; return; }
  const mins = Math.floor((Date.now() - S.lastSync) / 60000);
  t.textContent = mins < 1 ? "Synced just now" : mins < 60 ? `Synced ${mins} min ago` : `Synced ${Math.floor(mins / 60)} h ago`;
  pill.classList.toggle("stale", mins >= (CFG.STALE_AFTER_MINUTES || 240));
  pill.title = "Last synced " + new Date(S.lastSync).toLocaleString() + " — click to refresh";
}
setInterval(setSyncPill, 30000);

// ---------- session ----------
function saveSession() { try { localStorage.setItem("tm_session", JSON.stringify({ token: S.token, user: S.user })); } catch (e) {} }
function showShell() { $("#boot").classList.add("d-none"); $("#login").classList.add("d-none"); $("#shell").classList.remove("d-none"); }
function showLogin(msg) {
  $("#boot").classList.add("d-none"); $("#shell").classList.add("d-none"); $("#login").classList.remove("d-none");
  $("#loginError").textContent = msg || "";
  $("#configWarn").classList.toggle("d-none", Boolean(CFG.API_URL && !/PASTE_YOUR/.test(CFG.API_URL)));
}
function onAuthExpired() {
  S.token = ""; try { localStorage.removeItem("tm_session"); } catch (e) {}
  if (drawer) drawer.hide(); closeDialog();
  $("#loginEmail").value = S.user?.email || "";
  showLogin("Your session expired. Please sign in again.");
}
async function logout() {
  const token = S.token;
  S.token = ""; S.data = null; S.idx = null; S.ui = {}; S.lastSync = 0;
  try { localStorage.removeItem("tm_session"); } catch (e) {}
  await Cache.clear();
  if (token) fetch(CFG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "logout", token }) }).catch(() => {});
  location.hash = "";
  showLogin("");
}

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("#loginBtn"); btn.disabled = true; btn.innerHTML = '<span class="spinner-border me-2"></span>Signing in…';
  $("#loginError").textContent = "";
  try {
    const res = await api("login", { email: $("#loginEmail").value, password: $("#loginPass").value });
    S.token = res.sessionToken; S.user = res.user; saveSession();
    $("#loginPass").value = "";
    btn.innerHTML = '<span class="spinner-border me-2"></span>Loading your data…';
    const cached = await Cache.get("data:" + ek(res.user.email));
    if (cached && cached.data) { S.lastSync = cached.at; applyData(cached.data); sync(true); }
    else { await sync(true); if (!S.data) throw new Error("Could not load data. Try again."); }
  } catch (err) { $("#loginError").textContent = err.message; }
  finally { btn.disabled = false; btn.textContent = "Sign in"; }
});
$("#togglePass").addEventListener("click", () => { const p = $("#loginPass"); p.type = p.type === "password" ? "text" : "password"; $("#togglePass i").className = "fas " + (p.type === "password" ? "fa-eye" : "fa-eye-slash"); });
$("#dlgForm").addEventListener("submit", handleDialogSubmit);

// ---------- top-level actions ----------
ACT.refresh = () => sync(false);
ACT.logout = () => logout();
ACT.openSidebar = () => $("#shell").classList.add("nav-open");
ACT.closeSidebar = () => closeSidebar();
function closeSidebar() { $("#shell").classList.remove("nav-open"); }
ACT.toggleTheme = () => {
  const dark = document.documentElement.getAttribute("data-bs-theme") !== "dark";
  document.documentElement.setAttribute("data-bs-theme", dark ? "dark" : "light");
  try { localStorage.setItem("tm_theme", dark ? "dark" : "light"); } catch (e) {}
  $("#themeIcon").className = "fas " + (dark ? "fa-sun" : "fa-moon");
  if (S.data) rerender(true);
};

// ---------- boot ----------
(async function boot() {
  $("#themeIcon").className = "fas " + (document.documentElement.getAttribute("data-bs-theme") === "dark" ? "fa-sun" : "fa-moon");
  let sess = null;
  try { sess = JSON.parse(localStorage.getItem("tm_session") || "null"); } catch (e) {}
  if (!sess || !sess.token || !sess.user) return showLogin("");
  S.token = sess.token; S.user = sess.user;
  const cached = await Cache.get("data:" + ek(sess.user.email));
  if (cached && cached.data) {
    S.lastSync = cached.at;
    applyData(cached.data); // instant: show cached data, no server call
    setSyncPill();
  } else {
    await sync(true);
    if (!S.data && S.token) showLogin("Could not load data. Please sign in again.");
  }
})();
