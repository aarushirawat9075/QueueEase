
/* ================================================================ LIVE DEMO (simulated activity) */
let simTimer = null;
function simTick() {
  syncState();
  const rand = Math.random, pick = list => list[Math.floor(rand() * list.length)];
  const open = state.centres.filter(c => c.active && c.status === "open");
  if (!open.length) return;
  /* Desks near the signed-in customer's tokens move more often, so the demo is visible. */
  const mine = myActiveTokens(), focus = mine.length && rand() < 0.6 ? getCentre(pick(mine).centreId) : pick(open);
  if (rand() < 0.45) {
    const c = pick(open), ids = Object.keys(c.offers).filter(id => walkInState(c, id).ok || (state.settings.ignoreHours && centreOffers(c, id)));
    if (ids.length) {
      const id = pick(ids), q = getQueue(c.id, id);
      if (q.waiting.length < 9) {
        q.seq += 1;
        const e = { id: uid("t"), token: getService(id).prefix + String(q.seq).padStart(3, "0"), userId: null, name: pick(SAMPLE_NAMES), centreId: c.id, svcId: id, createdAt: Date.now(), rank: rand() < 0.08 ? 0 : 2, sample: true, simulated: true };
        e.priority = e.rank === 0;
        insertEntry(q, e);
        addActivity(`${e.token} joined ${getService(id).name} at ${c.area} (simulated).`, "＋", c.id);
      }
    }
  } else {
    const counters = focus.counters.filter(k => k.open);
    if (counters.length) {
      const k = pick(counters);
      if (k.current) {
        const e = k.current, minutes = Math.max(2, serviceMinutes(e.svcId, focus.id).avg * (0.6 + rand() * 0.9));
        e.servingAt = Date.now() - minutes * 60000; /* demo time is compressed */
        e.createdAt = Math.min(e.createdAt, e.servingAt - (1 + rand() * 9) * 60000);
        closeToken(e, "completed", { completedAt: Date.now(), counterId: k.id });
        k.current = null;
        addActivity(`${e.token} completed at ${focus.area} (simulated).`, "✓", focus.id);
      }
      const line = counterLine(focus, k);
      if (!k.current && line.length) callEntry(focus, k, line[0]);
    }
  }
  commit();
}
function toggleSim() {
  if (simTimer) { clearInterval(simTimer); simTimer = null; }
  else { simTimer = setInterval(simTick, 2500); simTick(); }
  showToast(simTimer ? "Live demo started. New activity is simulated." : "Live demo stopped.");
  renderAll();
}

