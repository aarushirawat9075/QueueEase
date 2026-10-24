
/* ================================================================ ADMINISTRATION */
const TONES = ["teal", "sky", "green", "indigo", "amber", "rose", "slate"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function adminGuard() { if (!isAdmin()) { showToast("Only administrators can do this.", true); return false; } syncState(); return true; }

function renderAdmin() {
  if (!isAdmin()) return;
  const tab = route.params[0] || "catalogue", body = $("adminBody");
  const tabs = [["catalogue", "Services catalogue"], ["centres", "Centres, counters & slots"], ["staff", "Staff"], ["analytics", "Analytics"], ["settings", "Settings"]];
  const views = { catalogue: adminCatalogue, centres: adminCentres, staff: adminStaff, analytics: adminAnalytics, settings: adminSettings };
  body.innerHTML = `<div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button type="button" role="tab" class="tab${tab === id ? " on" : ""}" aria-selected="${tab === id}" data-action="go" data-route="admin|${id}">${h(label)}</button>`).join("")}</div>
    <div class="admin-pane">${(views[tab] || adminCatalogue)()}</div>`;
}

/* ---------------------------------------------------------------- catalogue */
function adminCatalogue() {
  const filter = journey.adminCat || "";
  const services = state.services.filter(s => !filter || s.catId === filter);
  return `<section class="panel"><div class="panel-heading"><div><h2>Service categories</h2><small class="subtle-text">Inactive categories and their services are hidden from customers.</small></div><button class="btn btn-primary btn-small" type="button" data-action="edit-cat">＋ Add category</button></div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th></th><th>Category</th><th>Services</th><th>Status</th><th></th></tr></thead><tbody>
    ${state.categories.map(c => `<tr><td><span class="cat-icon sm tone-${h(c.tone)}">${h(c.icon)}</span></td><td><strong>${h(c.name)}</strong><br><small class="muted">${h(c.desc)}</small></td><td>${state.services.filter(s => s.catId === c.id).length}</td>
      <td><span class="status-chip ${c.active ? "chip-open" : "chip-closed"}">${c.active ? "Active" : "Inactive"}</span></td>
      <td class="row-actions"><button class="btn btn-secondary btn-small" type="button" data-action="edit-cat" data-id="${h(c.id)}">Edit</button><button class="btn btn-secondary btn-small" type="button" data-action="toggle-cat" data-id="${h(c.id)}">${c.active ? "Deactivate" : "Activate"}</button></td></tr>`).join("")}
    </tbody></table></div></section>
    <section class="panel" style="margin-top:17px"><div class="panel-heading"><div><h2>Services</h2><small class="subtle-text">Deactivating a service stops new tokens and bookings. Existing tokens can still be served.</small></div>
      <div class="row-actions"><label class="inline-select">Category <select data-action="admin-cat-filter"><option value="">All</option>${state.categories.map(c => `<option value="${h(c.id)}" ${filter === c.id ? "selected" : ""}>${h(c.name)}</option>`).join("")}</select></label>
      <button class="btn btn-primary btn-small" type="button" data-action="edit-svc">＋ Add service</button></div></div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Service</th><th>Code</th><th>Walk-in</th><th>Appt</th><th>Typical min</th><th>Centres</th><th>Status</th><th></th></tr></thead><tbody>
    ${services.map(s => `<tr><td><strong>${h(s.name)}</strong><br><small class="muted">${h(getCategory(s.catId) ? getCategory(s.catId).name : "No category")}</small></td><td>${h(s.prefix)}</td><td>${s.walkIn ? "Yes" : "No"}</td><td>${s.appt ? "Yes" : "No"}</td><td>${s.minutes}</td>
      <td>${state.centres.filter(c => c.offers[s.id]).length}</td><td><span class="status-chip ${s.active ? "chip-open" : "chip-closed"}">${s.active ? "Active" : "Inactive"}</span></td>
      <td class="row-actions"><button class="btn btn-secondary btn-small" type="button" data-action="edit-svc" data-id="${h(s.id)}">Edit</button><button class="btn btn-secondary btn-small" type="button" data-action="toggle-svc" data-id="${h(s.id)}">${s.active ? "Deactivate" : "Activate"}</button></td></tr>`).join("") || `<tr><td colspan="8">${emptyState("No services in this category.")}</td></tr>`}
    </tbody></table></div></section>`;
}
function editCategory(id) {
  const c = id ? getCategory(id) : { name: "", icon: "◆", tone: "indigo", desc: "", active: true };
  openModal(`<h2 id="modalTitle">${id ? "Edit category" : "Add category"}</h2><form id="catForm" class="modal-body form-grid" novalidate>
    <label for="cfName">Name</label><input id="cfName" maxlength="50" value="${h(c.name)}">
    <label for="cfDesc">Short description</label><input id="cfDesc" maxlength="140" value="${h(c.desc)}">
    <div class="two-col"><div><label for="cfIcon">Icon (one symbol)</label><input id="cfIcon" maxlength="2" value="${h(c.icon)}"></div>
    <div><label for="cfTone">Colour</label><select id="cfTone">${TONES.map(t => `<option ${t === c.tone ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>
    <div id="cfMsg" class="form-message" role="status"></div>
    <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Save category</button></div></form>`);
  $("catForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("cfName").value.trim(), desc = $("cfDesc").value.trim(), icon = $("cfIcon").value.trim() || "◆";
    if (name.length < 3) { $("cfMsg").textContent = "Enter a category name (at least 3 characters)."; return; }
    if (!adminGuard()) return;
    if (state.categories.some(x => x.name.toLowerCase() === name.toLowerCase() && x.id !== id)) { $("cfMsg").textContent = "A category with this name already exists."; return; }
    if (id) Object.assign(getCategory(id), { name, desc, icon, tone: $("cfTone").value });
    else state.categories.push({ id: "cat-" + Date.now().toString(36), name, desc, icon, tone: $("cfTone").value, active: true });
    addActivity(`Category "${name}" ${id ? "updated" : "added"} by an administrator.`, "⚙");
    closeModal(); commit(); showToast("Category saved.");
  });
}
function editService(id) {
  const s = id ? getService(id) : { catId: journey.adminCat || state.categories[0].id, name: "", prefix: "", desc: "", minutes: 10, walkIn: true, appt: true, notes: "", docs: [], fee: "", active: true };
  openModal(`<h2 id="modalTitle">${id ? "Edit service" : "Add service"}</h2><form id="svcForm" class="modal-body form-grid" novalidate>
    <div class="two-col"><div><label for="sfCat">Category</label><select id="sfCat">${state.categories.map(c => `<option value="${h(c.id)}" ${c.id === s.catId ? "selected" : ""}>${h(c.name)}</option>`).join("")}</select></div>
    <div><label for="sfPrefix">Token code (2 letters)</label><input id="sfPrefix" maxlength="2" value="${h(s.prefix)}" ${id ? "readonly title='Codes are fixed once tokens exist'" : ""}></div></div>
    <label for="sfName">Service name</label><input id="sfName" maxlength="60" value="${h(s.name)}">
    <label for="sfDesc">Description</label><input id="sfDesc" maxlength="160" value="${h(s.desc)}">
    <div class="two-col"><div><label for="sfMin">Typical minutes at the counter</label><input id="sfMin" type="number" min="1" max="120" value="${s.minutes}"></div>
    <div><label for="sfFee">Fee (leave blank unless verified)</label><input id="sfFee" maxlength="40" value="${h(s.fee || "")}" placeholder="e.g. ₹50 (verified 2026)"></div></div>
    <div class="check-row"><label class="check"><input type="checkbox" id="sfWalk" ${s.walkIn ? "checked" : ""}> Walk-in tokens allowed</label><label class="check"><input type="checkbox" id="sfAppt" ${s.appt ? "checked" : ""}> Appointments allowed</label></div>
    <label for="sfNotes">Eligibility or process notes</label><input id="sfNotes" maxlength="200" value="${h(s.notes)}">
    <label for="sfDocs">Documents to bring (one per line)</label><textarea id="sfDocs" rows="3">${h(s.docs.join("\n"))}</textarea>
    <div id="sfMsg" class="form-message" role="status"></div>
    <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Save service</button></div></form>`, { wide: true });
  $("svcForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("sfName").value.trim(), prefix = $("sfPrefix").value.trim().toUpperCase(), minutes = Number($("sfMin").value);
    const walkIn = $("sfWalk").checked, appt = $("sfAppt").checked, msg = $("sfMsg");
    if (name.length < 3) { msg.textContent = "Enter a service name."; return; }
    if (!/^[A-Z]{2}$/.test(prefix)) { msg.textContent = "The token code must be exactly 2 letters."; return; }
    if (!(minutes >= 1 && minutes <= 120)) { msg.textContent = "Typical minutes must be between 1 and 120."; return; }
    if (!walkIn && !appt) { msg.textContent = "Allow walk-in tokens, appointments, or both."; return; }
    if (!adminGuard()) return;
    if (state.services.some(x => x.prefix === prefix && x.id !== id)) { msg.textContent = "Another service already uses code " + prefix + "."; return; }
    const data = { catId: $("sfCat").value, name, prefix, minutes, walkIn, appt, desc: $("sfDesc").value.trim(), notes: $("sfNotes").value.trim(),
      docs: $("sfDocs").value.split("\n").map(x => x.trim()).filter(Boolean), fee: $("sfFee").value.trim() };
    if (id) Object.assign(getService(id), data);
    else state.services.push({ id: "svc-" + Date.now().toString(36), active: true, ...data });
    addActivity(`Service "${name}" ${id ? "updated" : "added"}. ${id ? "" : "Add it to centres under Centres to make it bookable."}`, "⚙");
    closeModal(); commit();
    showToast(id ? "Service saved." : "Service added. Now offer it at one or more centres.");
  });
}

