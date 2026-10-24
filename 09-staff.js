
/* ================================================================ STAFF CONSOLE */
let staffSearch = "";
function consoleCentre() {
  const id = isAdmin() ? (journey.consoleCentre || journey.adminCentre || state.centres[0].id) : (currentUser.centreId || state.centres[0].id);
  return getCentre(id) || state.centres[0];
}
function consoleCounter(c) {
  const key = "counter_" + c.id;
  let k = c.counters.find(x => x.id === journey[key]);
  if (!k) k = c.counters.find(x => x.open) || c.counters[0];
  return k || null;
}
/* Includes services that were deactivated, so customers already waiting are never stranded. */
function counterLine(c, k) { return sortQueue(k.svcIds.flatMap(id => getQueue(c.id, id).waiting.slice())); }

function renderStaff() {
  const body = $("staffBody"), c = consoleCentre(), k = consoleCounter(c);
  const line = k ? counterLine(c, k) : [];
  const appts = state.appointments.filter(a => a.centreId === c.id && a.date === todayStr() && a.status !== "cancelled").sort((a, b) => a.time.localeCompare(b.time));
  const svcIds = Object.keys(c.offers).filter(id => centreOffers(c, id));
  body.innerHTML = `
    <div class="console-head">
      <div><span class="eyebrow">YOUR CENTRE${isAdmin() ? " (ADMIN VIEW)" : ""}</span><h2>${h(c.name)}</h2><small class="subtle-text">${h(hoursState(c).text)} · ${c.status === "open" ? "Open" : "Temporarily closed"} · ${sampleBadge()}</small></div>
      ${isAdmin() ? `<label class="inline-select">Centre <select data-action="console-centre">${state.centres.map(x => `<option value="${h(x.id)}" ${x.id === c.id ? "selected" : ""}>${h(x.name)}</option>`).join("")}</select></label>` : ""}
    </div>
    ${c.counters.length ? `<div class="staff-summary counters" role="tablist" aria-label="Counters">${c.counters.map(x => `<button type="button" role="tab" class="service-tab ${k && x.id === k.id ? "active" : ""}" data-action="pick-counter" data-id="${h(x.id)}" aria-selected="${k && x.id === k.id}">
      <strong>${h(x.label)} <span class="status-chip ${x.open ? "chip-open" : "chip-closed"}">${x.open ? "Open" : "Closed"}</span></strong>
      <small>${x.current ? "Serving " + h(x.current.token) : "No one at counter"} · ${counterLine(c, x).length} in line</small></button>`).join("")}</div>` : emptyState("This centre has no counters yet. An administrator can add them.")}
    ${k ? `<p class="kbd-hint">Shortcuts: <kbd>N</kbd> call next · <kbd>S</kbd> mark served · <kbd>K</kbd> skip to end of line · <kbd>/</kbd> search</p>
    <div class="staff-layout">
      <section class="panel queue-panel">
        <div class="panel-heading"><div><h2>${h(k.label)} line</h2><small class="subtle-text">Serves: ${h(k.svcIds.map(id => getService(id).name).join(", "))}</small></div><span class="count-pill">${line.length} waiting</span></div>
        <div class="staff-queue-list">${line.length ? line.map((p, i) => `<div class="queue-person"><div class="queue-token${p.priority ? " is-priority" : ""}">${h(p.token)}</div>
          <div class="queue-person-info"><strong>${h(p.name)}${p.priority ? ' <span class="tag-priority">PRIORITY</span>' : ""}${p.apptId ? ' <span class="tag-appt-s">APPOINTMENT</span>' : ""}${p.sample ? "" : ""}</strong>
          <small>${h(getService(p.svcId).name)} · joined ${formatTime(p.createdAt)} · position ${i + 1}${p.priority ? " · verify proof" : ""}${p.skipped ? " · skipped " + p.skipped + "×" : ""}</small></div>
          <div class="row-actions"><button class="btn btn-secondary btn-small" type="button" data-action="staff-call-id" data-id="${h(p.id)}" ${k.open && !k.current ? "" : "disabled"}>Call</button><button class="btn btn-secondary btn-small" type="button" data-action="staff-remove" data-id="${h(p.id)}">Remove</button></div></div>`).join("") : emptyState("No one is waiting for this counter.")}</div>
      </section>
      <section class="panel now-serving-panel">
        <h2>Now serving at ${h(k.label)}</h2>
        <div class="now-serving-content">${k.current ? `<div class="serving-token">${h(k.current.token)}</div><div class="serving-name">${h(k.current.name)}${k.current.priority ? ' <span class="tag-priority">PRIORITY</span>' : ""}</div><div class="serving-service">${h(getService(k.current.svcId).name)} · started ${formatTime(k.current.servingAt || Date.now())}</div>` : `<div class="empty-ticket-icon">⌁</div><strong>${k.open ? "Counter is free" : "Counter is closed"}</strong>`}</div>
        <button class="btn btn-primary btn-full" type="button" data-action="staff-served" ${k.current ? "" : "disabled"}>✓ Mark as served</button>
        <button class="btn btn-secondary btn-full" type="button" data-action="staff-next" style="margin-top:10px" ${k.open && !k.current && line.length ? "" : "disabled"}>Call next customer →</button>
        <div class="two-btn"><button class="btn btn-secondary" type="button" data-action="staff-skip" ${k.current ? "" : "disabled"}>Skip ↷</button><button class="btn btn-secondary danger-text" type="button" data-action="staff-noshow" ${k.current ? "" : "disabled"}>No-show</button></div>
        <button class="btn btn-secondary btn-full" type="button" data-action="toggle-counter" data-id="${h(k.id)}" style="margin-top:10px">${k.open ? "Close this counter" : "Open this counter"}</button>
        <p class="staff-tip"><span>i</span>Skip moves the customer to the end of their line once. A second skip marks them as a no-show.</p>
      </section>
    </div>` : ""}
    <section class="panel" style="margin-top:17px"><div class="panel-heading"><h2>Find a customer</h2><span class="subtle-text">Name, token, booking reference or mobile</span></div>
      <input id="staffSearch" type="search" placeholder="e.g. AE014, QE-1023-AB12, Asha" value="${h(staffSearch)}" autocomplete="off" aria-label="Search customers at this centre">
      <div id="staffResults">${staffSearchResults(c)}</div></section>
    <div class="content-grid">
      <section class="panel"><div class="panel-heading"><h2>Service queues</h2><span class="subtle-text">Pause stops new walk-in tokens</span></div>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>Service</th><th>Waiting</th><th>Status</th><th></th></tr></thead><tbody>
        ${svcIds.map(id => { const q = getQueue(c.id, id), st = queueStatus(c, id); return `<tr><td>${h(getService(id).name)}</td><td>${q.waiting.length}</td><td>${statusPill(st)}</td><td><button class="btn btn-secondary btn-small" type="button" data-action="toggle-pause" data-svc="${h(id)}">${q.paused ? "Resume tokens" : "Pause tokens"}</button></td></tr>`; }).join("")}
        </tbody></table></div></section>
      <section class="panel"><div class="panel-heading"><h2>Today's appointments</h2><span class="count-pill">${appts.length}</span></div>
        ${appts.length ? appts.map(a => `<div class="appt-row"><div><strong>${h(a.time)} · ${h(a.name)}</strong><small>${h(getService(a.svcId).name)} · ${h(a.ref)} · <span class="status-chip ${a.status === "booked" ? "chip-wait" : a.status === "no-show" ? "chip-closed" : "chip-open"}">${h(a.status)}</span>${a.token ? " · token " + h(a.token) : ""}</small></div>
          ${a.status === "booked" ? `<div class="row-actions"><button class="btn btn-primary btn-small" type="button" data-action="staff-checkin" data-id="${h(a.id)}">Check in</button><button class="btn btn-secondary btn-small" type="button" data-action="staff-appt-noshow" data-id="${h(a.id)}" ${toMinutes(a.time) + 30 <= nowMinutes() ? "" : "disabled title='Available 30 min after the slot'"}>No-show</button></div>` : ""}</div>`).join("") : emptyState("No appointments today at this centre.")}</section>
    </div>`;
}
function staffSearchResults(c) {
  const q = staffSearch.trim().toLowerCase();
  if (q.length < 2) return `<p class="fine-print">Type at least 2 characters.</p>`;
  const rows = [];
  c.counters.forEach(k => { if (k.current) rows.push({ type: "Being served", where: k.label, e: k.current }); });
  Object.keys(state.queues[c.id] || {}).forEach(id => getQueue(c.id, id).waiting.forEach((e, i) => rows.push({ type: "Waiting", where: getService(id).name + ", " + ordinal(i + 1) + " in service queue", e })));
  const hits = rows.filter(r => (r.e.name + " " + r.e.token).toLowerCase().includes(q));
  const appts = state.appointments.filter(a => a.centreId === c.id && a.date >= todayStr() && (a.name + " " + a.ref + " " + (a.mobile || "")).toLowerCase().includes(q));
  if (!hits.length && !appts.length) return emptyState("No matching customer at this centre.");
  return hits.map(r => `<div class="appt-row"><div><strong>${h(r.e.token)} · ${h(r.e.name)}</strong><small>${h(r.type)} · ${h(r.where)}</small></div></div>`).join("") +
    appts.map(a => `<div class="appt-row"><div><strong>${h(a.ref)} · ${h(a.name)}</strong><small>Appointment ${h(prettyDate(a.date))} ${h(a.time)} · ${h(getService(a.svcId).name)} · ${h(a.status)}</small></div>${a.status === "booked" && a.date === todayStr() ? `<button class="btn btn-primary btn-small" type="button" data-action="staff-checkin" data-id="${h(a.id)}">Check in</button>` : ""}</div>`).join("");
}

