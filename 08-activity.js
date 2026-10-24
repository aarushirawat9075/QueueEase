
/* ================================================================ STEP 6: MY ACTIVITY */
function apptWindow(a) {
  const c = getCentre(a.centreId), slot = toMinutes(a.time), now = nowMinutes();
  if (a.date !== todayStr()) return { ok: false, reason: a.date > todayStr() ? "Check-in opens on " + prettyDate(a.date) + ", 60 minutes before your slot." : "This date has passed." };
  if (now < slot - 60) return { ok: false, reason: "Check-in opens at " + fromMinutes(slot - 60) + ", 60 minutes before your slot." };
  if (!state.settings.ignoreHours && now >= toMinutes(c.close)) return { ok: false, reason: "The centre has closed for the day." };
  return { ok: true, reason: now > slot + 30 ? "You are more than 30 minutes late. Staff may ask you to rebook." : "" };
}
function tokenCard(t) {
  const c = getCentre(t.centreId), svc = getService(t.svcId), f = tokenFigures(t);
  const counter = t.status === "serving" ? t.counterLabel : null;
  const next = t.status === "serving" ? `It is your turn. Go to <strong>${h(counter || "the counter")}</strong> at ${h(c.name)}.`
    : f.pos === 1 ? "You are next. Please be at the centre and stay near the counters."
    : f.pos === 2 ? "One person is ahead of you. Head to the centre now if you are not there."
    : `Plan to reach ${h(c.name)} about 15 minutes before your estimated time.`;
  const alt = t.status === "waiting" ? suggestAlternative(t.svcId, t.centreId, estimateWait(c, t.svcId, t.id).minutes) : null;
  return `<article class="track-card">
    <div class="track-head"><div><span class="eyebrow">WALK-IN TOKEN${t.apptId ? " · FROM APPOINTMENT" : ""}</span><div class="track-token">${h(t.token)}</div>
      <strong>${h(svc.name)}</strong><small>${h(c.name)} · issued ${formatTime(t.createdAt)}</small></div>
      <span class="status-chip ${t.status === "serving" ? "chip-open" : "chip-wait"}">${t.status === "serving" ? "Being served" : "Waiting"}</span></div>
    ${t.priority ? '<p class="ticket-priority">★ PRIORITY REQUESTED · verified at the counter</p>' : ""}
    <div class="journey" role="progressbar" aria-valuenow="${f.prog}" aria-valuemin="0" aria-valuemax="100" aria-label="Progress to your turn"><i style="width:${f.prog}%"></i></div>
    <div class="ticket-metrics four"><div><small>POSITION</small><strong>${f.pos === 0 ? "Now" : f.pos ? ordinal(f.pos) : "—"}</strong></div><div><small>PEOPLE AHEAD</small><strong>${f.ahead == null ? "—" : f.ahead}</strong></div>
      <div><small>EST. WAIT</small><strong>${h(f.wait)}</strong></div><div><small>QUEUE</small><strong>${getQueue(c.id, t.svcId).waiting.length} waiting</strong></div></div>
    <div class="next-alert${t.status === "serving" || f.pos <= 2 ? "" : " calm"}" role="status">${next}</div>
    ${alt ? smartTip(alt, `<button type="button" class="btn btn-secondary btn-small" data-action="go" data-route="centre|${h(alt.centre.id)}|${h(t.svcId)}">Compare ${h(alt.centre.area)}</button>`) : ""}
    <div class="row-actions"><button type="button" class="btn btn-secondary btn-small" data-action="go" data-route="centre|${h(c.id)}|${h(t.svcId)}">Centre details</button>
      ${t.status === "waiting" ? `<button type="button" class="btn btn-secondary btn-small danger-text" data-action="cancel-token" data-id="${h(t.id)}">Cancel token</button>` : ""}</div>
  </article>`;
}
function apptCard(a, past = false) {
  const c = getCentre(a.centreId), svc = getService(a.svcId);
  const win = a.status === "booked" && !past ? apptWindow(a) : null;
  const label = { booked: past ? "Missed" : "Booked", "checked-in": "Checked in", completed: "Completed", cancelled: "Cancelled", "no-show": "No-show" }[a.status] || a.status;
  const tone = { booked: past ? "chip-closed" : "chip-wait", "checked-in": "chip-open", completed: "chip-open", cancelled: "chip-closed", "no-show": "chip-closed" }[a.status];
  return `<article class="track-card appt">
    <div class="track-head"><div><span class="eyebrow">APPOINTMENT · ${h(a.ref)}</span><div class="track-when">${h(prettyDate(a.date))}, ${h(a.time)}</div>
      <strong>${h(svc ? svc.name : "Service removed")}</strong><small>${h(c ? c.name : "Centre removed")}${c ? " · " + h(c.area) : ""}</small></div>
      <span class="status-chip ${tone}">${h(label)}</span></div>
    ${a.status === "booked" && !past ? `<div class="next-alert calm">${win.ok ? "Check-in is open. Checking in adds you to today's queue at this centre." + (win.reason ? " " + h(win.reason) : "") : h(win.reason)} Bring: ${h(svc.docs[0] || "your identity proof")}</div>
      <div class="row-actions"><button type="button" class="btn btn-primary btn-small" data-action="checkin" data-id="${h(a.id)}" ${win.ok ? "" : "disabled"}>Check in</button>
      <button type="button" class="btn btn-secondary btn-small" data-action="go" data-route="centre|${h(a.centreId)}|${h(a.svcId)}">Centre details</button>
      <button type="button" class="btn btn-secondary btn-small danger-text" data-action="cancel-appt" data-id="${h(a.id)}">Cancel appointment</button></div>` : ""}
    ${a.status === "cancelled" && a.cancelledAt ? `<small class="muted">Cancelled ${formatDateTime(a.cancelledAt)}${a.cancelledBy ? " by " + h(a.cancelledBy) : ""}</small>` : ""}
  </article>`;
}
function historyRows() {
  const tokens = state.tokenLog.filter(isMine).map(t => ({ when: t.closedAt, kind: "token", t }));
  const appts = myAppointments().filter(a => a.status !== "booked" || a.date < todayStr()).filter(a => a.status !== "checked-in").map(a => ({ when: a.cancelledAt || parseDate(a.date).getTime() + toMinutes(a.time) * 60000, kind: "appt", a }));
  return [...tokens, ...appts].sort((x, y) => y.when - x.when);
}
function renderActivity() {
  const tab = route.params[0] || "active", body = $("activityBody");
  const tokens = myActiveTokens(), upcoming = myUpcoming(), hist = historyRows();
  const todays = upcoming.filter(a => a.date === todayStr());
  const tabs = [["active", "Active", tokens.length + todays.length], ["upcoming", "Upcoming appointments", upcoming.length], ["history", "History", hist.length]];
  let content = "";
  if (tab === "active") {
    content = tokens.length || todays.length
      ? `${tokens.map(tokenCard).join("")}${todays.length ? `<h3 class="mini-head">Today's appointments</h3>${todays.map(a => apptCard(a)).join("")}` : ""}`
      : emptyState("You have no active tokens or appointments today.", `<button class="btn btn-primary btn-small" data-action="go" data-route="services">Find a service</button>`);
  } else if (tab === "upcoming") {
    content = upcoming.length ? upcoming.map(a => apptCard(a)).join("") : emptyState("No upcoming appointments.", `<button class="btn btn-primary btn-small" data-action="go" data-route="services">Book a service</button>`);
  } else {
    content = hist.length ? `<div class="history-list">${hist.map(r => {
      if (r.kind === "appt") return apptCard(r.a, true);
      const t = r.t, c = getCentre(t.centreId), svc = getService(t.svcId);
      const wait = t.servingAt ? Math.max(0, Math.round((t.servingAt - t.createdAt) / 60000)) : null;
      const label = { completed: "Completed", cancelled: "Cancelled", "no-show": "No-show", removed: "Removed by staff" }[t.outcome] || t.outcome;
      return `<article class="track-card hist"><div class="track-head"><div><span class="eyebrow">TOKEN ${h(t.token)}</span><strong>${h(svc ? svc.name : "Service")}</strong>
        <small>${h(c ? c.name : "Centre")} · ${formatDateTime(t.closedAt)}${wait != null ? " · waited " + wait + " min" : ""}${t.cancelReason ? " · " + h(t.cancelReason) : ""}</small></div>
        <span class="status-chip ${t.outcome === "completed" ? "chip-open" : "chip-closed"}">${h(label)}</span></div></article>`;
    }).join("")}</div>` : emptyState("No history yet.");
  }
  body.innerHTML = `<div class="tabs" role="tablist">${tabs.map(([id, label, n]) => `<button type="button" role="tab" class="tab${tab === id ? " on" : ""}" aria-selected="${tab === id}" data-action="go" data-route="activity|${id}">${h(label)} <span class="count-pill">${n}</span></button>`).join("")}</div>
    <div class="track-list">${content}</div>
    <p class="fine-print">Positions and waits update when the queue changes in this browser (other tabs included) and every 15 seconds. They are not connected to a real centre.</p>`;
}
function cancelToken(id) {
  syncState();
  const found = findWaiting(id);
  if (!found || !isMine(found.entry)) { showToast("This token is no longer waiting.", true); renderAll(); return; }
  confirmDialog({ title: "Cancel token " + found.entry.token + "?", danger: true, confirm: "Yes, cancel token",
    body: `<p>You will leave the ${h(getService(found.entry.svcId).name)} queue at ${h(found.centre.name)}. This cannot be undone. If you come back, you will need a new token at the end of the queue.</p>`,
    onConfirm: () => {
      syncState();
      const again = findWaiting(id);
      if (!again) { showToast("This token is no longer waiting.", true); renderAll(); return; }
      again.queue.waiting = again.queue.waiting.filter(e => e.id !== id);
      closeToken(again.entry, "cancelled", { cancelReason: "Cancelled by you" });
      addActivity(`${again.entry.token} left the ${getService(again.entry.svcId).name} queue at ${again.centre.name}.`, "×", again.centre.id);
      commit();
      showToast("Token " + again.entry.token + " cancelled.");
    } });
}
function cancelAppointment(id) {
  syncState();
  const a = state.appointments.find(x => x.id === id && isMine(x));
  if (!a || a.status !== "booked") { renderAll(); return; }
  confirmDialog({ title: "Cancel appointment " + a.ref + "?", danger: true, confirm: "Yes, cancel appointment",
    body: `<p>${h(getService(a.svcId).name)} at ${h(getCentre(a.centreId).name)} on ${h(prettyDate(a.date))} at ${h(a.time)}. The slot will be released for others.</p>`,
    onConfirm: () => {
      syncState();
      const again = state.appointments.find(x => x.id === id);
      if (!again || again.status !== "booked") { renderAll(); return; }
      again.status = "cancelled"; again.cancelledAt = Date.now(); again.cancelledBy = "you";
      addActivity(`Appointment ${again.ref} was cancelled by the customer.`, "×", again.centreId);
      commit();
      showToast("Appointment " + again.ref + " cancelled.");
    } });
}
/* Check-in turns a booked appointment into a token. Appointment tokens go ahead of walk-ins
   (but behind priority requests) because they reserved a time. */