/* ---------------------------------------------------------------- centres */
function adminCentres() {
  const c = getCentre(journey.adminEditCentre) || state.centres[0];
  const section = journey.adminCentreTab || "details";
  const sections = [["details", "Details & hours"], ["services", "Services offered"], ["counters", "Counters"], ["slots", "Appointment slots"]];
  return `<div class="admin-split">
    <section class="panel centre-picker"><div class="panel-heading"><h2>Centres</h2><button class="btn btn-primary btn-small" type="button" data-action="add-centre">＋ Add</button></div>
      ${state.centres.map(x => `<button type="button" class="picker-row${x.id === c.id ? " on" : ""}" data-action="admin-pick-centre" data-id="${h(x.id)}"><strong>${h(x.name)}</strong><small>${Object.keys(x.offers).length} services · ${x.counters.length} counters · <span class="${x.active && x.status === "open" ? "ok" : "warn"}">${!x.active ? "Hidden" : x.status === "open" ? "Open" : "Closed"}</span></small></button>`).join("")}</section>
    <section class="panel"><div class="panel-heading"><div><h2>${h(c.name)}</h2><small class="subtle-text">${h(c.id)} · changes apply to customers immediately</small></div>${sampleBadge()}</div>
      <div class="subtabs">${sections.map(([id, label]) => `<button type="button" class="${section === id ? "on" : ""}" data-action="admin-centre-tab" data-tab="${id}">${h(label)}</button>`).join("")}</div>
      ${section === "details" ? centreDetailsForm(c) : section === "services" ? centreServicesForm(c) : section === "counters" ? centreCountersPanel(c) : centreSlotsForm(c)}
    </section></div>`;
}
function centreDetailsForm(c) {
  return `<form id="centreForm" class="form-grid" novalidate data-id="${h(c.id)}">
    <div class="two-col"><div><label for="ctName">Name</label><input id="ctName" maxlength="60" value="${h(c.name)}"></div><div><label for="ctKind">Type</label><input id="ctKind" maxlength="40" value="${h(c.kind)}"></div></div>
    <label for="ctAddr">Address</label><input id="ctAddr" maxlength="120" value="${h(c.address)}">
    <div class="three-col"><div><label for="ctArea">Area / locality</label><input id="ctArea" maxlength="40" value="${h(c.area)}"></div><div><label for="ctCity">City</label><input id="ctCity" maxlength="40" value="${h(c.city)}"></div><div><label for="ctPin">PIN code</label><input id="ctPin" maxlength="6" inputmode="numeric" value="${h(c.pin)}"></div></div>
    <div class="two-col"><div><label for="ctLat">Latitude</label><input id="ctLat" type="number" step="0.0001" value="${c.lat}"></div><div><label for="ctLng">Longitude</label><input id="ctLng" type="number" step="0.0001" value="${c.lng}"></div></div>
    <div class="three-col"><div><label for="ctOpen">Opens</label><input id="ctOpen" type="time" value="${h(c.open)}"></div><div><label for="ctClose">Closes</label><input id="ctClose" type="time" value="${h(c.close)}"></div><div><label for="ctCut">Stop walk-in tokens (min before closing)</label><input id="ctCut" type="number" min="0" max="120" value="${c.tokenCutoff}"></div></div>
    <label>Open on</label><div class="check-row">${DAY_NAMES.map((d, i) => `<label class="check"><input type="checkbox" data-day="${i}" ${c.days.includes(i) ? "checked" : ""}> ${d}</label>`).join("")}</div>
    <div class="two-col"><div><label for="ctStatus">Operating status</label><select id="ctStatus"><option value="open" ${c.status === "open" ? "selected" : ""}>Open</option><option value="closed" ${c.status === "closed" ? "selected" : ""}>Temporarily closed</option></select></div>
    <div><label for="ctActive">Visible to customers</label><select id="ctActive"><option value="1" ${c.active ? "selected" : ""}>Yes</option><option value="0" ${c.active ? "" : "selected"}>No (hidden)</option></select></div></div>
    <label for="ctNotice">Public notice (interruptions, closures)</label><input id="ctNotice" maxlength="160" value="${h(c.notice)}" placeholder="Shown on the centre page">
    <div id="ctMsg" class="form-message" role="status"></div>
    <button class="btn btn-primary" type="submit">Save details</button></form>`;
}
function centreServicesForm(c) {
  return `<form id="offersForm" data-id="${h(c.id)}" novalidate><p class="fine-print">Tick the services this centre offers, and whether it takes walk-ins and appointments for each. An interruption note pauses that service and is shown to customers.</p>
    <div class="table-scroll"><table class="data-table offers"><thead><tr><th>Offered</th><th>Service</th><th>Walk-in</th><th>Appt</th><th>Interruption note</th><th>Queue</th></tr></thead><tbody>
    ${state.services.map(s => { const o = c.offers[s.id], q = o ? getQueue(c.id, s.id) : null;
      return `<tr class="${o ? "" : "muted-row"}"><td><input type="checkbox" data-offer="${h(s.id)}" ${o ? "checked" : ""} aria-label="Offer ${h(s.name)}"></td><td><strong>${h(s.name)}</strong><br><small class="muted">${h(getCategory(s.catId) ? getCategory(s.catId).name : "")}${s.active ? "" : " · inactive service"}</small></td>
      <td><input type="checkbox" data-walk="${h(s.id)}" ${o && o.walkIn ? "checked" : ""} ${s.walkIn ? "" : "disabled title='Walk-in is off for this service'"} aria-label="Walk-in"></td>
      <td><input type="checkbox" data-appt="${h(s.id)}" ${o && o.appt ? "checked" : ""} ${s.appt ? "" : "disabled title='Appointments are off for this service'"} aria-label="Appointments"></td>
      <td><input type="text" data-int="${h(s.id)}" maxlength="120" value="${h(o ? o.interrupted : "")}" placeholder="None" aria-label="Interruption note"></td><td>${q ? q.waiting.length + " waiting" : "—"}</td></tr>`; }).join("")}
    </tbody></table></div><div id="ofMsg" class="form-message" role="status"></div><button class="btn btn-primary" type="submit">Save services</button></form>`;
}
function centreCountersPanel(c) {
  const offered = Object.keys(c.offers);
  return `<div class="panel-heading"><small class="subtle-text">Each counter serves one or more services. Customers' waits are worked out from the open counters.</small><button class="btn btn-primary btn-small" type="button" data-action="edit-counter" data-centre="${h(c.id)}">＋ Add counter</button></div>
    ${c.counters.length ? c.counters.map(k => `<div class="staff-row"><div><strong>${h(k.label)} <span class="status-chip ${k.open ? "chip-open" : "chip-closed"}">${k.open ? "Open" : "Closed"}</span></strong><small>${h(k.svcIds.map(id => getService(id) ? getService(id).name : id).join(", ") || "No services")}${k.current ? " · serving " + h(k.current.token) : ""}</small></div>
      <div class="row-actions"><button class="btn btn-secondary btn-small" type="button" data-action="edit-counter" data-centre="${h(c.id)}" data-id="${h(k.id)}">Edit</button><button class="btn btn-secondary btn-small" type="button" data-action="toggle-counter" data-id="${h(k.id)}">${k.open ? "Close" : "Open"}</button><button class="btn btn-secondary btn-small danger-text" type="button" data-action="remove-counter" data-centre="${h(c.id)}" data-id="${h(k.id)}">Remove</button></div></div>`).join("") : emptyState("No counters yet.")}
    ${offered.filter(id => !c.counters.some(k => k.svcIds.includes(id))).length ? `<div class="notice-bar">No counter serves: ${h(offered.filter(id => !c.counters.some(k => k.svcIds.includes(id))).map(id => getService(id).name).join(", "))}. Walk-in tokens for these stay paused.</div>` : ""}`;
}
function editCounter(centreId, id) {
  const c = getCentre(centreId), k = id ? c.counters.find(x => x.id === id) : { label: "Counter " + (c.counters.length + 1), svcIds: [], open: true };
  openModal(`<h2 id="modalTitle">${id ? "Edit counter" : "Add counter"}</h2><form id="counterForm" class="modal-body form-grid" novalidate>
    <label for="kfLabel">Label</label><input id="kfLabel" maxlength="30" value="${h(k.label)}">
    <label>Services this counter serves</label><div class="check-list">${Object.keys(c.offers).map(sid => `<label class="check"><input type="checkbox" data-ksvc="${h(sid)}" ${k.svcIds.includes(sid) ? "checked" : ""}> ${h(getService(sid).name)}</label>`).join("") || '<p class="muted">Offer some services at this centre first.</p>'}</div>
    <div id="kfMsg" class="form-message" role="status"></div>
    <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Save counter</button></div></form>`, { wide: true });
  $("counterForm").addEventListener("submit", e => {
    e.preventDefault();
    const label = $("kfLabel").value.trim(), svcIds = [...document.querySelectorAll("[data-ksvc]:checked")].map(x => x.dataset.ksvc);
    if (label.length < 2) { $("kfMsg").textContent = "Enter a counter label."; return; }
    if (!svcIds.length) { $("kfMsg").textContent = "Choose at least one service."; return; }
    if (!adminGuard()) return;
    const centre = getCentre(centreId);
    if (centre.counters.some(x => x.label.toLowerCase() === label.toLowerCase() && x.id !== id)) { $("kfMsg").textContent = "Another counter already has this label."; return; }
    if (id) { const kk = centre.counters.find(x => x.id === id); if (kk.current && !svcIds.includes(kk.current.svcId)) { $("kfMsg").textContent = "This counter is serving " + kk.current.token + " for a service you removed. Finish it first."; return; } Object.assign(kk, { label, svcIds }); }
    else centre.counters.push({ id: centre.id + "-K" + Date.now().toString(36), label, svcIds, open: true, current: null });
    addActivity(`${label} at ${centre.name} ${id ? "updated" : "added"}.`, "⚙", centre.id);
    closeModal(); commit(); showToast("Counter saved.");
  });
}
function removeCounter(centreId, id) {
  const c = getCentre(centreId), k = c.counters.find(x => x.id === id);
  if (k.current) return showToast("Finish " + k.current.token + " at this counter first.", true);
  confirmDialog({ title: "Remove " + k.label + "?", danger: true, confirm: "Remove counter", body: "<p>Waiting customers keep their place. Their estimates will update to the counters that remain.</p>",
    onConfirm: () => { if (!adminGuard()) return; const centre = getCentre(centreId); centre.counters = centre.counters.filter(x => x.id !== id); addActivity(`${k.label} removed from ${centre.name}.`, "⚙", centre.id); commit(); } });
}
function centreSlotsForm(c) {
  const preview = slotTimes(c);
  return `<form id="slotsForm" class="form-grid" data-id="${h(c.id)}" novalidate>
    <div class="three-col"><div><label for="slLen">Slot length</label><select id="slLen">${[15, 20, 30, 45, 60].map(m => `<option value="${m}" ${c.slotMinutes === m ? "selected" : ""}>${m} minutes</option>`).join("")}</select></div>
    <div><label for="slCap">Bookings per slot, per service</label><input id="slCap" type="number" min="1" max="10" value="${c.slotCapacity}"></div>
    <div><label for="slDays">Bookable days ahead</label><input id="slDays" type="number" min="1" max="30" value="${c.bookDays}"></div></div>
    <p class="fine-print">Slots run from ${h(c.open)} to ${h(c.close)} on open days: ${h(preview.join(", ") || "none")}.</p>
    <label for="slClosed">Closed dates (holidays)</label><div class="loc-row"><input id="slClosed" type="date" min="${todayStr()}"><button class="btn btn-secondary" type="button" data-action="add-closed-date" data-id="${h(c.id)}">Add date</button></div>
    <div class="tag-row">${c.closedDates.length ? c.closedDates.slice().sort().map(d => `<span class="tag">${h(prettyDate(d))} <button type="button" class="tag-x" data-action="remove-closed-date" data-id="${h(c.id)}" data-date="${h(d)}" aria-label="Remove ${h(d)}">×</button></span>`).join("") : '<span class="muted">No closed dates.</span>'}</div>
    <div id="slMsg" class="form-message" role="status"></div>
    <button class="btn btn-primary" type="submit">Save slot settings</button>
    <p class="fine-print">Existing bookings keep their time even if the slot length changes.</p></form>`;
}