/* ================================================================ CLICK ACTIONS (event delegation) */
const ACTIONS = {
  "go": el => { closeModal(); toggleNotifs(false); const [view, ...params] = el.dataset.route.split("|"); go(view, ...params); },
  "close-modal": () => closeModal(),
  "toggle-sim": () => toggleSim(),
  "dismiss-tip": el => { const p = prefs(); p.dismissed[el.dataset.key] = Date.now(); savePrefs(p); renderAll(); showToast("Suggestion dismissed."); },
  "reset-tips": () => { const p = prefs(); p.dismissed = {}; savePrefs(p); renderAll(); },
  "toggle-assist": el => { const p = prefs(); p.smartAssist = el.checked; savePrefs(p); renderAll(); showToast("Smart Assist " + (el.checked ? "on." : "off.")); },
  "use-location": () => useMyLocation(),
  "clear-location": () => { journey.filters.maxKm = 0; if (journey.filters.sort === "distance") journey.filters.sort = "name"; setLocation(null); },
  "pick-place": el => { const p = placeChoices[Number(el.dataset.i)]; if (p) setLocation({ label: p.label, lat: p.lat, lng: p.lng, source: "manual", pin: p.pin }); },
  "clear-filters": () => { Object.assign(journey.filters, { walkIn: false, appt: false, openNow: false, maxKm: 0 }); saveJourney(); renderAll(); },
  "centre-view": el => { journey.view = el.dataset.v; saveJourney(); renderAll(); },
  "select-centre": el => { journey.centreId = el.dataset.centre; saveJourney(); go("centre", el.dataset.centre, el.dataset.svc); setTimeout(() => { const o = $("options"); if (o) o.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60); },
  "refresh": () => { syncState(); lastRefresh = Date.now(); renderAll(); showToast("Queue information refreshed from this browser's data."); },
  "pick-date": el => { booking.date = el.dataset.date; booking.time = ""; renderAll(); },
  "pick-slot": el => { booking.time = el.dataset.time; renderAll(); const b = document.querySelector("[data-action='book-start']"); if (b) b.focus(); },
  "token-start": () => startToken(),
  "book-start": () => startBooking(),
  "cancel-token": el => cancelToken(el.dataset.id),
  "cancel-appt": el => cancelAppointment(el.dataset.id),
  "checkin": el => checkInAppointment(el.dataset.id),
  "open-console": el => { journey.consoleCentre = el.dataset.centre; saveJourney(); go("staff"); },
  "pick-counter": el => { const c = consoleCentre(); journey["counter_" + c.id] = el.dataset.id; saveJourney(); renderAll(); },
  "staff-next": () => staffCallNext(),
  "staff-call-id": el => staffCallNext(el.dataset.id),
  "staff-served": () => staffMarkServed(),
  "staff-skip": () => staffSkip(false),
  "staff-noshow": () => staffSkip(true),
  "staff-remove": el => staffRemove(el.dataset.id),
  "toggle-counter": el => toggleCounter(el.dataset.id),
  "toggle-pause": el => togglePause(el.dataset.svc),
  "staff-checkin": el => { if (isStaff()) checkInAppointment(el.dataset.id, true); },
  "staff-appt-noshow": el => { if (isStaff()) staffApptNoShow(el.dataset.id); },
  "edit-cat": el => editCategory(el.dataset.id),
  "toggle-cat": el => { if (!adminGuard()) return; const c = getCategory(el.dataset.id); c.active = !c.active; addActivity(`Category "${c.name}" ${c.active ? "activated" : "deactivated"}.`, "⚙"); commit(); },
  "edit-svc": el => editService(el.dataset.id),
  "toggle-svc": el => { if (!adminGuard()) return; const s = getService(el.dataset.id); s.active = !s.active; addActivity(`Service "${s.name}" ${s.active ? "activated" : "deactivated"}.`, "⚙"); commit(); },
  "admin-pick-centre": el => { journey.adminEditCentre = el.dataset.id; saveJourney(); renderAll(); },
  "admin-centre-tab": el => { journey.adminCentreTab = el.dataset.tab; saveJourney(); renderAll(); },
  "add-centre": () => addCentre(),
  "edit-counter": el => editCounter(el.dataset.centre, el.dataset.id),
  "remove-counter": el => removeCounter(el.dataset.centre, el.dataset.id),
  "add-closed-date": el => { const d = $("slClosed").value; if (!d || d < todayStr()) return showToast("Choose a date from today onwards.", true); if (!adminGuard()) return; const c = getCentre(el.dataset.id); if (!c.closedDates.includes(d)) c.closedDates.push(d); const hit = state.appointments.filter(a => a.centreId === c.id && a.date === d && a.status === "booked"); hit.forEach(a => { a.status = "cancelled"; a.cancelledAt = Date.now(); a.cancelledBy = "the centre (holiday)"; notify(a.userId, `Appointment ${a.ref} on ${prettyDate(d)} was cancelled because ${c.name} is closed that day. Please book another slot.`, "⚠"); }); addActivity(`${c.name} closed on ${d}${hit.length ? "; " + hit.length + " booking(s) cancelled" : ""}.`, "⚙", c.id); commit(); },
  "remove-closed-date": el => { if (!adminGuard()) return; const c = getCentre(el.dataset.id); c.closedDates = c.closedDates.filter(d => d !== el.dataset.date); commit(); },
  "admin-range": el => { journey.adminRange = el.dataset.v; saveJourney(); renderAll(); },
  "export-tokens": () => exportTokens(),
  "export-appts": () => exportAppts(),
  "remove-staff": el => confirmDialog({ title: "Remove this staff account?", danger: true, confirm: "Remove account", body: "<p>They will no longer be able to log in.</p>", onConfirm: () => { users = loadUsers().filter(u => u.id !== el.dataset.id); saveUsers(); renderAll(); showToast("Staff account removed."); } }),
  "toggle-hours": el => { if (!adminGuard()) return; state.settings.ignoreHours = el.checked; addActivity(`Opening hours ${el.checked ? "ignored (demo override on)" : "enforced again"}.`, "⚙"); commit(); },
  "reset-data": () => resetData()
};
function addCentre() {
  openModal(`<h2 id="modalTitle">Add centre</h2><form id="newCentreForm" class="modal-body form-grid" novalidate>
    <label for="ncName">Centre name</label><input id="ncName" maxlength="60" placeholder="e.g. Sewa Kendra, Sector 70 Mohali">
    <div class="two-col"><div><label for="ncArea">Area / locality</label><input id="ncArea" maxlength="40"></div><div><label for="ncPin">PIN code</label><input id="ncPin" maxlength="6" inputmode="numeric"></div></div>
    <p class="fine-print">The centre starts open Mon–Sat, 09:00–17:00, with one counter and no services. Add its services and counters next.</p>
    <div id="ncMsg" class="form-message" role="status"></div>
    <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Create centre</button></div></form>`);
  $("newCentreForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("ncName").value.trim(), area = $("ncArea").value.trim(), pin = $("ncPin").value.trim();
    if (name.length < 4) { $("ncMsg").textContent = "Enter the centre's name."; return; }
    if (area.length < 2) { $("ncMsg").textContent = "Enter the area or locality."; return; }
    if (!/^\d{6}$/.test(pin)) { $("ncMsg").textContent = "PIN code must be 6 digits."; return; }
    if (!adminGuard()) return;
    const id = "C" + Date.now().toString(36).toUpperCase().slice(-5), place = PLACES.find(p => p.pin === pin) || { lat: 30.7333, lng: 76.7794 };
    state.centres.push({ id, kind: "Service centre", name, area, city: "Chandigarh", pin, address: "Address not set", lat: place.lat, lng: place.lng, open: "09:00", close: "17:00", days: [1, 2, 3, 4, 5, 6],
      status: "open", notice: "", active: true, tokenCutoff: 30, slotMinutes: 30, slotCapacity: 2, bookDays: 14, closedDates: [], offers: {}, counters: [{ id: id + "-K1", label: "Counter 1", svcIds: [], open: true, current: null }] });
    state.queues[id] = {};
    journey.adminEditCentre = id; journey.adminCentreTab = "services"; saveJourney();
    addActivity(`Centre "${name}" added.`, "⚙", id);
    closeModal(); commit(); showToast("Centre created. Choose the services it offers.");
  });
}
function resetData() {
  confirmDialog({ title: "Reset all demo data?", danger: true, confirm: "Reset data", body: "<p>Queues, centres, the catalogue and appointments go back to the sample data. Tokens and bookings made so far are removed. Accounts are kept.</p>",
    onConfirm: () => { if (simTimer) toggleSim(); state = freshState(); saveState(); trendHistory.length = 0; renderAll(); showToast("Demo data reset."); } });
}

