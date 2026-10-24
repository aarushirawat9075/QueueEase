
/* ================================================================ STEP 4-5: CENTRE DETAILS, TOKEN, APPOINTMENT */
let booking = { key: "", date: "", time: "" };
let lastRefresh = Date.now();

function renderCentre() {
  const [centreId, svcId] = route.params, body = $("centreBody"), c = getCentre(centreId);
  $("journeyBar-centre").innerHTML = journeyBar(3);
  if (!c || !c.active) { body.innerHTML = emptyState("This centre is not available.", `<button class="btn btn-primary btn-small" data-action="go" data-route="services">Find a service</button>`); return; }
  const svc = svcId && getService(svcId);
  const hours = hoursState(c);
  const offered = Object.keys(c.offers).filter(id => centreOffers(c, id)).map(getService);
  const header = `${svc ? backLink("Back to centres for " + svc.name, ["centres", svc.id]) : backLink("Find a service", ["services"])}
    <section class="centre-hero">
      <div><span class="eyebrow">${h(c.kind.toUpperCase())}</span><h2>${h(c.name)}</h2>
        <p>${h(c.address)}, ${h(c.city)} ${h(c.pin)}</p>
        <div class="tag-row">${sampleBadge("Sample centre and queue data")}<span class="tag">${h(c.open)}–${h(c.close)} · ${h(daysText(c.days))}</span>${distanceTo(c) != null ? `<span class="tag">${km(distanceTo(c))} from ${h(journey.loc.label)}</span>` : ""}</div></div>
      <div class="centre-hero-side"><span class="open-dot ${hours.open && c.status === "open" ? "on" : ""}"></span><strong>${h(c.status === "open" ? hours.text : "Temporarily closed")}</strong>
        <small>Refreshed ${formatTime(lastRefresh)} · from this browser</small>
        <button type="button" class="btn btn-secondary btn-small" data-action="refresh">Refresh ↻</button></div>
    </section>
    ${c.notice ? `<div class="notice-bar" role="status">⚠ ${h(c.notice)}</div>` : ""}`;
  if (!svc || !centreOffers(c, svc.id)) {
    body.innerHTML = header + `${svc ? `<div class="notice-bar">This centre does not offer ${h(svc.name)}. Choose a service it does offer, or <button type="button" class="text-button" data-action="go" data-route="centres|${h(svc.id)}">see centres that offer ${h(svc.name)}</button>.</div>` : ""}
      <section class="panel"><div class="panel-heading"><h2>Services at this centre</h2></div>${centreServiceList(c, null)}</section>`;
    return;
  }
  const st = queueStatus(c, svc.id), q = getQueue(c.id, svc.id), counters = c.counters.filter(k => k.svcIds.includes(svc.id));
  const est = estimateWait(c, svc.id), model = serviceMinutes(svc.id, c.id), appt = apptState(c, svc.id);
  const tip = suggestAlternative(svc.id, c.id, st.walk.ok ? st.est : null);
  const others = centresForService(svc.id).filter(x => x.id !== c.id).map(x => ({ c: x, st: queueStatus(x, svc.id), dist: distanceTo(x), next: nextFreeSlot(x, svc.id) }))
    .sort((a, b) => (a.st.est == null ? 999 : a.st.est) - (b.st.est == null ? 999 : b.st.est)).slice(0, 3);
  body.innerHTML = header + `
    <div class="selected-strip"><span class="cat-icon tone-${h(getCategory(svc.catId).tone)}">${h(getCategory(svc.catId).icon)}</span><div><small>Selected service</small><strong>${h(svc.name)}</strong></div>
      <button type="button" class="btn btn-secondary btn-small" data-action="go" data-route="services|${h(svc.catId)}|${h(svc.id)}">Change service</button></div>
    <div class="detail-grid">
      <section class="panel queue-status-panel">
        <div class="panel-heading"><div><h2>Queue for ${h(svc.name)}</h2><small class="subtle-text">This centre keeps a separate queue for each service.</small></div>${statusPill(st)}</div>
        <div class="q-metrics">
          <div><small>Waiting for this service</small><strong>${st.key === "unavailable" ? "—" : q.waiting.length}</strong>${st.shared > 0 ? `<small>+${st.shared} for other services at the same counters</small>` : ""}</div>
          <div><small>Est. wait if you join now</small><strong>${st.walk.ok ? h(waitText(st.est)) : "—"}</strong></div>
          <div><small>Open counters</small><strong>${openCountersFor(c, svc.id).length} of ${counters.length}</strong></div>
          <div><small>New walk-in tokens</small><strong class="${st.walk.ok ? "ok" : "warn"}">${st.walk.ok ? "Issuing" : st.key === "appt-only" ? "Not offered" : "Paused"}</strong></div>
        </div>
        ${st.walk.ok ? "" : `<div class="service-info warn-info"><span class="info-icon">!</span><span>${h(st.walk.reason)}</span></div>`}
        <h3 class="mini-head">Now serving</h3>
        <div class="serving-strip">${counters.length ? counters.map(k => `<div class="serving-chip${k.open ? "" : " off"}"><small>${h(k.label)}</small><b>${k.open ? (k.current ? h(k.current.token) : "Free") : "Closed"}</b></div>`).join("") : '<span class="muted">No counter is configured for this service.</span>'}</div>
        <p class="fine-print">Only token numbers are shown, never names.</p>
        <details class="method"><summary>How this estimate is calculated</summary>
          <p>${openCountersFor(c, svc.id).length ? `Counters for this service also serve ${poolServices(c, svc.id).length - 1} related service(s), so they share one line of ${est.ahead} ${est.ahead === 1 ? "person" : "people"}. Their typical counter times add up to about ${Math.round(est.workAhead || 0)} min, plus about ${Math.round(est.busy || 0)} min left on customers already at a counter, divided by ${est.counters} open counter(s).` : "No counter is open, so no estimate is possible."}
          Typical time for this service: ${model.avg.toFixed(1)} min, learned from ${plural(model.samples, "completed token")} (starting value ${model.prior} min). It is an estimate, not a promise.</p></details>
        ${statusLegend()}
      </section>
      <section class="panel">
        <div class="panel-heading"><h2>Before you visit</h2></div>
        ${svc.docs.length ? `<ul class="checklist">${svc.docs.map(d => `<li>${h(d)}</li>`).join("")}</ul>` : '<p class="muted">No documents needed.</p>'}
        <ul class="plain-list"><li>Walk-in tokens stop ${c.tokenCutoff} min before closing (${h(fromMinutes(toMinutes(c.close) - c.tokenCutoff))}).</li><li>Appointments: arrive 10 minutes early and check in from My activity.</li><li>Priority handling is verified at the counter. Carry supporting proof.</li></ul>
        <p class="fine-print">Sample guidance. Confirm requirements with the official source.</p>
      </section>
    </div>
    ${tip ? smartTip(tip, `<button type="button" class="btn btn-primary btn-small" data-action="go" data-route="centre|${h(tip.centre.id)}|${h(svc.id)}">View ${h(tip.centre.area)}</button>`) : ""}
    <div class="section-heading" id="options"><div><h2>How would you like to proceed?</h2><small class="subtle-text">Nothing is booked or issued until you confirm.</small></div></div>
    <div class="option-grid">
      <article class="option-card${st.walk.ok ? "" : " disabled"}">
        <span class="option-tag">A</span><h3>Walk-in token</h3>
        <p>Join today's queue for ${h(svc.name.toLowerCase())} here and track your place from your phone.</p>
        ${st.walk.ok ? `<div class="option-facts"><span>${plural(q.waiting.length, "person", "people")} waiting</span><span>${h(waitText(st.est))}</span></div>` : `<p class="warn-text">${h(st.walk.reason)}</p>`}
        <button type="button" class="btn btn-primary btn-full" data-action="token-start" ${st.walk.ok ? "" : "disabled"}>Get a token</button>
      </article>
      <article class="option-card wide${appt.ok ? "" : " disabled"}" id="bookingCard">
        <span class="option-tag">B</span><h3>Book an appointment</h3>
        ${appt.ok ? bookingPicker(c, svc) : `<p class="warn-text">${h(appt.reason)}</p>`}
      </article>
      <article class="option-card">
        <span class="option-tag">C</span><h3>Explore other centres</h3>
        ${others.length ? `<div class="mini-centres">${others.map(o => `<button type="button" class="mini-centre" data-action="go" data-route="centre|${h(o.c.id)}|${h(svc.id)}"><span><strong>${h(o.c.name)}</strong><small>${o.dist != null ? km(o.dist) + " · " : ""}${o.st.est != null ? waitText(o.st.est) : h(o.st.label)}${o.next ? " · slot " + h(prettyDate(o.next.date) + " " + o.next.time) : ""}</small></span>${statusPill(o.st)}</button>`).join("")}</div>` : '<p class="muted">No other centre offers this service.</p>'}
        <button type="button" class="btn btn-secondary btn-full" data-action="go" data-route="centres|${h(svc.id)}">Compare all centres</button>
        <small class="fine-print">Your service and location stay selected.</small>
      </article>
    </div>
    <section class="panel" style="margin-top:17px"><div class="panel-heading"><h2>Other services at this centre</h2><span class="count-pill">${offered.length} services</span></div>${centreServiceList(c, svc.id)}</section>`;
}
function centreServiceList(c, currentSvcId) {
  const ids = Object.keys(c.offers).filter(id => centreOffers(c, id));
  if (!ids.length) return emptyState("No services are active at this centre.");
  return `<div class="centre-svc-list">${ids.map(id => {
    const s = getService(id), st = queueStatus(c, id);
    return `<button type="button" class="centre-svc${id === currentSvcId ? " selected" : ""}" data-action="go" data-route="centre|${h(c.id)}|${h(id)}"><span><strong>${h(s.name)}</strong><small>${h(getCategory(s.catId).name)} · ${st.key === "unavailable" ? "" : st.waiting + " waiting"}${st.est != null ? " · " + waitText(st.est) : ""}</small></span>${statusPill(st)}</button>`;
  }).join("")}</div>`;
}

