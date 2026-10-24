
/* ================================================================ ROUTING
   Hash routes keep the browser Back button working and survive a refresh:
   #/services, #/services/<category>, #/services/<category>/<service>, #/centres/<service>,
   #/centre/<centre>/<service>, #/activity/<tab>, #/staff, #/admin/<tab>, #/display */
let route = { view: "overview", params: [] };
let journey = {};
let notifSeen = Date.now();

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { view: parts[0] || "", params: parts.slice(1) };
}
function go(view, ...params) {
  const hash = "#/" + [view, ...params.filter(p => p != null && p !== "")].map(encodeURIComponent).join("/");
  if (location.hash === hash) applyRoute(parseRoute());
  else location.hash = hash;
}
function applyRoute(next) {
  if (!currentUser) return;
  if (!ROLE_VIEWS[currentUser.role].includes(next.view)) { go("overview"); return; }
  const changedView = next.view !== route.view || next.params.join("/") !== route.params.join("/");
  route = next;
  /* Keep the journey in step with what the customer is looking at. */
  if (isCustomer()) {
    if (route.view === "services" && route.params[0]) journey.catId = route.params[0];
    if (route.view === "services" && route.params[1]) journey.svcId = route.params[1];
    if (route.view === "centres" && route.params[0]) { journey.svcId = route.params[0]; const s = getService(journey.svcId); if (s) journey.catId = s.catId; }
    if (route.view === "centre" && route.params[0]) { journey.centreId = route.params[0]; if (route.params[1]) journey.svcId = route.params[1]; }
    saveJourney();
  }
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + route.view));
  const navView = NAV_PARENT[route.view] || route.view;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === navView));
  renderAll();
  if (changedView) window.scrollTo({ top: 0, behavior: "auto" });
}
window.addEventListener("hashchange", () => applyRoute(parseRoute()));

function journeyKey() { return JOURNEY_KEY + "_" + (currentUser ? currentUser.id : "anon"); }
function loadJourney() {
  const j = readJSON("session", journeyKey(), null) || readJSON("local", journeyKey(), null) || {};
  j.filters = Object.assign({ walkIn: false, appt: false, openNow: false, maxKm: 0, sort: "distance", q: "" }, j.filters || {});
  return j;
}
function saveJourney() { const raw = JSON.stringify(journey); storeSet("session", journeyKey(), raw); storeSet("local", journeyKey(), raw); }

function prefs() {
  const key = PREFS_KEY + "_" + (currentUser ? currentUser.id : "anon");
  const p = readJSON("local", key, {});
  p.smartAssist = p.smartAssist !== false;
  p.dismissed = p.dismissed || {};
  return p;
}
function savePrefs(p) { storeSet("local", PREFS_KEY + "_" + (currentUser ? currentUser.id : "anon"), JSON.stringify(p)); }

/* ================================================================ RENDER ALL */
const VIEW_TITLE = { overview: "Overview", services: "Find a service", centres: "Choose a centre", centre: "Centre details", activity: "My activity", staff: "Staff console", admin: "Administration", display: "Public display" };
function renderAll() {
  if (!currentUser) return;
  const v = route.view;
  const subs = {
    overview: isCustomer() ? "Your tokens, appointments and quick ways to get started." : "Live status of every centre and what needs attention.",
    services: "Step 1–2: choose a category, then the exact service you need.",
    centres: "Step 3: centres that offer your service, nearest first when your location is known.",
    centre: "Steps 4–5: check the queue for your service, then take a token or book a slot.",
    activity: "Step 6: track tokens and appointments, and see your history.",
    staff: "Call, serve and update tokens at your centre's counters.",
    admin: "Catalogue, centres, counters, staff, slots and analytics.",
    display: "What waiting customers see on a centre's lobby screen."
  };
  $("pageTitle").textContent = v === "overview" ? greeting() + ", " + firstName() : VIEW_TITLE[v];
  $("pageSub").textContent = subs[v] || "";
  $("crumbs").textContent = "QueueEase / " + ROLE_LABEL[currentUser.role] + (v !== "overview" ? " / " + VIEW_TITLE[v] : "");
  if (v === "overview") renderOverview();
  if (v === "services") renderServices();
  if (v === "centres") renderCentres();
  if (v === "centre") renderCentre();
  if (v === "activity") renderActivity();
  if (v === "staff") renderStaff();
  if (v === "admin") renderAdmin();
  if (v === "display") renderDisplay();
  renderNotifs();
  const count = myActiveTokens().length + myUpcoming().length, badge = $("navActivityCount");
  badge.textContent = count; badge.classList.toggle("hidden", !count || !isCustomer());
  $("simBanner").classList.toggle("hidden", !simTimer);
  if ($("modal").dataset.live === "1" && modalRefresh) modalRefresh();
}