function staffGuard() { if (!isStaff()) return null; syncState(); const c = consoleCentre(), k = consoleCounter(c); return k ? { c, k } : null; }
function callEntry(c, k, entry) {
  const q = getQueue(c.id, entry.svcId);
  q.waiting = q.waiting.filter(e => e.id !== entry.id);
  entry.servingAt = Date.now(); entry.counterId = k.id;
  k.current = entry;
  addActivity(`${entry.token} called to ${k.label} at ${c.name}.`, "→", c.id);
  notify(entry.userId, `${entry.token}: it is your turn. Please go to ${k.label} at ${c.name}.`, "📢");
}
function staffCallNext(entryId) {
  const g = staffGuard(); if (!g) return;
  const { c, k } = g;
  if (!k.open) return showToast(k.label + " is closed. Open it first.", true);
  if (k.current) return showToast("Finish " + k.current.token + " before calling the next customer.", true);
  const line = counterLine(c, k), entry = entryId ? line.find(e => e.id === entryId) : line[0];
  if (!entry) { renderAll(); return showToast("No one is waiting for " + k.label + ".", true); }
  callEntry(c, k, entry);
  commit();
  showToast("Now serving " + entry.token + " at " + k.label + ".");
}
function staffMarkServed() {
  const g = staffGuard(); if (!g) return;
  const { c, k } = g;
  if (!k.current) { renderAll(); return showToast("No customer at this counter.", true); }
  const e = k.current;
  closeToken(e, "completed", { completedAt: Date.now(), counterId: k.id });
  k.current = null;
  addActivity(`${e.token} completed ${getService(e.svcId).name} at ${c.name}.`, "✓", c.id);
  notify(e.userId, `${e.token}: service completed at ${c.name}. Thank you for visiting.`, "✓");
  commit();
  showToast(e.token + " marked as served.");
}
function staffSkip(noShow = false) {
  const g = staffGuard(); if (!g) return;
  const { c, k } = g;
  const e = k.current;
  if (!e) { renderAll(); return showToast("No customer at this counter.", true); }
  k.current = null;
  if (noShow || e.skipped) {
    closeToken(e, "no-show", { counterId: k.id });
    addActivity(`${e.token} marked as a no-show at ${c.name}.`, "↷", c.id);
    notify(e.userId, `${e.token} was marked as a no-show at ${c.name}. Take a new token if you still need the service.`, "⚠");
    commit();
    showToast(e.token + " marked as a no-show.");
    return;
  }
  delete e.servingAt; delete e.counterId;
  e.skipped = (e.skipped || 0) + 1; e.queuedAt = Date.now(); e.rank = Math.max(e.rank, 2);
  insertEntry(getQueue(c.id, e.svcId), e);
  addActivity(`${e.token} did not respond at ${k.label} and moved to the end of the line.`, "↷", c.id);
  notify(e.userId, `${e.token}: you were called at ${c.name} but missed your turn, so you moved to the end of the line.`, "⚠");
  commit();
  showToast(e.token + " moved to the end of the line.");
}
function staffRemove(entryId) {
  if (!isStaff()) return;
  const found = findWaiting(entryId); if (!found) return renderAll();
  confirmDialog({ title: "Remove " + found.entry.token + " from the queue?", danger: true, confirm: "Remove token",
    body: `<p>${h(found.entry.name)} will be removed from the ${h(getService(found.entry.svcId).name)} queue and notified in the app.</p>`,
    onConfirm: () => {
      syncState();
      const again = findWaiting(entryId); if (!again) return renderAll();
      again.queue.waiting = again.queue.waiting.filter(e => e.id !== entryId);
      closeToken(again.entry, "removed", { cancelReason: "Removed by staff" });
      addActivity(`${again.entry.token} was removed from the queue by staff.`, "×", again.centre.id);
      notify(again.entry.userId, `${again.entry.token} was removed from the queue at ${again.centre.name} by staff.`, "⚠");
      commit();
    } });
}
function toggleCounter(id) {
  if (!isStaff()) return;
  syncState();
  const found = counterById(id); if (!found) return;
  const { centre, counter } = found;
  if (!isAdmin() && centre.id !== currentUser.centreId) return;
  if (counter.open && counter.current) return showToast("Finish or skip " + counter.current.token + " before closing this counter.", true);
  counter.open = !counter.open;
  addActivity(`${counter.label} at ${centre.name} ${counter.open ? "opened" : "closed"}.`, "⚙", centre.id);
  commit();
  showToast(counter.label + (counter.open ? " opened." : " closed."));
}
function togglePause(svcId) {
  if (!isStaff()) return;
  syncState();
  const c = consoleCentre(), q = getQueue(c.id, svcId);
  q.paused = !q.paused;
  addActivity(`New tokens for ${getService(svcId).name} at ${c.name} ${q.paused ? "paused" : "resumed"}.`, q.paused ? "⏸" : "▶", c.id);
  commit();
}
function staffApptNoShow(id) {
  syncState();
  const a = state.appointments.find(x => x.id === id && x.status === "booked"); if (!a) return renderAll();
  a.status = "no-show";
  addActivity(`Appointment ${a.ref} marked as a no-show.`, "↷", a.centreId);
  notify(a.userId, `Appointment ${a.ref} was marked as a no-show. You can book another slot.`, "⚠");
  commit();
}