/* ---------------------------------------------------------------- appointment picker */
function bookingPicker(c, svc) {
  const key = c.id + "|" + svc.id;
  if (booking.key !== key) booking = { key, date: "", time: "" };
  const dates = bookingDates(c);
  if (!booking.date) { const first = dates.find(d => daySlots(c, svc.id, d).some(s => s.ok)); booking.date = first || dates[0]; }
  const slots = daySlots(c, svc.id, booking.date), free = slots.filter(s => s.ok);
  let alt = "";
  if (!free.length && prefs().smartAssist) {
    const nextHere = dates.filter(d => d > booking.date).find(d => daySlots(c, svc.id, d).some(s => s.ok));
    const elsewhere = centresForService(svc.id).filter(x => x.id !== c.id && apptState(x, svc.id).ok).map(x => ({ x, slot: daySlots(x, svc.id, booking.date).find(s => s.ok) })).filter(o => o.slot).slice(0, 2);
    alt = `<div class="assist-inline"><span class="assist-mark">✦</span><div><strong>No free slots on ${h(prettyDate(booking.date))}</strong><small>Rule-based suggestions: the next date with free slots here, and other centres with free slots on the same day.</small>
      <div class="row-actions">${nextHere ? `<button type="button" class="btn btn-secondary btn-small" data-action="pick-date" data-date="${nextHere}">Try ${h(prettyDate(nextHere))} here</button>` : ""}${elsewhere.map(o => `<button type="button" class="btn btn-secondary btn-small" data-action="go" data-route="centre|${h(o.x.id)}|${h(svc.id)}">${h(o.x.area)}: ${h(o.slot.time)}</button>`).join("")}</div></div></div>`;
  }
  return `<p>Choose a date and a ${c.slotMinutes}-minute slot. Each slot takes ${plural(c.slotCapacity, "booking")} for this service.</p>
    <div class="date-strip" role="group" aria-label="Choose a date">${dates.map(d => {
      const open = isOpenDay(c, d), n = open ? daySlots(c, svc.id, d).filter(s => s.ok).length : 0;
      return `<button type="button" class="date-chip${d === booking.date ? " selected" : ""}" data-action="pick-date" data-date="${d}" ${open ? "" : "disabled"} aria-pressed="${d === booking.date}"><b>${h(prettyDate(d))}</b><small>${open ? (n ? n + " free" : "Full") : "Closed"}</small></button>`;
    }).join("")}</div>
    ${slots.some(s => s.past) ? `<p class="fine-print">${slots.filter(s => s.past).length} earlier slot(s) today have passed or start within 15 minutes.</p>` : ""}<div class="slot-grid" role="group" aria-label="Choose a time">${slots.filter(s => !s.past).length ? slots.filter(s => !s.past).map(s => `<button type="button" class="slot${booking.time === s.time ? " selected" : ""}" data-action="pick-slot" data-time="${s.time}" ${s.ok ? "" : "disabled"} aria-pressed="${booking.time === s.time}">${s.time}<small>${s.past ? "Past" : s.left ? s.left + " left" : "Full"}</small></button>`).join("") : `<p class="muted">${slots.length ? "No more slots today." : "The centre is closed on this date."}</p>`}</div>
    ${alt}
    <button type="button" class="btn btn-primary btn-full" data-action="book-start" ${booking.time ? "" : "disabled"}>${booking.time ? "Continue with " + h(prettyDate(booking.date)) + " at " + booking.time : "Select a time slot"}</button>`;
}

