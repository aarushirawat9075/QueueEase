
/* ================================================================ SMART ASSIST (rule-based)
   No AI or machine learning: it compares estimated waits (from the model above) between centres that offer
   the same service, and suggests one only when the saving is meaningful. Users can dismiss any tip. */
const SA_MIN_SAVING = 10;      // minutes
const SA_MIN_RATIO = 0.7;      // the alternative must be at most 70% of the current wait
function distanceTo(centre) { return journey.loc ? haversine(journey.loc, centre) : null; }
function suggestAlternative(svcId, fromCentreId, currentMinutes) {
  if (!prefs().smartAssist) return null;
  const options = centresForService(svcId).filter(c => c.id !== fromCentreId).map(c => {
    const st = queueStatus(c, svcId);
    return { centre: c, st, est: st.est, dist: distanceTo(c) };
  }).filter(o => o.st.walk.ok && o.est != null);
  if (!options.length) return null;
  options.sort((a, b) => a.est - b.est || (a.dist || 0) - (b.dist || 0));
  const best = options[0];
  if (currentMinutes != null && !(best.est <= currentMinutes - SA_MIN_SAVING && best.est <= currentMinutes * SA_MIN_RATIO)) return null;
  const key = ["alt", svcId, fromCentreId || "none", best.centre.id].join("|");
  if (prefs().dismissed[key]) return null;
  const from = fromCentreId && getCentre(fromCentreId);
  let why = currentMinutes == null
    ? `${best.centre.name} has the shortest estimated wait among centres offering this service: ${waitText(best.est).toLowerCase()}, with ${plural(best.st.waiting, "person", "people")} waiting.`
    : `Estimated wait there is ${waitText(best.est).toLowerCase()} compared with ${waitText(currentMinutes).toLowerCase()} here (saves about ${currentMinutes - best.est} min). Suggested only when the saving is at least ${SA_MIN_SAVING} min and 30%.`;
  if (best.dist != null && from && journey.loc) {
    const diff = best.dist - haversine(journey.loc, from);
    why += diff > 0.5 ? ` It is ${km(diff)} farther from your chosen location, so include travel time.` : " It is not farther from your chosen location.";
  } else if (best.dist != null) why += ` It is ${km(best.dist)} from your chosen location.`;
  return { key, centre: best.centre, est: best.est, why };
}
function smartTip(tip, actionHtml) {
  if (!tip) return "";
  return `<div class="assist-tip" role="note"><span class="assist-mark" aria-hidden="true">✦</span><div><span class="eyebrow">SMART ASSIST · RULE-BASED SUGGESTION</span>
    <strong>${h(tip.title || "Shorter wait at " + tip.centre.name)}</strong><p>${h(tip.why)}</p>
    <div class="row-actions">${actionHtml}<button type="button" class="btn btn-secondary btn-small" data-action="dismiss-tip" data-key="${h(tip.key)}">Dismiss</button></div></div></div>`;
}