/* ---------------------------------------------------------------- staff accounts */
function adminStaff() {
  const staff = loadUsers().filter(u => u.role === "staff");
  return `<section class="panel"><div class="panel-heading"><div><h2>Staff accounts</h2><small class="subtle-text">New staff register with the access code ${h(STAFF_ACCESS_CODE)}, then you assign their centre here.</small></div><span class="count-pill">${staff.length}</span></div>
    ${staff.length ? staff.map(u => `<div class="staff-row"><div><strong>${h(u.name)}</strong><small>@${h(u.username)} · joined ${h(new Date(u.createdAt).toLocaleDateString())}</small></div>
      <div class="row-actions"><label class="inline-select">Centre <select data-action="assign-staff" data-id="${h(u.id)}">${state.centres.map(c => `<option value="${h(c.id)}" ${u.centreId === c.id ? "selected" : ""}>${h(c.name)}</option>`).join("")}</select></label>
      ${u.username === "staff" ? '<span class="status-chip chip-wait">Demo account</span>' : `<button class="btn btn-secondary btn-small danger-text" type="button" data-action="remove-staff" data-id="${h(u.id)}">Remove</button>`}</div></div>`).join("") : emptyState("No staff accounts.")}</section>`;
}

/* ---------------------------------------------------------------- analytics */
function adminAnalytics() {
  const range = journey.adminRange || "today";
  const since = range === "today" ? new Date().setHours(0, 0, 0, 0) : range === "7d" ? Date.now() - 7 * 864e5 : 0;
  const log = state.tokenLog.filter(t => t.closedAt >= since);
  const done = log.filter(t => t.outcome === "completed");
  const waits = done.filter(t => t.servingAt).map(t => (t.servingAt - t.createdAt) / 60000);
  const serv = done.filter(t => t.servingAt && t.completedAt).map(t => (t.completedAt - t.servingAt) / 60000);
  const avg = list => list.length ? (list.reduce((a, b) => a + b, 0) / list.length) : 0;
  const noShow = log.filter(t => t.outcome === "no-show").length, cancelled = log.filter(t => t.outcome === "cancelled").length;
  const appts = state.appointments.filter(a => (a.createdAt || 0) >= since || a.date >= dateStr(new Date(since || 0)));
  const apptBy = s => appts.filter(a => a.status === s).length;
  const byCentre = state.centres.map(c => ({ label: c.area, value: done.filter(t => t.centreId === c.id).length, wait: avg(done.filter(t => t.centreId === c.id && t.servingAt).map(t => (t.servingAt - t.createdAt) / 60000)), now: totalWaiting(c.id) }));
  const demand = state.services.map(s => ({ label: s.name, value: log.filter(t => t.svcId === s.id).length + state.centres.reduce((n, c) => n + (state.queues[c.id][s.id] ? state.queues[c.id][s.id].waiting.length : 0), 0) + appts.filter(a => a.svcId === s.id).length })).filter(x => x.value).sort((a, b) => b.value - a.value).slice(0, 8);
  const bars = (rows, fmt = v => v) => { const max = Math.max(1, ...rows.map(r => r.value)); return rows.map(r => `<div class="hbar"><span class="hbar-label">${h(r.label)}</span><span class="hbar-track"><i style="width:${r.value / max * 100}%"></i></span><b>${h(fmt(r.value))}</b></div>`).join(""); };
  return `<div class="panel-heading"><div><h2>Analytics</h2><small class="subtle-text">Calculated from the data in this browser, including simulated sample data.</small></div>
    <div class="row-actions"><div class="seg">${[["today", "Today"], ["7d", "7 days"], ["all", "All data"]].map(([v, t]) => `<button type="button" class="${range === v ? "on" : ""}" data-action="admin-range" data-v="${v}">${t}</button>`).join("")}</div>
    <button class="btn btn-secondary btn-small" type="button" data-action="export-tokens">Export tokens (CSV)</button><button class="btn btn-secondary btn-small" type="button" data-action="export-appts">Export appointments (CSV)</button></div></div>
    <div class="stats-grid">
      <article class="stat-card"><div class="stat-top"><span>Tokens served</span><span class="stat-symbol tone-green">✓</span></div><strong>${done.length}</strong><small>${cancelled} cancelled · ${noShow} no-shows</small></article>
      <article class="stat-card"><div class="stat-top"><span>Avg actual wait</span><span class="stat-symbol tone-indigo">◷</span></div><strong>${avg(waits).toFixed(0)} min</strong><small>joined → called</small></article>
      <article class="stat-card"><div class="stat-top"><span>Avg time at counter</span><span class="stat-symbol tone-sky">⏱</span></div><strong>${avg(serv).toFixed(1)} min</strong><small>called → served</small></article>
      <article class="stat-card"><div class="stat-top"><span>No-show rate</span><span class="stat-symbol tone-saffron">↷</span></div><strong>${log.length ? Math.round(noShow / log.length * 100) : 0}%</strong><small>of closed tokens</small></article>
    </div>
    <div class="content-grid">
      <section class="panel"><div class="panel-heading"><h2>Tokens served by centre</h2></div>${bars(byCentre)}</section>
      <section class="panel"><div class="panel-heading"><h2>Most requested services</h2></div>${demand.length ? bars(demand) : emptyState("No demand recorded yet.")}<small class="fine-print">Closed tokens + people waiting + appointments.</small></section>
    </div>
    <div class="content-grid">
      <section class="panel"><div class="panel-heading"><h2>Average wait by centre (min)</h2></div>${bars(byCentre.map(r => ({ label: r.label, value: Math.round(r.wait) })))}</section>
      <section class="panel"><div class="panel-heading"><h2>Appointments</h2></div>
        ${bars([{ label: "Booked (upcoming)", value: apptBy("booked") }, { label: "Checked in", value: apptBy("checked-in") }, { label: "Completed", value: apptBy("completed") }, { label: "Cancelled", value: apptBy("cancelled") }, { label: "No-show", value: apptBy("no-show") }])}</section>
    </div>
    <section class="panel" style="margin-top:17px"><div class="panel-heading"><h2>People waiting right now</h2></div>${bars(byCentre.map(r => ({ label: r.label, value: r.now })))}</section>`;
}
function downloadCSV(file, rows) {
  const text = rows.map(r => r.map(v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"').join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); link.download = file;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function exportTokens() {
  const iso = t => t ? new Date(t).toISOString() : "";
  downloadCSV("queueease_tokens.csv", [["Token", "Customer", "Centre", "Service", "Outcome", "Joined", "Called", "Closed", "Priority", "From appointment", "Sample data"],
    ...state.tokenLog.map(t => [t.token, t.name, (getCentre(t.centreId) || {}).name, (getService(t.svcId) || {}).name, t.outcome, iso(t.createdAt), iso(t.servingAt), iso(t.closedAt), t.priority ? "yes" : "no", t.apptId ? "yes" : "no", t.sample ? "yes" : "no"])]);
}
function exportAppts() {
  downloadCSV("queueease_appointments.csv", [["Reference", "Date", "Time", "Customer", "Centre", "Service", "Status", "Sample data"],
    ...state.appointments.map(a => [a.ref, a.date, a.time, a.name, (getCentre(a.centreId) || {}).name, (getService(a.svcId) || {}).name, a.status, a.sample ? "yes" : "no"])]);
}

/* ---------------------------------------------------------------- settings */
function adminSettings() {
  return `<section class="panel"><div class="panel-heading"><h2>Demo settings</h2></div>
    <label class="check big"><input type="checkbox" data-action="toggle-hours" ${state.settings.ignoreHours ? "checked" : ""}> <span><strong>Ignore opening hours (demo override)</strong><small>Lets you demonstrate walk-in tokens outside centre hours. Shown to customers as "demo: opening hours ignored".</small></span></label>
    <div class="row-actions" style="margin-top:14px"><button class="btn btn-secondary" type="button" data-action="reset-data">↻ Reset all demo data</button></div>
    <p class="fine-print">Reset restores the sample catalogue, centres, queues and appointments. User accounts are kept.</p></section>
    <section class="panel" style="margin-top:17px"><div class="panel-heading"><h2>What a real deployment needs</h2></div>
      <ul class="plain-list"><li>A shared database and server API. This prototype keeps everything in one browser's storage, so other devices cannot see it.</li>
      <li>Real-time sync (for example WebSockets) between customer phones, staff counters and lobby screens.</li>
      <li>Server-side authentication and role checks. Browser-only hashing is not real security.</li>
      <li>Verified centre, service, fee and document data from the official source.</li>
      <li>An SMS or push provider for notifications. This prototype only shows in-app updates.</li></ul></section>`;
}