/* ================================================================ SHARED UI PIECES */
function statusPill(status) { return `<span class="q-pill q-${status.tone}">${h(status.label)}</span>`; }
function sampleBadge(text = "Sample data") { return `<span class="sample-badge" title="Invented demo data, not official or live">${h(text)}</span>`; }
function emptyState(text, action = "") { return `<div class="empty-state">${h(text)}${action ? `<div style="margin-top:12px">${action}</div>` : ""}</div>`; }
function journeyBar(step) {
  const svc = journey.svcId && getService(journey.svcId), centre = journey.centreId && getCentre(journey.centreId);
  const steps = [
    { n: 1, label: "Service", detail: svc ? svc.name : "Choose", go: ["services", journey.catId || "", ""] },
    { n: 2, label: "Centre", detail: svc && centre && centreOffers(centre, svc.id) ? centre.name.replace(/^.*?,\s*/, "") : "Choose", go: svc ? ["centres", svc.id] : null },
    { n: 3, label: "Queue & slots", detail: "Check", go: svc && centre ? ["centre", centre.id, svc.id] : null },
    { n: 4, label: "Token or booking", detail: "Confirm", go: null },
    { n: 5, label: "Track", detail: "My activity", go: ["activity"] }
  ];
  return `<nav class="journey-steps" aria-label="Your progress">${steps.map(s => {
    const state = s.n < step ? "done" : s.n === step ? "current" : "todo";
    const inner = `<span class="js-num">${s.n < step ? "✓" : s.n}</span><span class="js-text"><strong>${h(s.label)}</strong><small>${h(s.detail)}</small></span>`;
    return s.go && s.n !== step ? `<button type="button" class="js-step ${state}" data-action="go" data-route="${h(s.go.join("|"))}">${inner}</button>` : `<div class="js-step ${state}" ${s.n === step ? 'aria-current="step"' : ""}>${inner}</div>`;
  }).join("")}</nav>`;
}
function backLink(label, routeParts) { return `<button type="button" class="back-link" data-action="go" data-route="${h(routeParts.join("|"))}">← ${h(label)}</button>`; }

/* ================================================================ MODAL */
let modalRefresh = null;
let lastFocus = null;
function openModal(html, { live = false, refresh = null, wide = false } = {}) {
  lastFocus = document.activeElement;
  const box = $("modalBox");
  box.className = "modal-box" + (wide ? " wide" : "");
  box.innerHTML = html;
  $("modal").classList.remove("hidden");
  $("modal").dataset.live = live ? "1" : "0";
  modalRefresh = refresh;
  const focusable = box.querySelector("input, select, textarea, button.btn-primary, button");
  if (focusable) setTimeout(() => focusable.focus(), 30);
}
function closeModal() {
  $("modal").classList.add("hidden");
  $("modal").dataset.live = "0";
  modalRefresh = null;
  if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
}
function confirmDialog({ title, body, confirm = "Confirm", danger = false, onConfirm }) {
  openModal(`<h2 id="modalTitle">${h(title)}</h2><div class="modal-body">${body}</div>
    <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Go back</button>
    <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confirmYes">${h(confirm)}</button></div>`);
  $("confirmYes").addEventListener("click", () => { closeModal(); onConfirm(); });
}