function checkInAppointment(id, byStaff = false) {
  syncState();
  const a = state.appointments.find(x => x.id === id);
  if (!a || a.status !== "booked") { renderAll(); return; }
  if (!byStaff && !isMine(a)) return;
  const c = getCentre(a.centreId), svc = getService(a.svcId);
  if (!byStaff) { const win = apptWindow(a); if (!win.ok) { showToast(win.reason, true); return; } }
  if (c.status !== "open" || (c.offers[a.svcId] && c.offers[a.svcId].interrupted)) { showToast("This service is unavailable at the centre right now. Please contact the centre.", true); return; }
  const q = getQueue(c.id, a.svcId);
  q.seq += 1;
  const entry = { id: uid("t"), token: svc.prefix + String(q.seq).padStart(3, "0"), userId: a.userId, name: a.name, centreId: c.id, svcId: a.svcId, createdAt: Date.now(), rank: 1, priority: false, apptId: a.id };
  insertEntry(q, entry);
  entry.startAhead = Math.max(0, tokenPosition(entry) - 1);
  a.status = "checked-in"; a.checkedInAt = Date.now(); a.token = entry.token;
  addActivity(`${a.name} checked in for ${a.ref} and received ${entry.token} at ${c.name}${byStaff ? " (by staff)" : ""}.`, "✓", c.id);
  notify(a.userId, `Checked in for ${a.ref}. Your token is ${entry.token} at ${c.name}.`, "✓");
  commit();
  showToast("Checked in. Token " + entry.token + ".");
  if (!byStaff) go("activity", "active");
}