/* ================================================================ STEP 1-2: SERVICE DISCOVERY */
let serviceQuery = "";
function serviceBadges(s) {
  return `${s.walkIn ? '<span class="tag tag-walk">Walk-in</span>' : ""}${s.appt ? '<span class="tag tag-appt">Appointment</span>' : ""}${!s.walkIn && s.appt ? '<span class="tag tag-note">Appointment only</span>' : ""}${s.walkIn && !s.appt ? '<span class="tag tag-note">Walk-in only</span>' : ""}<span class="tag">~${s.minutes} min at the counter</span>`;
}
function serviceMatches(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return state.services.filter(serviceVisible).filter(s => {
    const text = (s.name + " " + s.desc + " " + getCategory(s.catId).name + " " + s.prefix).toLowerCase();
    return words.every(w => text.includes(w));
  });
}
function serviceResultRows(list) {
  if (!list.length) return emptyState("No service matches that search. Try words like Aadhaar, income, birth or pension.");
  return list.map(s => {
    const n = centresForService(s.id).length;
    return `<button type="button" class="svc-row" data-action="go" data-route="services|${h(s.catId)}|${h(s.id)}">
      <span class="cat-icon tone-${h(getCategory(s.catId).tone)}">${h(getCategory(s.catId).icon)}</span>
      <span class="svc-row-main"><strong>${h(s.name)}</strong><small>${h(getCategory(s.catId).name)} · ${h(s.desc)}</small><span class="tag-row">${serviceBadges(s)}</span></span>
      <span class="svc-row-side"><b>${n}</b><small>${n === 1 ? "centre" : "centres"}</small></span></button>`;
  }).join("");
}
function renderServices() {
  const [catId, svcId] = route.params, body = $("servicesBody");
  const cat = catId && getCategory(catId);
  $("journeyBar-services").innerHTML = journeyBar(1);
  if (!cat || !cat.active) {
    if (catId) { body.innerHTML = emptyState("That service category is not available.", `<button class="btn btn-primary btn-small" data-action="go" data-route="services">See all categories</button>`); return; }
    body.innerHTML = `
      <div class="discover-hero">
        <div><h2>What do you need help with?</h2><p>Search for a service or pick a category. Next, we show only the centres that offer it.</p></div>
        <label class="search-field" for="serviceSearch"><span aria-hidden="true">⌕</span><input id="serviceSearch" type="search" placeholder="Search services, e.g. Aadhaar address update, income certificate" value="${h(serviceQuery)}" autocomplete="off"></label>
      </div>
      <div id="serviceResults" class="${serviceQuery ? "" : "hidden"} panel svc-results"></div>
      <div class="section-heading"><div><h2>Service categories</h2></div><span class="subtle-text">${activeCategories().length} categories · ${state.services.filter(serviceVisible).length} services ${sampleBadge()}</span></div>
      <div class="cat-grid">${activeCategories().map(c => {
        const list = servicesInCategory(c.id), centres = new Set(list.flatMap(s => centresForService(s.id).map(x => x.id)));
        return `<button type="button" class="cat-card" data-action="go" data-route="services|${h(c.id)}">
          <span class="cat-icon tone-${h(c.tone)}">${h(c.icon)}</span><strong>${h(c.name)}</strong><small>${h(c.desc)}</small>
          <span class="cat-meta">${plural(list.length, "service")} · ${plural(centres.size, "centre")}</span></button>`;
      }).join("")}</div>
      <p class="fine-print">Categories and services are examples configured by the administrator. Not every centre offers every service.</p>`;
    if (serviceQuery) $("serviceResults").innerHTML = `<div class="panel-heading"><h2>Search results</h2></div>` + serviceResultRows(serviceMatches(serviceQuery));
    return;
  }
  const list = servicesInCategory(cat.id), svc = svcId && list.find(s => s.id === svcId);
  body.innerHTML = `${backLink("All categories", ["services"])}
    <div class="cat-head"><span class="cat-icon big tone-${h(cat.tone)}">${h(cat.icon)}</span><div><h2>${h(cat.name)}</h2><p>${h(cat.desc)}</p></div></div>
    <div class="svc-layout">
      <section class="panel"><div class="panel-heading"><div><h2>Choose the exact service</h2></div><span class="count-pill">${list.length} services</span></div>
        <div class="svc-list">${list.length ? list.map(s => {
          const n = centresForService(s.id).length;
          return `<button type="button" class="svc-choice${svc && svc.id === s.id ? " selected" : ""}" data-action="go" data-route="services|${h(cat.id)}|${h(s.id)}" aria-pressed="${svc && svc.id === s.id}">
            <span><strong>${h(s.name)}</strong><small>${h(s.desc)}</small><span class="tag-row">${serviceBadges(s)}</span></span>
            <span class="svc-row-side"><b>${n}</b><small>${n === 1 ? "centre" : "centres"}</small></span></button>`;
        }).join("") : emptyState("No services are active in this category.")}</div>
      </section>
      <section class="panel svc-detail" id="svcDetail">${svc ? serviceDetail(svc) : `<div class="empty-ticket"><div class="empty-ticket-icon">☰</div><h3>Select a service</h3><p>You will see what it involves, what to bring, and how many centres offer it.</p></div>`}</section>
    </div>`;
}
function serviceDetail(s) {
  const centres = centresForService(s.id);
  const walkNow = centres.filter(c => walkInState(c, s.id).ok).length;
  const apptAt = centres.filter(c => apptState(c, s.id).ok).length;
  return `<span class="eyebrow">SELECTED SERVICE</span><h2 class="detail-title">${h(s.name)}</h2><p class="muted">${h(s.desc)}</p>
    <div class="tag-row">${serviceBadges(s)}</div>
    <dl class="facts">
      <div><dt>Offered at</dt><dd>${plural(centres.length, "centre")} ${sampleBadge()}</dd></div>
      <div><dt>Walk-in tokens right now</dt><dd>${s.walkIn ? plural(walkNow, "centre") + " issuing" : "Not offered for this service"}</dd></div>
      <div><dt>Appointments</dt><dd>${s.appt ? plural(apptAt, "centre") + " taking bookings" : "Not offered for this service"}</dd></div>
      <div><dt>Typical time at the counter</dt><dd>About ${s.minutes} min (configured estimate)</dd></div>
      <div><dt>Fee</dt><dd>${s.fee ? h(s.fee) + " <small>(configured by the administrator)</small>" : "Not configured in this prototype. Confirm at the centre."}</dd></div>
    </dl>
    ${s.notes ? `<div class="service-info"><span class="info-icon">i</span><span>${h(s.notes)}</span></div>` : ""}
    <h3 class="mini-head">Prepare before you go</h3>
    ${s.docs.length ? `<ul class="checklist">${s.docs.map(d => `<li>${h(d)}</li>`).join("")}</ul>` : `<p class="muted">No documents are needed for this service.</p>`}
    <p class="fine-print">Sample checklist. Always confirm against the official document list for your state or UT.</p>
    <button class="btn btn-primary btn-full" type="button" data-action="go" data-route="centres|${h(s.id)}" ${centres.length ? "" : "disabled"}>${centres.length ? "Find a centre for this service →" : "No centre offers this service right now"}</button>`;
}