/* ================================================================ NOTIFICATIONS (in-app only) */
function myNotices() {
  if (!currentUser) return [];
  if (isCustomer()) return state.notices.filter(n => isMine(n));
  const centreId = isAdmin() ? null : currentUser.centreId;
  return state.activity.filter(a => !centreId || !a.centreId || a.centreId === centreId);
}
function renderNotifs() {
  const list = myNotices(), unread = list.filter(a => a.time > notifSeen).length, badge = $("bellBadge");
  badge.textContent = unread; badge.classList.toggle("hidden", !unread);
  $("notifPanel").innerHTML = `<div class="notif-head"><strong>${isCustomer() ? "Your updates" : "Centre activity"}</strong><button class="text-button" id="markRead" type="button">Mark all read</button></div>
    <p class="notif-note">In-app only. No SMS, e-mail or push messages are sent.</p>` +
    (list.length ? list.slice(0, 25).map(a => `<div class="notif-item${a.time > notifSeen ? " unread" : ""}"><span>${h(a.icon || "•")}</span><div>${h(a.message)}<small>${formatDateTime(a.time)}</small></div></div>`).join("") : `<div class="empty-state">No updates yet.</div>`);
}
function markNotifsRead() { notifSeen = Date.now(); if (currentUser) storeSet("local", "queueease_seen_" + currentUser.id, String(notifSeen)); renderNotifs(); }
function toggleNotifs(force) {
  const panel = $("notifPanel"), open = force === undefined ? panel.classList.contains("hidden") : force;
  panel.classList.toggle("hidden", !open);
  $("bellBtn").setAttribute("aria-expanded", String(open));
}

/* ================================================================ COMMAND PALETTE */
let paletteIndex = 0, paletteItems = [];
function paletteCommands() {
  const role = currentUser.role, list = [];
  ROLE_VIEWS[role].filter(v => !["centres", "centre"].includes(v)).forEach(v => list.push({ label: "Go to " + VIEW_TITLE[v], run: () => go(v) }));
  if (role === "citizen") {
    state.services.filter(serviceVisible).forEach(s => list.push({ label: "Find centres for " + s.name, hint: getCategory(s.catId).name, run: () => go("centres", s.id) }));
    list.push({ label: "Open My activity: upcoming appointments", run: () => go("activity", "upcoming") });
  }
  if (isStaff()) list.push({ label: "Call next customer at my counter", run: () => staffCallNext() }, { label: "Mark current customer served", run: () => staffMarkServed() });
  if (isAdmin()) ["catalogue", "centres", "staff", "analytics", "settings"].forEach(t => list.push({ label: "Administration: " + t, run: () => go("admin", t) }));
  list.push({ label: (simTimer ? "Stop" : "Run") + " live demo (simulated activity)", run: () => toggleSim() }, { label: "Log out", run: logout });
  return list;
}
function renderPalette() {
  const q = $("paletteInput").value.trim().toLowerCase();
  paletteItems = paletteCommands().filter(c => (c.label + " " + (c.hint || "")).toLowerCase().includes(q)).slice(0, 40);
  paletteIndex = Math.min(paletteIndex, Math.max(0, paletteItems.length - 1));
  $("paletteList").innerHTML = paletteItems.length ? paletteItems.map((c, i) => `<button type="button" class="palette-item${i === paletteIndex ? " sel" : ""}" data-i="${i}" role="option">${h(c.label)}${c.hint ? `<small>${h(c.hint)}</small>` : ""}</button>`).join("") : `<div class="empty-state">No matching page, service or action.</div>`;
}
function togglePalette(open) {
  $("palette").classList.toggle("hidden", !open);
  if (open) { $("paletteInput").value = ""; paletteIndex = 0; renderPalette(); $("paletteInput").focus(); }
}
function runPalette(i) { const cmd = paletteItems[i]; if (!cmd) return; togglePalette(false); cmd.run(); }