/* ---------------------------------------------------------------- walk-in token flow */
function startToken() {
  const [centreId, svcId] = route.params;
  syncState();
  const c = getCentre(centreId), svc = getService(svcId), st = queueStatus(c, svcId);
  if (!st.walk.ok) { showToast(st.walk.reason, true); renderAll(); return; }
  const mine = myActiveTokens();
  const here = mine.find(t => t.centreId === centreId && t.svcId === svcId);
  if (here) { showToast("You already have token " + here.token + " in this queue.", true); go("activity"); return; }
  const sameSvc = mine.find(t => t.svcId === svcId && t.status === "waiting");
  if (mine.length >= MAX_ACTIVE_TOKENS && !sameSvc) {
    openModal(`<h2 id="modalTitle">Token limit reached</h2><div class="modal-body"><p>You can hold up to ${MAX_ACTIVE_TOKENS} active tokens at a time. Cancel or finish one first.</p></div>
      <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Close</button><button type="button" class="btn btn-primary" data-action="go" data-route="activity">Open My activity</button></div>`);
    return;
  }
  const draw = () => {
    const live = queueStatus(c, svcId), q = getQueue(c.id, svcId);
    return `<h2 id="modalTitle">Confirm your walk-in token</h2>
      <div class="modal-body">
        <dl class="summary"><div><dt>Service</dt><dd>${h(svc.name)}</dd></div><div><dt>Centre</dt><dd>${h(c.name)}</dd></div>
          <div><dt>Queue status</dt><dd>${statusPill(live)} ${q.waiting.length} waiting</dd></div><div><dt>Estimated wait</dt><dd>${h(waitText(live.est))} <small>(estimate)</small></dd></div></dl>
        ${sameSvc ? `<div class="service-info warn-info"><span class="info-icon">!</span><span>You already hold <strong>${h(sameSvc.token)}</strong> for this service at ${h(getCentre(sameSvc.centreId).name)}. Confirming will <strong>cancel that token</strong> and give you a new one here.</span></div>` : ""}
        <form id="tokenForm" novalidate>
          <label for="tokenName">Name on the token</label>
          <input id="tokenName" type="text" maxlength="50" value="${h(currentUser.name)}" autocomplete="name">
          <label class="priority-option" for="tokenPriority"><input type="checkbox" id="tokenPriority">
            <span><strong>Request priority handling</strong><small>For senior citizens, persons with disabilities or medical emergencies. Verified at the counter.</small></span></label>
          <div id="tokenMsg" class="form-message" role="status"></div>
          <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button>
          <button type="submit" class="btn btn-primary">${sameSvc ? "Cancel old token and generate" : "Generate token"}</button></div>
        </form>
      </div>`;
  };
  openModal(draw());
  $("tokenForm").addEventListener("submit", e => { e.preventDefault(); issueToken(centreId, svcId, sameSvc && sameSvc.id); });
}
function issueToken(centreId, svcId, replaceId) {
  const name = $("tokenName").value.trim().replace(/\s+/g, " "), priority = $("tokenPriority").checked, msg = $("tokenMsg");
  if (!NAME_PATTERN.test(name)) { msg.textContent = "Enter a valid name using at least 2 letters."; $("tokenName").focus(); return; }
  syncState();
  const c = getCentre(centreId), svc = getService(svcId), walk = walkInState(c, svcId);
  if (!walk.ok) { msg.textContent = walk.reason; return; }
  if (myActiveTokens().some(t => t.centreId === centreId && t.svcId === svcId)) { msg.textContent = "You already have a token in this queue."; return; }
  if (replaceId) {
    const found = findWaiting(replaceId);
    if (found && isMine(found.entry)) {
      found.queue.waiting = found.queue.waiting.filter(e => e.id !== replaceId);
      closeToken(found.entry, "cancelled", { cancelReason: "Replaced by a token at " + c.name });
      addActivity(`${found.entry.token} at ${found.centre.name} was cancelled by the customer (moved to ${c.name}).`, "×", found.centre.id);
    }
  } else if (myActiveTokens().length >= MAX_ACTIVE_TOKENS) { msg.textContent = "You already hold the maximum number of active tokens."; return; }
  const q = getQueue(centreId, svcId);
  q.seq += 1;
  const entry = { id: uid("t"), token: svc.prefix + String(q.seq).padStart(3, "0"), userId: currentUser.id, name, centreId, svcId, createdAt: Date.now(), rank: priority ? 0 : 2, priority };
  insertEntry(q, entry);
  entry.startAhead = Math.max(0, tokenPosition(entry) - 1);
  addActivity(`${name} took ${entry.token} for ${svc.name} at ${c.name}${priority ? " (priority requested)" : ""}.`, priority ? "★" : "＋", c.id);
  notify(currentUser.id, `Token ${entry.token} issued for ${svc.name} at ${c.name}.`, "🎫");
  commit();
  showTokenReceipt(entry.id);
  showToast("Token " + entry.token + " generated.");
}
function tokenFigures(t) {
  const c = getCentre(t.centreId);
  if (t.status === "serving") return { pos: 0, ahead: 0, wait: "Now", prog: 100 };
  const pos = tokenPosition(t), est = estimateWait(c, t.svcId, t.id), start = Math.max(1, (t.startAhead || 0) + 1);
  const prog = pos == null ? 0 : Math.round(Math.min(1, Math.max(0, (start - pos + 1) / (start + 1))) * 100);
  return { pos, ahead: pos == null ? null : pos - 1, wait: est.minutes == null ? "No counter open" : waitText(est.minutes), prog };
}
function showTokenReceipt(entryId) {
  const draw = () => {
    const t = myActiveTokens().find(x => x.id === entryId);
    if (!t) return `<h2 id="modalTitle">Token no longer active</h2><div class="modal-body"><p>This token has been served, skipped or cancelled. Check My activity for details.</p></div><div class="modal-actions"><button type="button" class="btn btn-primary" data-action="go" data-route="activity|history">Open history</button></div>`;
    const c = getCentre(t.centreId), svc = getService(t.svcId), f = tokenFigures(t);
    return `<div class="receipt"><span class="eyebrow">YOUR DIGITAL TOKEN · ${h(c.name.toUpperCase())}</span>
      <p class="ticket-service">${h(svc.name)}</p><div class="big-token" id="modalTitle">${h(t.token)}</div>
      ${t.priority ? '<p class="ticket-priority">★ PRIORITY REQUESTED</p>' : ""}
      <div class="ticket-metrics"><div><small>STATUS</small><strong>${t.status === "serving" ? "Being served" : "Waiting"}</strong></div><div><small>POSITION</small><strong>${f.pos === 0 ? "Now" : f.pos ? ordinal(f.pos) : "—"}</strong></div>
      <div><small>PEOPLE AHEAD</small><strong>${f.ahead == null ? "—" : f.ahead}</strong></div><div><small>EST. WAIT</small><strong>${h(f.wait)}</strong></div></div>
      <p class="fine-print">Issued ${formatTime(t.createdAt)}. Position counts everyone in the line for the same counters. In-app updates only.</p></div>
      <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Close</button><button type="button" class="btn btn-primary" data-action="go" data-route="activity|active">Track in My activity</button></div>`;
  };
  openModal(draw(), { live: true, refresh: () => { $("modalBox").innerHTML = draw(); } });
}