/* ================================================================ STEP 3: CENTRE DISCOVERY */
let placeChoices = [];
let locMessage = "";
function setLocation(loc) {
  journey.loc = loc;
  if (loc && journey.filters.sort === "name") journey.filters.sort = "distance";
  saveJourney();
  locMessage = "";
  placeChoices = [];
  renderAll();
}
function searchPlaces(q) {
  const text = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return [];
  if (/^\d{6}$/.test(text)) return PLACES.filter(p => p.pin === text);
  const sector = text.match(/(?:sector|sec)\s*-?\s*(\d+)/);
  return PLACES.filter(p => {
    const hay = (p.label + " " + p.keys + " " + p.pin).toLowerCase();
    if (sector) return new RegExp("\\b(sector|sec) " + sector[1] + "\\b").test(hay) && text.replace(sector[0], "").trim().split(" ").filter(Boolean).every(w => hay.includes(w));
    return text.split(" ").every(w => hay.includes(w));
  });
}
function useMyLocation() {
  if (!("geolocation" in navigator)) { locMessage = "Your browser does not support location. Search for your area instead."; renderAll(); return; }
  locMessage = "Asking your browser for your location…"; renderAll();
  navigator.geolocation.getCurrentPosition(pos => {
    setLocation({ label: "Your current location", lat: pos.coords.latitude, lng: pos.coords.longitude, source: "gps" });
    const nearest = Math.min(...state.centres.map(c => haversine(journey.loc, c)));
    if (nearest > 60) showToast("You are " + km(nearest) + " from the nearest sample centre. The demo only has Chandigarh tricity centres.");
    else showToast("Location set. Centres are sorted by distance.");
  }, err => {
    locMessage = err.code === 1 ? "Location permission was denied. You can still search by sector, town or PIN code." : "Could not get your location. Search by sector, town or PIN code instead.";
    renderAll();
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}
function centreRows(svcId) {
  const f = journey.filters;
  let rows = centresForService(svcId).map(c => {
    const st = queueStatus(c, svcId), next = nextFreeSlot(c, svcId), appt = apptState(c, svcId);
    return { c, st, next, appt, dist: distanceTo(c), hours: hoursState(c) };
  });
  const total = rows.length;
  if (f.walkIn) rows = rows.filter(r => r.st.walk.ok);
  if (f.appt) rows = rows.filter(r => r.next);
  if (f.openNow) rows = rows.filter(r => r.hours.open && r.c.status === "open");
  if (f.maxKm && journey.loc) rows = rows.filter(r => r.dist <= f.maxKm);
  const sorters = {
    distance: (a, b) => (a.dist == null ? 0 : a.dist) - (b.dist == null ? 0 : b.dist) || a.c.name.localeCompare(b.c.name),
    wait: (a, b) => (a.st.est == null ? 9999 : a.st.est) - (b.st.est == null ? 9999 : b.st.est),
    appt: (a, b) => (a.next ? a.next.date + a.next.time : "9") .localeCompare(b.next ? b.next.date + b.next.time : "9"),
    name: (a, b) => a.c.name.localeCompare(b.c.name)
  };
  rows.sort(sorters[journey.loc || f.sort !== "distance" ? f.sort : "name"] || sorters.name);
  return { rows, total };
}
function renderCentres() {
  const svc = getService(route.params[0]), body = $("centresBody");
  $("journeyBar-centres").innerHTML = journeyBar(2);
  if (!svc || !serviceVisible(svc)) {
    body.innerHTML = emptyState("This service is not available. It may have been deactivated by an administrator.", `<button class="btn btn-primary btn-small" data-action="go" data-route="services">Choose another service</button>`);
    return;
  }
  const f = journey.filters, cat = getCategory(svc.catId), { rows, total } = centreRows(svc.id);
  const hidden = state.centres.filter(c => c.active).length - total;
  const tip = suggestAlternative(svc.id, null, null);
  body.innerHTML = `${backLink("Change service", ["services", svc.catId, svc.id])}
    <div class="selected-strip"><span class="cat-icon tone-${h(cat.tone)}">${h(cat.icon)}</span><div><small>Selected service</small><strong>${h(svc.name)}</strong></div>
      <button type="button" class="btn btn-secondary btn-small" data-action="go" data-route="services|${h(svc.catId)}">Change</button></div>
    <section class="panel loc-panel">
      <form id="locForm" class="loc-form" novalidate>
        <label for="locInput">Your location</label>
        <div class="loc-row"><input id="locInput" type="search" placeholder="Sector, town or PIN code, e.g. Sector 22, Kharar or 160062" autocomplete="off">
        <button class="btn btn-secondary" type="submit">Search</button>
        <button class="btn btn-secondary" type="button" data-action="use-location">◎ Use my location</button></div>
      </form>
      <div class="loc-status">${journey.loc ? `<span>📍 Showing distances from <strong>${h(journey.loc.label)}</strong>${journey.loc.source === "gps" ? " (from your browser)" : ""}</span> <button type="button" class="text-button" data-action="clear-location">Clear location</button>` : `<span class="muted">No location set. Centres are listed by name. Location is optional and only requested when you press "Use my location".</span>`}</div>
      ${locMessage ? `<div class="form-message" role="status">${h(locMessage)}</div>` : ""}
      ${placeChoices.length ? `<div class="place-choices"><small>Did you mean:</small>${placeChoices.map((p, i) => `<button type="button" class="chip" data-action="pick-place" data-i="${i}">${h(p.label)} · ${h(p.pin)}</button>`).join("")}</div>` : ""}
      <div class="filter-row" role="group" aria-label="Filters">
        <label class="check"><input type="checkbox" data-filter="walkIn" ${f.walkIn ? "checked" : ""}> Walk-in tokens available now</label>
        <label class="check"><input type="checkbox" data-filter="appt" ${f.appt ? "checked" : ""}> Appointment slots available</label>
        <label class="check"><input type="checkbox" data-filter="openNow" ${f.openNow ? "checked" : ""}> Open now</label>
        <label class="inline-select">Distance <select data-filter="maxKm" ${journey.loc ? "" : "disabled title='Set a location first'"}>${[[0, "Any"], [5, "Within 5 km"], [10, "Within 10 km"], [20, "Within 20 km"]].map(([v, t]) => `<option value="${v}" ${Number(f.maxKm) === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="inline-select">Sort <select data-filter="sort">${[["distance", "Nearest first"], ["wait", "Shortest wait"], ["appt", "Earliest appointment"], ["name", "Name"]].map(([v, t]) => `<option value="${v}" ${f.sort === v ? "selected" : ""} ${v === "distance" && !journey.loc ? "disabled" : ""}>${t}${v === "distance" && !journey.loc ? " (set location)" : ""}</option>`).join("")}</select></label>
      </div>
    </section>
    ${tip ? smartTip({ ...tip, title: "Shortest wait right now: " + tip.centre.name }, `<button type="button" class="btn btn-primary btn-small" data-action="go" data-route="centre|${h(tip.centre.id)}|${h(svc.id)}">View this centre</button>`) : ""}
    <div class="section-heading"><div><h2>${plural(rows.length, "centre")} ${rows.length === total ? "offer" + (rows.length === 1 ? "s" : "") : "match" + (rows.length === 1 ? "es" : "")} ${h(svc.name.toLowerCase())}</h2>
      <small class="subtle-text">${hidden > 0 ? hidden + " other centre" + (hidden === 1 ? " does" : "s do") + " not offer this service and " + (hidden === 1 ? "is" : "are") + " not shown. " : ""}${rows.length < total ? (total - rows.length) + " hidden by your filters. " : ""}Queue figures are simulated.</small></div>
      <div class="seg" role="group" aria-label="View"><button type="button" class="${journey.view !== "plot" ? "on" : ""}" data-action="centre-view" data-v="list">List</button><button type="button" class="${journey.view === "plot" ? "on" : ""}" data-action="centre-view" data-v="plot">Schematic</button></div></div>
    ${journey.view === "plot" ? centrePlot(rows, svc) : ""}
    <div class="centre-list">${rows.length ? rows.map(r => centreCard(r, svc)).join("") : emptyState(total ? "No centre matches these filters. Try removing a filter." : "No centre offers this service right now.", total ? `<button class="btn btn-secondary btn-small" data-action="clear-filters" type="button">Clear filters</button>` : "")}</div>
    ${statusLegend()}`;
}
function centreCard(r, svc) {
  const { c, st, next, appt, dist, hours } = r;
  const offered = Object.keys(c.offers).filter(id => centreOffers(c, id)).map(getService);
  return `<article class="centre-card">
    <div class="centre-card-head"><div><strong>${h(c.name)}</strong><small>${h(c.kind)} · ${sampleBadge()}</small></div>${statusPill(st)}</div>
    <p class="centre-addr">${h(c.address)}, ${h(c.city)} ${h(c.pin)}</p>
    <div class="centre-facts">
      <span><small>Distance</small><b>${dist == null ? "Set location" : km(dist)}</b></span>
      <span><small>Waiting</small><b>${st.key === "unavailable" ? "—" : st.waiting}</b></span>
      <span><small>Est. wait if you join now</small><b>${st.est == null ? "—" : waitText(st.est)}</b></span>
      <span><small>Next appointment</small><b>${next ? h(prettyDate(next.date) + ", " + next.time) : appt.ok ? "No free slot" : "Not offered"}</b></span>
    </div>
    <div class="centre-lines">
      <span class="${hours.open && c.status === "open" ? "ok" : "warn"}">◷ ${h(c.status === "open" ? hours.text : "Temporarily closed")} · ${h(c.open)}–${h(c.close)}, ${h(daysText(c.days))}</span>
      <span class="${st.walk.ok ? "ok" : "warn"}">${st.walk.ok ? "✓ Walk-in tokens being issued" : "✕ " + h(st.walk.reason)}</span>
      ${st.shared > 0 ? `<span class="muted">⇄ Counters are shared with other services: ${plural(st.shared, "more person", "more people")} in the same line.</span>` : ""}
      <span class="muted">Offers ${plural(offered.length, "service")}: ${h(offered.slice(0, 3).map(s => s.name).join(", "))}${offered.length > 3 ? " and " + (offered.length - 3) + " more" : ""}</span>
    </div>
    <div class="row-actions"><button type="button" class="btn btn-secondary btn-small" data-action="go" data-route="centre|${h(c.id)}|${h(svc.id)}">View details</button>
      <button type="button" class="btn btn-primary btn-small" data-action="select-centre" data-centre="${h(c.id)}" data-svc="${h(svc.id)}">Select centre →</button></div>
  </article>`;
}
function daysText(days) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], sorted = days.slice().sort();
  if (sorted.join() === "1,2,3,4,5,6") return "Mon–Sat";
  if (sorted.join() === "1,2,3,4,5") return "Mon–Fri";
  if (sorted.join() === "0,1,2,3,4,5,6") return "Every day";
  return sorted.map(d => names[d]).join(", ");
}
function statusLegend() {
  return `<details class="legend"><summary>How queue statuses are worked out</summary>
    <ul>
      <li><span class="q-pill q-low">Low waiting</span> estimated wait for someone joining now is under ${WAIT_LOW} min.</li>
      <li><span class="q-pill q-moderate">Moderate waiting</span> ${WAIT_LOW}–${WAIT_BUSY - 1} min.</li>
      <li><span class="q-pill q-busy">Busy</span> ${WAIT_BUSY} min or more.</li>
      <li><span class="q-pill q-paused">Token issuance paused</span> outside opening hours, in the last minutes before closing (30 by default, set per centre), no counter open, or paused by staff.</li>
      <li><span class="q-pill q-info">Appointment only</span> walk-in tokens are not offered for this service at this centre.</li>
      <li><span class="q-pill q-closed">Service unavailable</span> the centre is temporarily closed or the service is interrupted.</li>
    </ul>
    <p>The estimate adds up the typical time of everyone ahead of you in the line for the same counters, plus time left on customers already at a counter, and divides by the number of open counters. Typical times are learned from completed tokens. All queue data in this prototype is simulated.</p></details>`;
}
/* Schematic layout of centres from their sample coordinates. Not a map: no streets, no map provider. */
function centrePlot(rows, svc) {
  const pts = rows.map(r => ({ id: r.c.id, lat: r.c.lat, lng: r.c.lng, label: r.c.area, tone: r.st.tone }));
  const you = journey.loc && haversine(journey.loc, { lat: 30.73, lng: 76.78 }) < 60 ? journey.loc : null;
  const all = you ? [...pts, you] : pts;
  if (!pts.length) return "";
  const minLat = Math.min(...all.map(p => p.lat)) - 0.01, maxLat = Math.max(...all.map(p => p.lat)) + 0.01;
  const minLng = Math.min(...all.map(p => p.lng)) - 0.015, maxLng = Math.max(...all.map(p => p.lng)) + 0.015;
  const W = 640, H = 300, x = lng => 30 + (lng - minLng) / (maxLng - minLng) * (W - 60), y = lat => H - 25 - (lat - minLat) / (maxLat - minLat) * (H - 50);
  return `<figure class="panel plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Schematic positions of ${pts.length} centres">
    <rect x="0" y="0" width="${W}" height="${H}" rx="12" class="plot-bg"/>
    ${you ? `<g><circle cx="${x(you.lng)}" cy="${y(you.lat)}" r="9" class="plot-you"/><text x="${x(you.lng) + 13}" y="${y(you.lat) + 4}" class="plot-label">You</text></g>` : ""}
    ${pts.map(p => `<g class="plot-pt" data-action="go" data-route="centre|${h(p.id)}|${h(svc.id)}" tabindex="0" role="link" aria-label="${h(p.label)}"><circle cx="${x(p.lng)}" cy="${y(p.lat)}" r="8" class="dot-${p.tone}"/><text x="${x(p.lng) + 12}" y="${y(p.lat) + 4}" class="plot-label">${h(p.label)}</text></g>`).join("")}
  </svg><figcaption>Schematic layout drawn from sample coordinates. It is not a map and does not show roads. Colours match the queue status.</figcaption></figure>`;
}