document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  if (el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type !== "checkbox")) return;
  const fn = ACTIONS[el.dataset.action];
  if (fn) { if (el.tagName !== "INPUT") e.preventDefault(); fn(el, e); }
});
document.addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const el = e.target.closest && e.target.closest("g[data-action]");
  if (el) { e.preventDefault(); ACTIONS[el.dataset.action](el, e); }
});

/* Selects and inputs inside rendered views */
document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.filter) {
    const key = el.dataset.filter;
    journey.filters[key] = el.type === "checkbox" ? el.checked : key === "maxKm" ? Number(el.value) : el.value;
    saveJourney(); renderAll(); return;
  }
  const action = el.dataset.action;
  if (action === "display-centre") { journey.displayCentre = el.value; saveJourney(); renderAll(); }
  if (action === "admin-scope") { journey.adminCentre = el.value; saveJourney(); renderAll(); }
  if (action === "console-centre") { journey.consoleCentre = el.value; saveJourney(); renderAll(); }
  if (action === "admin-cat-filter") { journey.adminCat = el.value; saveJourney(); renderAll(); }
  if (action === "assign-staff") {
    if (!isAdmin()) return;
    users = loadUsers(); const u = users.find(x => x.id === el.dataset.id); if (!u) return;
    u.centreId = el.value; saveUsers();
    if (currentUser && currentUser.id === u.id) currentUser.centreId = u.centreId;
    showToast(u.name + " assigned to " + getCentre(el.value).name + ".");
  }
});
document.addEventListener("input", e => {
  if (e.target.id === "serviceSearch") {
    serviceQuery = e.target.value;
    const box = $("serviceResults");
    box.classList.toggle("hidden", !serviceQuery.trim());
    box.innerHTML = `<div class="panel-heading"><h2>Search results</h2></div>` + serviceResultRows(serviceMatches(serviceQuery));
  }
  if (e.target.id === "staffSearch") { staffSearch = e.target.value; $("staffResults").innerHTML = staffSearchResults(consoleCentre()); }
});
document.addEventListener("submit", e => {
  const form = e.target;
  if (form.id === "locForm") {
    e.preventDefault();
    const q = $("locInput").value;
    if (!q.trim()) { locMessage = "Type a sector, town or PIN code, or use your location."; placeChoices = []; renderAll(); return; }
    const found = searchPlaces(q);
    if (found.length === 1) setLocation({ label: found[0].label, lat: found[0].lat, lng: found[0].lng, source: "manual", pin: found[0].pin });
    else if (found.length > 1) { placeChoices = found; locMessage = ""; renderAll(); }
    else { placeChoices = []; locMessage = `"${q.trim()}" is not in the sample location list. Try a Chandigarh sector, Mohali, Kharar, Zirakpur, Panchkula or a PIN such as 160022.`; renderAll(); }
  }
  if (form.id === "centreForm") { e.preventDefault(); saveCentreDetails(form.dataset.id); }
  if (form.id === "offersForm") { e.preventDefault(); saveOffers(form.dataset.id); }
  if (form.id === "slotsForm") { e.preventDefault(); saveSlots(form.dataset.id); }
});
function saveCentreDetails(id) {
  const msg = $("ctMsg"), name = $("ctName").value.trim(), pin = $("ctPin").value.trim(), open = $("ctOpen").value, close = $("ctClose").value;
  const lat = Number($("ctLat").value), lng = Number($("ctLng").value), days = [...document.querySelectorAll("[data-day]:checked")].map(x => Number(x.dataset.day));
  if (name.length < 4) return (msg.textContent = "Enter the centre's name.");
  if (!/^\d{6}$/.test(pin)) return (msg.textContent = "PIN code must be 6 digits.");
  if (!(lat >= 6 && lat <= 37 && lng >= 68 && lng <= 98)) return (msg.textContent = "Latitude and longitude must be inside India.");
  if (!open || !close || toMinutes(close) - toMinutes(open) < 60) return (msg.textContent = "Closing time must be at least an hour after opening.");
  if (!days.length) return (msg.textContent = "Choose at least one open day.");
  if (!adminGuard()) return;
  const c = getCentre(id);
  Object.assign(c, { name, kind: $("ctKind").value.trim() || "Service centre", address: $("ctAddr").value.trim(), area: $("ctArea").value.trim(), city: $("ctCity").value.trim(), pin, lat, lng, open, close, days,
    tokenCutoff: Math.max(0, Math.min(120, Number($("ctCut").value) || 0)), status: $("ctStatus").value, active: $("ctActive").value === "1", notice: $("ctNotice").value.trim() });
  addActivity(`${c.name} details updated.`, "⚙", c.id);
  commit(); showToast("Centre details saved.");
}
function saveOffers(id) {
  if (!adminGuard()) return;
  const c = getCentre(id), msg = $("ofMsg"), blocked = [];
  const next = {};
  state.services.forEach(s => {
    const box = document.querySelector(`[data-offer="${s.id}"]`);
    if (!box) return;
    if (box.checked) next[s.id] = { walkIn: document.querySelector(`[data-walk="${s.id}"]`).checked, appt: document.querySelector(`[data-appt="${s.id}"]`).checked, interrupted: document.querySelector(`[data-int="${s.id}"]`).value.trim() };
    else if (c.offers[s.id]) {
      const q = getQueue(c.id, s.id), serving = c.counters.some(k => k.current && k.current.svcId === s.id);
      if (q.waiting.length || serving) blocked.push(s.name);
    }
  });
  if (blocked.length) { msg.textContent = "Cannot remove services that still have people in the queue: " + blocked.join(", ") + ". Pause them and serve or remove those tokens first."; return; }
  const removed = Object.keys(c.offers).filter(sid => !next[sid]);
  removed.forEach(sid => {
    state.appointments.filter(a => a.centreId === c.id && a.svcId === sid && a.status === "booked").forEach(a => { a.status = "cancelled"; a.cancelledAt = Date.now(); a.cancelledBy = "the centre (service withdrawn)"; notify(a.userId, `Appointment ${a.ref} was cancelled because ${c.name} no longer offers ${getService(sid).name}.`, "⚠"); });
    c.counters.forEach(k => { k.svcIds = k.svcIds.filter(x => x !== sid); });
  });
  c.offers = next;
  Object.keys(next).forEach(sid => getQueue(c.id, sid));
  addActivity(`Services at ${c.name} updated (${Object.keys(next).length} offered).`, "⚙", c.id);
  commit(); showToast("Services saved." + (Object.keys(next).some(sid => !c.counters.some(k => k.svcIds.includes(sid))) ? " Some services have no counter yet." : ""));
}
function saveSlots(id) {
  const cap = Number($("slCap").value), days = Number($("slDays").value), msg = $("slMsg");
  if (!(cap >= 1 && cap <= 10)) return (msg.textContent = "Bookings per slot must be 1 to 10.");
  if (!(days >= 1 && days <= 30)) return (msg.textContent = "Bookable days must be 1 to 30.");
  if (!adminGuard()) return;
  const c = getCentre(id);
  Object.assign(c, { slotMinutes: Number($("slLen").value), slotCapacity: cap, bookDays: days });
  addActivity(`Appointment slots at ${c.name} updated.`, "⚙", c.id);
  commit(); showToast("Slot settings saved.");
}