/* ---------------------------------------------------------------- appointment flow */
function startBooking() {
  const [centreId, svcId] = route.params;
  syncState();
  const c = getCentre(centreId), svc = getService(svcId);
  const slot = daySlots(c, svcId, booking.date).find(s => s.time === booking.time);
  if (!apptState(c, svcId).ok || !slot || !slot.ok) { showToast("That slot is no longer available. Choose another.", true); booking.time = ""; renderAll(); return; }
  const problem = bookingProblem(svcId, booking.date);
  if (problem) { openModal(`<h2 id="modalTitle">Cannot book this slot</h2><div class="modal-body"><p>${h(problem)}</p></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Close</button><button type="button" class="btn btn-primary" data-action="go" data-route="activity|upcoming">See my appointments</button></div>`); return; }
  const last = myAppointments().filter(a => a.mobile).slice(-1)[0];
  openModal(`<h2 id="modalTitle">Your details</h2>
    <div class="modal-body"><p class="muted">${h(svc.name)} at ${h(c.name)} · ${h(prettyDate(booking.date))}, ${booking.time}</p>
      <form id="bookForm" novalidate>
        <label for="bkName">Applicant's full name</label><input id="bkName" type="text" maxlength="50" value="${h(currentUser.name)}" autocomplete="name">
        <label for="bkMobile">Mobile number</label><input id="bkMobile" type="tel" inputmode="numeric" maxlength="10" placeholder="10-digit mobile number" value="${h(last ? last.mobile : "")}" autocomplete="tel-national">
        <p class="field-help">Stored only in this browser for the centre's demo records. No SMS is sent.</p>
        <label for="bkNote">Note for the centre (optional)</label><input id="bkNote" type="text" maxlength="120" placeholder="e.g. need wheelchair access">
        <div id="bkMsg" class="form-message" role="status"></div>
        <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">Review booking →</button></div>
      </form></div>`);
  $("bkMobile").addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10); });
  $("bookForm").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("bkName").value.trim().replace(/\s+/g, " "), mobile = $("bkMobile").value.trim(), note = $("bkNote").value.trim();
    if (!NAME_PATTERN.test(name)) { $("bkMsg").textContent = "Enter a valid name using at least 2 letters."; $("bkName").focus(); return; }
    if (!MOBILE_PATTERN.test(mobile)) { $("bkMsg").textContent = "Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9."; $("bkMobile").focus(); return; }
    reviewBooking({ centreId, svcId, date: booking.date, time: booking.time, name, mobile, note });
  });
}
function bookingProblem(svcId, date) {
  const upcoming = myUpcoming();
  const dup = upcoming.find(a => a.svcId === svcId && a.date === date);
  if (dup) return `You already have a ${getService(svcId).name} appointment on ${prettyDate(date)} (${dup.ref} at ${getCentre(dup.centreId).name}). Cancel it first if you want a different time.`;
  if (upcoming.length >= MAX_UPCOMING_APPTS) return `You can hold up to ${MAX_UPCOMING_APPTS} upcoming appointments. Cancel one before booking another.`;
  return "";
}
function reviewBooking(d) {
  const c = getCentre(d.centreId), svc = getService(d.svcId);
  openModal(`<h2 id="modalTitle">Review and confirm</h2>
    <div class="modal-body"><dl class="summary">
      <div><dt>Service</dt><dd>${h(svc.name)}</dd></div><div><dt>Centre</dt><dd>${h(c.name)}<small>${h(c.address)}, ${h(c.area)}</small></dd></div>
      <div><dt>Date and time</dt><dd>${h(prettyDate(d.date))} (${h(d.date)}) at ${h(d.time)}</dd></div><div><dt>Applicant</dt><dd>${h(d.name)} · ${h(d.mobile)}</dd></div>
      ${d.note ? `<div><dt>Note</dt><dd>${h(d.note)}</dd></div>` : ""}</dl>
      <ul class="plain-list"><li>Bring: ${h(svc.docs.join(" ") || "No documents needed.")}</li><li>Check in from My activity on the day, from 60 minutes before your slot.</li></ul>
      <p class="fine-print">Demo booking: sample centre, nothing is sent to a real office.</p>
      <div id="rvMsg" class="form-message" role="status"></div></div>
    <div class="modal-actions"><button type="button" class="btn btn-secondary" id="rvBack">← Edit details</button><button type="button" class="btn btn-primary" id="rvConfirm">Confirm booking</button></div>`);
  $("rvBack").addEventListener("click", startBooking);
  $("rvConfirm").addEventListener("click", () => confirmBooking(d));
}
function confirmBooking(d) {
  syncState();
  const c = getCentre(d.centreId), svc = getService(d.svcId), msg = $("rvMsg");
  const appt = apptState(c, d.svcId);
  if (!appt.ok) { msg.textContent = appt.reason; return; }
  const slot = daySlots(c, d.svcId, d.date).find(s => s.time === d.time);
  if (!slot || !slot.ok) { msg.textContent = "Sorry, that slot was just taken or has passed. Go back and choose another time."; booking.time = ""; renderAll(); return; }
  const problem = bookingProblem(d.svcId, d.date);
  if (problem) { msg.textContent = problem; return; }
  const record = { id: uid("a"), ref: makeRef(state.appointments), userId: currentUser.id, name: d.name, mobile: d.mobile, note: d.note, centreId: c.id, svcId: svc.id, date: d.date, time: d.time, status: "booked", createdAt: Date.now() };
  state.appointments.push(record);
  addActivity(`Appointment ${record.ref} booked: ${svc.name} at ${c.name}, ${d.date} ${d.time}.`, "▦", c.id);
  notify(currentUser.id, `Appointment confirmed: ${record.ref}, ${svc.name} at ${c.name} on ${prettyDate(d.date)} at ${d.time}.`, "▦");
  booking = { key: "", date: "", time: "" };
  commit();
  openModal(`<div class="receipt"><span class="eyebrow">APPOINTMENT CONFIRMED</span><p class="ticket-service">${h(svc.name)}</p>
      <div class="big-token ref" id="modalTitle">${h(record.ref)}</div><p>Booking reference</p>
      <dl class="summary"><div><dt>Centre</dt><dd>${h(c.name)}</dd></div><div><dt>When</dt><dd>${h(prettyDate(record.date))}, ${h(record.time)}</dd></div><div><dt>Applicant</dt><dd>${h(record.name)}</dd></div></dl>
      <p class="fine-print">Keep this reference. On the day, check in from My activity to get your token.</p></div>
    <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Close</button><button type="button" class="btn btn-primary" data-action="go" data-route="activity|upcoming">View my appointments</button></div>`);
  showToast("Appointment " + record.ref + " booked.");
}