/* ================================================================ OVERVIEW */
const trendHistory = [];
function totalWaiting(centreId) {
  return state.centres.filter(c => !centreId || c.id === centreId).reduce((sum, c) => sum + Object.values(state.queues[c.id] || {}).reduce((s, q) => s + q.waiting.length, 0), 0);
}
function renderOverview() {
  if (isCustomer()) return renderCustomerOverview();
  return renderStaffOverview();
}
function renderCustomerOverview() {
  const tokens = myActiveTokens(), upcoming = myUpcoming(), hero = $("roleHero");
  if (tokens.length) {
    const t = tokens[0], c = getCentre(t.centreId), f = tokenFigures(t);
    hero.innerHTML = `<div class="hero-card"><div class="ring" style="--p:${f.prog}"><div><strong>${f.pos === 0 ? "Now" : f.pos ? ordinal(f.pos) : "—"}</strong><small>in line</small></div></div>
      <div><div class="hero-token">${h(getService(t.svcId).name)} · ${h(c.name)} · token <b>${h(t.token)}</b></div>
      <h2>${t.status === "serving" ? "It is your turn" : "Estimated wait: " + h(f.wait.toLowerCase())}</h2>
      <p>${t.status === "serving" ? "Please go to " + h(t.counterLabel || "the counter") + "." : (f.ahead || 0) + " " + (f.ahead === 1 ? "person" : "people") + " ahead of you." + (tokens.length > 1 ? " You also hold " + (tokens.length - 1) + " other token." : "")}</p>
      <div class="hero-actions"><button class="btn btn-light" data-action="go" data-route="activity|active" type="button">Track my token</button><button class="btn btn-ghost" data-action="go" data-route="services" type="button">Find another service</button></div></div></div>`;
  } else {
    hero.innerHTML = `<div class="hero-card"><div class="ring" style="--p:0"><div><strong>—</strong><small>no token</small></div></div><div><h2>Where do you need to go today?</h2>
      <p>Pick a service, find a centre that offers it, then take a walk-in token or book a slot.${upcoming.length ? " Next appointment: " + h(getService(upcoming[0].svcId).name) + ", " + h(prettyDate(upcoming[0].date)) + " at " + h(upcoming[0].time) + "." : ""}</p>
      <div class="hero-actions"><button class="btn btn-light" data-action="go" data-route="services" type="button">Find a service</button><button class="btn btn-ghost" data-action="go" data-route="activity|upcoming" type="button">My appointments</button></div></div></div>`;
  }
  const p = prefs();
  $("overviewBody").innerHTML = `
    <div class="section-heading"><div><h2>Start with a service</h2></div><button class="text-button" data-action="go" data-route="services" type="button">All categories →</button></div>
    <div class="cat-grid compact">${activeCategories().map(c => `<button type="button" class="cat-card" data-action="go" data-route="services|${h(c.id)}"><span class="cat-icon tone-${h(c.tone)}">${h(c.icon)}</span><strong>${h(c.name)}</strong><span class="cat-meta">${plural(servicesInCategory(c.id).length, "service")}</span></button>`).join("")}</div>
    <div class="content-grid">
      <section class="panel"><div class="panel-heading"><h2>Upcoming appointments</h2><span class="count-pill">${upcoming.length}</span></div>
        ${upcoming.length ? upcoming.slice(0, 3).map(a => `<div class="appt-row"><div><strong>${h(getService(a.svcId).name)}</strong><small>${h(getCentre(a.centreId).name)} · ${h(prettyDate(a.date))}, ${h(a.time)} · ${h(a.ref)}</small></div><button class="btn btn-secondary btn-small" data-action="go" data-route="activity|upcoming" type="button">Open</button></div>`).join("") : emptyState("No upcoming appointments.")}</section>
      <section class="smart-panel"><div class="smart-head"><div><span class="eyebrow">SMART ASSIST · RULE-BASED</span><h2>Smart Assist</h2><p>Compares waits between centres that offer the same service and suggests a quieter one when the saving is at least ${SA_MIN_SAVING} minutes.</p></div><span class="smart-mark" aria-hidden="true">✦</span></div>
        <label class="check"><input type="checkbox" data-action="toggle-assist" ${p.smartAssist ? "checked" : ""}> Show Smart Assist suggestions</label>
        <p class="fine-print">No AI is used. Suggestions come from fixed rules and the simulated queue data, and nothing changes unless you choose it.${Object.keys(p.dismissed).length ? ` <button type="button" class="text-button" data-action="reset-tips">Show ${Object.keys(p.dismissed).length} dismissed tip(s) again</button>` : ""}</p></section>
    </div>`;
}
function staffCentreId() { return isAdmin() ? (journey.adminCentre || "") : (currentUser.centreId || state.centres[0].id); }
function renderStaffOverview() {
  const centreId = staffCentreId(), centres = state.centres.filter(c => c.active && (!centreId || c.id === centreId));
  const notes = [];
  centres.forEach(c => {
    if (c.status !== "open") notes.push(c.name + " is temporarily closed.");
    Object.keys(c.offers).forEach(id => {
      if (!centreOffers(c, id)) return;
      const q = getQueue(c.id, id), st = queueStatus(c, id);
      if (q.waiting.length && !openCountersFor(c, id).length) notes.push(`${c.area}: ${q.waiting.length} waiting for ${getService(id).name} but no counter is open.`);
      else if (st.key === "busy") notes.push(`${c.area}: ${getService(id).name} is busy (${q.waiting.length} waiting, ${waitText(st.est).toLowerCase()}).`);
      if (c.offers[id].interrupted) notes.push(`${c.area}: ${getService(id).name} interrupted. ${c.offers[id].interrupted}`);
    });
    c.counters.forEach(k => { if (k.open && !k.current && k.svcIds.some(id => getQueue(c.id, id).waiting.length)) notes.push(`${c.area}: ${k.label} is free while people are waiting.`); });
  });
  $("roleHero").innerHTML = `${isAdmin() ? `<div class="scope-bar"><label class="inline-select">Showing <select data-action="admin-scope">${["", ...state.centres.map(c => c.id)].map(id => `<option value="${h(id)}" ${id === centreId ? "selected" : ""}>${id ? h(getCentre(id).name) : "All centres"}</option>`).join("")}</select></label></div>` : ""}
    <div class="desk-grid">${centres.map(c => {
      const waiting = totalWaiting(c.id), open = c.counters.filter(k => k.open).length, serving = c.counters.filter(k => k.current).length, hours = hoursState(c);
      return `<article class="desk-card${c.status !== "open" ? " closed" : ""}"><header><strong>${h(c.name)}</strong><span class="status-chip ${c.status === "open" && hours.open ? "chip-open" : "chip-closed"}">${c.status === "open" ? (hours.open ? "Open" : "Outside hours") : "Closed"}</span></header>
        <div class="desk-now"><small>Waiting across all services</small><b>${waiting}</b><small>${serving} being served · ${open} of ${c.counters.length} counters open</small></div>
        <div class="mini-bars">${c.counters.map(k => `<span class="${k.open ? (k.current ? "busy" : "free") : "off"}" title="${h(k.label)}: ${k.open ? (k.current ? "serving " + k.current.token : "free") : "closed"}">${h(k.label.replace("Counter ", "C"))}${k.current ? " · " + h(k.current.token) : ""}</span>`).join("")}</div>
        <div class="row-actions"><button class="btn btn-primary btn-small" type="button" data-action="open-console" data-centre="${h(c.id)}">Open staff console</button></div></article>`;
    }).join("")}</div>
    <div class="attention"><strong>${notes.length ? "Needs attention" : "All queues are running normally"}</strong>${notes.length ? "<ul>" + notes.slice(0, 8).map(t => `<li>${h(t)}</li>`).join("") + (notes.length > 8 ? `<li>…and ${notes.length - 8} more.</li>` : "") + "</ul>" : "No congestion, idle counters or closed centres right now."}<small class="method-tag">Rule-based checks</small></div>`;
  const done = state.tokenLog.filter(t => t.outcome === "completed" && (!centreId || t.centreId === centreId) && t.closedAt > new Date().setHours(0, 0, 0, 0));
  const servingNow = centres.reduce((s, c) => s + c.counters.filter(k => k.current).length, 0);
  const apptsToday = state.appointments.filter(a => a.date === todayStr() && (!centreId || a.centreId === centreId) && a.status !== "cancelled").length;
  const waiting = centres.reduce((s, c) => s + totalWaiting(c.id), 0);
  sampleTrend(waiting);
  $("overviewBody").innerHTML = `
    <div class="section-heading"><div><h2>Today at a glance</h2></div><span class="subtle-text">Updated ${formatTime(Date.now())} · simulated data</span></div>
    <div class="stats-grid">
      <article class="stat-card"><div class="stat-top"><span>Waiting now</span><span class="stat-symbol tone-indigo">◷</span></div><strong>${waiting}</strong></article>
      <article class="stat-card"><div class="stat-top"><span>Being served</span><span class="stat-symbol tone-green">↗</span></div><strong>${servingNow}</strong></article>
      <article class="stat-card"><div class="stat-top"><span>Completed today</span><span class="stat-symbol tone-sky">✓</span></div><strong>${done.length}</strong></article>
      <article class="stat-card"><div class="stat-top"><span>Appointments today</span><span class="stat-symbol tone-saffron">▦</span></div><strong>${apptsToday}</strong></article>
    </div>
    <section class="panel trend-panel"><div class="panel-heading"><div><h2>Queue trend</h2><small class="subtle-text">${simTimer ? "Live demo running: activity is simulated" : "Showing changes made in this browser"}</small></div><button class="btn btn-secondary btn-small" data-action="toggle-sim" type="button">${simTimer ? "■ Stop live demo" : "▶ Run live demo"}</button></div>
      ${trendSvg()}<small class="subtle-text">People waiting across ${centreId ? "this centre" : "all centres"}, sampled on each update. The live demo adds simulated customers and counter activity.</small></section>
    <section class="panel"><div class="panel-heading"><h2>Recent activity</h2><span class="subtle-text">This browser only</span></div>
      <div class="activity-list">${state.activity.filter(a => !centreId || !a.centreId || a.centreId === centreId).slice(0, 8).map(a => `<div class="activity-item"><div class="activity-icon">${h(a.icon || "•")}</div><div class="activity-copy"><p>${h(a.message)}</p><small>${formatDateTime(a.time)}</small></div></div>`).join("") || emptyState("No activity yet.")}</div></section>`;
}
function sampleTrend(total) {
  if (!trendHistory.length || trendHistory[trendHistory.length - 1] !== total) trendHistory.push(total);
  if (trendHistory.length > 40) trendHistory.shift();
}
function trendSvg() {
  const data = trendHistory.length < 2 ? [trendHistory[0] || 0, trendHistory[0] || 0] : trendHistory, max = Math.max(5, ...data);
  const line = data.map((v, i) => (i / (data.length - 1) * 600).toFixed(1) + "," + (108 - v / max * 92).toFixed(1)).join(" ");
  return `<svg id="trendSvg" viewBox="0 0 600 120" preserveAspectRatio="none" role="img" aria-label="People waiting over recent updates, latest ${data[data.length - 1]}"><polygon points="0,120 ${line} 600,120" class="trend-fill"/><polyline points="${line}" class="trend-line" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ================================================================ PUBLIC DISPLAY */
function renderDisplay() {
  const body = $("displayBody");
  let centreId = journey.displayCentre || (isStaff() && !isAdmin() ? currentUser.centreId : "") || (journey.centreId || state.centres[0].id);
  let c = getCentre(centreId);
  if (!c) c = state.centres[0];
  const active = Object.keys(c.offers).filter(id => centreOffers(c, id));
  const withQueue = active.filter(id => getQueue(c.id, id).waiting.length);
  const nextUp = sortQueue(active.flatMap(id => getQueue(c.id, id).waiting.slice())).slice(0, 8);
  body.innerHTML = `<div class="section-heading view-heading"><div><h2>Lobby screen</h2><small class="subtle-text">Shows token numbers only. Data is simulated and refreshes from this browser.</small></div>
    <label class="display-filter-label">Centre <select data-action="display-centre">${state.centres.filter(x => x.active).map(x => `<option value="${h(x.id)}" ${x.id === c.id ? "selected" : ""}>${h(x.name)}</option>`).join("")}</select></label></div>
    <div class="public-display">
      <div class="display-head"><div class="brand brand-display"><span class="brand-mark">Q</span><span><strong>QueueEase</strong></span></div><span class="display-live"><i></i> ${h(c.name.toUpperCase())}</span></div>
      ${c.status !== "open" ? `<div class="display-current"><p class="eyebrow">NOTICE</p><p class="display-notice">${h(c.notice || "This centre is temporarily closed.")}</p></div>` : `
      <div class="display-counters">${c.counters.map(k => `<div class="display-counter${k.open ? "" : " off"}"><small>${h(k.label)}</small><b>${k.open ? (k.current ? h(k.current.token) : "—") : "Closed"}</b><span>${k.open ? (k.current ? "Please proceed" : "Free") : ""}</span></div>`).join("")}</div>
      <div class="display-next-area"><div class="display-next-heading"><h3>Up next</h3><span>${totalWaiting(c.id)} people waiting · ${withQueue.length} services with a queue</span></div>
        <div class="display-next-tokens">${nextUp.length ? nextUp.map((e, i) => `<div class="next-token${e.priority ? " is-priority" : ""}"><strong>${h(e.token)}</strong><small>${i + 1}${e.priority ? " · PRIORITY" : e.apptId ? " · APPOINTMENT" : ""}</small></div>`).join("") : `<div class="empty-state" style="grid-column:1/-1">No one is waiting right now.</div>`}</div></div>`}
      <div class="display-footer"><span>${h(c.address)}</span><span>${formatTime(Date.now())}</span></div>
    </div>`;
}