/* Shell controls */
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => go(button.dataset.view)));
document.querySelectorAll("[data-auth-role]").forEach(button => button.addEventListener("click", () => { authRole = button.dataset.authRole; if (authRole === "admin") authMode = "login"; updateAuthUI(); }));
$("authSwitchBtn").addEventListener("click", () => { authMode = authMode === "login" ? "register" : "login"; $("authForm").reset(); updateAuthUI(); });
$("authForm").addEventListener("submit", handleAuthSubmit);
$("quickLoginBtn").addEventListener("click", quickLogin);
$("logoutBtn").addEventListener("click", logout);
$("resetQueues").addEventListener("click", resetData);
$("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
$("collapseBtn").addEventListener("click", () => { const shell = $("appShell"); shell.classList.toggle("collapsed"); storeSet("local", "queueease_nav", shell.classList.contains("collapsed") ? "1" : "0"); });
$("bellBtn").addEventListener("click", e => { e.stopPropagation(); const opening = $("notifPanel").classList.contains("hidden"); toggleNotifs(); if (!opening) markNotifsRead(); });
$("notifPanel").addEventListener("click", e => { e.stopPropagation(); if (e.target.id === "markRead") markNotifsRead(); });
document.addEventListener("click", () => { if (!$("notifPanel").classList.contains("hidden")) { toggleNotifs(false); markNotifsRead(); } });
$("openPalette").addEventListener("click", () => togglePalette(true));
$("palette").addEventListener("click", e => { if (e.target.id === "palette") togglePalette(false); const item = e.target.closest("[data-i]"); if (item) runPalette(Number(item.dataset.i)); });
$("paletteInput").addEventListener("input", () => { paletteIndex = 0; renderPalette(); });
$("paletteInput").addEventListener("keydown", e => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); paletteIndex = (paletteIndex + (e.key === "ArrowDown" ? 1 : -1) + paletteItems.length) % Math.max(1, paletteItems.length); renderPalette(); }
  else if (e.key === "Enter") { e.preventDefault(); runPalette(paletteIndex); }
});
document.addEventListener("keydown", e => {
  if (!currentUser) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); togglePalette(true); return; }
  if (e.key === "Escape") { togglePalette(false); toggleNotifs(false); if (!$("modal").classList.contains("hidden")) closeModal(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (route.view !== "staff" || !$("modal").classList.contains("hidden") || !$("palette").classList.contains("hidden")) return;
  const key = e.key.toLowerCase();
  if (key === "n") staffCallNext(); else if (key === "s") staffMarkServed(); else if (key === "k") staffSkip(false);
  else if (key === "/") { e.preventDefault(); const s = $("staffSearch"); if (s) s.focus(); }
});
/* Keep other open tabs (for example a customer tab and a staff tab) in step with each other. */
window.addEventListener("storage", event => {
  if (event.key === STORAGE_KEY) { state = loadState(); if (currentUser && !isTyping()) renderAll(); }
  if (event.key === USERS_KEY) { users = loadUsers(); if (currentUser) { const me = users.find(u => u.id === currentUser.id); if (me) currentUser.centreId = me.centreId; } }
});
function isTyping() { const a = document.activeElement; return Boolean(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox"; }

function tickClock() { $("clock").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date()); }
tickClock(); setInterval(tickClock, 30000);
/* Re-read the shared data every 15 seconds so waits and positions stay fresh. Skipped while typing in a form. */
setInterval(() => { if (currentUser && !isTyping()) { syncState(); lastRefresh = Date.now(); renderAll(); } }, 15000);

(function intro() {
  const el = $("intro");
  if (storeGet("session", "queueease_intro") || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.remove(); return; }
  const close = () => { storeSet("session", "queueease_intro", "1"); el.classList.add("done"); setTimeout(() => el.remove(), 600); };
  $("skipIntro").addEventListener("click", close);
  setTimeout(close, 3300);
})();

/* ================================================================ START */
if (storeGet("local", "queueease_nav") === "1") $("appShell").classList.add("collapsed");
document.querySelectorAll(".nav-item").forEach(item => { item.title = item.textContent.trim(); });
updateAuthUI();
if (storeGet("local", STORAGE_KEY) === null) saveState(); // store the sample data once
const ready = seedDefaultAccounts().catch(error => console.warn("Could not create default accounts.", error)).then(restoreSession);
