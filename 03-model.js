
/* ================================================================ STATE */
let state = loadState();
let users = loadUsers();
let currentUser = null;

function loadState() {
  try {
    const raw = storeGet("local", STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 4 || !Array.isArray(parsed.centres) || !Array.isArray(parsed.services)) return freshState();
    parsed.settings = parsed.settings || { ignoreHours: false };
    ["appointments", "tokenLog", "activity", "notices", "categories"].forEach(key => { if (!Array.isArray(parsed[key])) parsed[key] = []; });
    parsed.queues = parsed.queues || {};
    parsed.centres.forEach(c => {
      c.offers = c.offers || {}; c.counters = c.counters || []; c.closedDates = c.closedDates || [];
      parsed.queues[c.id] = parsed.queues[c.id] || {};
      Object.keys(c.offers).forEach(id => { if (!parsed.queues[c.id][id]) parsed.queues[c.id][id] = { seq: 0, waiting: [], paused: false }; });
    });
    return parsed;
  } catch (error) {
    console.warn("Could not load QueueEase data; starting fresh.", error);
    return freshState();
  }
}
function saveState() { return storeSet("local", STORAGE_KEY, JSON.stringify(state)); }
/* Re-read shared data before every change so two tabs (customer + staff) never overwrite each other. */
function syncState() { state = loadState(); }
/* Every change goes through commit(): it runs the notification check, saves and re-renders. */
function commit() { scanNotices(); saveState(); renderAll(); }

/* ================================================================ LOOKUPS */
const getService = id => state.services.find(s => s.id === id);
const getCategory = id => state.categories.find(c => c.id === id);
const getCentre = id => state.centres.find(c => c.id === id);
function getQueue(centreId, svcId) {
  if (!state.queues[centreId]) state.queues[centreId] = {};
  if (!state.queues[centreId][svcId]) state.queues[centreId][svcId] = { seq: 0, waiting: [], paused: false };
  return state.queues[centreId][svcId];
}
function counterById(id) {
  for (const c of state.centres) { const k = c.counters.find(x => x.id === id); if (k) return { centre: c, counter: k }; }
  return null;
}
function isMine(record) { return Boolean(currentUser) && (record.userId === currentUser.id || record.userId === "@" + currentUser.username); }
function activeCategories() { return state.categories.filter(c => c.active); }
function servicesInCategory(catId) { return state.services.filter(s => s.catId === catId && s.active); }
function serviceVisible(s) { const cat = getCategory(s.catId); return s.active && cat && cat.active; }

/* ================================================================ AVAILABILITY
   A centre-service pair is only offered when: the centre is active, it lists the service, the service and
   its category are active. Walk-in and appointment support each need both the service-level flag and the
   centre-level flag. */
function centreOffers(centre, svcId) {
  const svc = getService(svcId);
  return Boolean(centre && centre.active && centre.offers[svcId] && svc && serviceVisible(svc));
}
function centresForService(svcId) { return state.centres.filter(c => centreOffers(c, svcId)); }
function isOpenDay(centre, date) { return centre.days.includes(parseDate(date).getDay()) && !centre.closedDates.includes(date); }
function hoursState(centre) {
  if (state.settings.ignoreHours) return { open: true, text: "Open (demo: opening hours ignored)" };
  const today = todayStr(), now = nowMinutes();
  if (!isOpenDay(centre, today)) return { open: false, text: "Closed today" };
  if (now < toMinutes(centre.open)) return { open: false, text: "Opens at " + centre.open };
  if (now >= toMinutes(centre.close)) return { open: false, text: "Closed for the day (" + centre.open + "–" + centre.close + ")" };
  return { open: true, text: "Open until " + centre.close };
}
function openCountersFor(centre, svcId) { return centre.counters.filter(k => k.open && k.svcIds.includes(svcId)); }

/* Walk-in availability for one centre-service queue. Returns { ok, code, reason }. */
function walkInState(centre, svcId) {
  const svc = getService(svcId), offer = centre && centre.offers[svcId];
  if (!centreOffers(centre, svcId)) return { ok: false, code: "unavailable", reason: "This centre does not offer this service." };
  if (centre.status !== "open") return { ok: false, code: "unavailable", reason: centre.notice || "This centre is temporarily closed." };
  if (offer.interrupted) return { ok: false, code: "unavailable", reason: offer.interrupted };
  if (!svc.walkIn || !offer.walkIn) return { ok: false, code: "appt-only", reason: "Walk-in tokens are not offered for this service here. Book an appointment instead." };
  const hours = hoursState(centre);
  if (!hours.open) return { ok: false, code: "paused", reason: hours.text + ". Walk-in tokens are issued only during opening hours." };
  if (!state.settings.ignoreHours && nowMinutes() >= toMinutes(centre.close) - centre.tokenCutoff)
    return { ok: false, code: "paused", reason: "Walk-in tokens stop " + centre.tokenCutoff + " minutes before closing (" + centre.close + ")." };
  if (getQueue(centre.id, svcId).paused) return { ok: false, code: "paused", reason: "Staff have paused new tokens for this service." };
  if (!openCountersFor(centre, svcId).length) return { ok: false, code: "paused", reason: "No counter is open for this service right now." };
  return { ok: true, code: "ok", reason: "" };
}
function apptState(centre, svcId) {
  const svc = getService(svcId), offer = centre && centre.offers[svcId];
  if (!centreOffers(centre, svcId)) return { ok: false, reason: "This centre does not offer this service." };
  if (centre.status !== "open") return { ok: false, reason: centre.notice || "This centre is temporarily closed." };
  if (offer.interrupted) return { ok: false, reason: offer.interrupted };
  if (!svc.appt || !offer.appt) return { ok: false, reason: "Appointments are not offered for this service here." };
  return { ok: true, reason: "" };
}

/* ================================================================ QUEUE ORDER AND ESTIMATES
   Order: priority requests (rank 0), then appointment check-ins (rank 1), then walk-ins (rank 2).
   Within a rank it is first come, first served. */
function sortQueue(list) { list.sort((a, b) => (a.rank - b.rank) || ((a.queuedAt || a.createdAt) - (b.queuedAt || b.createdAt))); return list; }
function insertEntry(queue, entry) { queue.waiting.push(entry); sortQueue(queue.waiting); }

/* A counter can serve several services. When it calls the next customer it looks across all of its
   services' queues, so the "line" a token really stands in is the pooled line of every service that
   shares an open counter with it. */
function poolServices(centre, svcId) {
  const counters = openCountersFor(centre, svcId);
  const ids = new Set([svcId]);
  counters.forEach(k => k.svcIds.forEach(id => { if (centre.offers[id]) ids.add(id); }));
  return [...ids];
}
function pooledLine(centre, svcId) {
  return sortQueue(poolServices(centre, svcId).flatMap(id => getQueue(centre.id, id).waiting.slice()));
}
/* Learned service time: blend of the configured typical minutes (prior) and recently completed tokens.
   With few samples it leans on the prior; with more data it trusts the observed average. */
function serviceMinutes(svcId, centreId) {
  const svc = getService(svcId), prior = svc ? svc.minutes : 10, strength = 3;
  let samples = state.tokenLog.filter(t => t.outcome === "completed" && t.svcId === svcId && t.servingAt && t.completedAt && (!centreId || t.centreId === centreId));
  if (centreId && samples.length < 3) samples = state.tokenLog.filter(t => t.outcome === "completed" && t.svcId === svcId && t.servingAt && t.completedAt);
  const mins = samples.slice(0, 20).map(t => (t.completedAt - t.servingAt) / 60000).filter(m => m >= 0.5 && m <= 120);
  return { avg: (prior * strength + mins.reduce((a, b) => a + b, 0)) / (strength + mins.length), samples: mins.length, prior };
}
/* Estimated minutes until a person is called:
   (minutes of work ahead in the pooled line + time left on customers already at those counters) / open counters. */
function estimateWait(centre, svcId, entryId) {
  const counters = openCountersFor(centre, svcId);
  if (!counters.length) return { minutes: null, ahead: null, counters: 0 };
  const line = pooledLine(centre, svcId);
  const index = entryId ? line.findIndex(e => e.id === entryId) : line.length;
  if (index < 0) return { minutes: null, ahead: null, counters: counters.length };
  const ahead = line.slice(0, index);
  const workAhead = ahead.reduce((sum, e) => sum + serviceMinutes(e.svcId, centre.id).avg, 0);
  const busy = counters.reduce((sum, k) => {
    if (!k.current) return sum;
    const left = serviceMinutes(k.current.svcId, centre.id).avg - (Date.now() - (k.current.servingAt || Date.now())) / 60000;
    return sum + Math.max(1, left);
  }, 0);
  const allBusy = counters.every(k => k.current);
  const minutes = Math.round((workAhead + (allBusy || ahead.length ? busy : 0)) / counters.length);
  return { minutes: Math.max(0, minutes), ahead: ahead.length, counters: counters.length, workAhead, busy };
}
function waitText(minutes) {
  if (minutes == null) return "Not available";
  if (minutes < 5) return "Under 5 min";
  if (minutes >= 90) return "About " + (Math.round(minutes / 15) * 15 / 60).toFixed(1).replace(".0", "") + " h";
  return "About " + minutes + " min";
}
/* Status label for a centre-service queue. Thresholds are the WAIT_* constants above. */
function queueStatus(centre, svcId) {
  const walk = walkInState(centre, svcId), waiting = getQueue(centre.id, svcId).waiting.length;
  const shared = centreOffers(centre, svcId) ? pooledLine(centre, svcId).length - waiting : 0;
  if (walk.code === "unavailable") return { key: "unavailable", label: "Service unavailable", tone: "closed", walk, waiting, shared: 0, est: null };
  if (walk.code === "appt-only") return { key: "appt-only", label: "Appointment only", tone: "info", walk, waiting, shared, est: null };
  if (walk.code === "paused") return { key: "paused", label: "Token issuance paused", tone: "paused", walk, waiting, shared, est: null };
  const est = estimateWait(centre, svcId).minutes;
  if (est < WAIT_LOW) return { key: "low", label: "Low waiting", tone: "low", walk, waiting, shared, est };
  if (est < WAIT_BUSY) return { key: "moderate", label: "Moderate waiting", tone: "moderate", walk, waiting, shared, est };
  return { key: "busy", label: "Busy", tone: "busy", walk, waiting, shared, est };
}

/* ================================================================ APPOINTMENT SLOTS */
function slotTimes(centre) {
  const out = [], start = toMinutes(centre.open), end = toMinutes(centre.close);
  for (let m = start; m + centre.slotMinutes <= end; m += centre.slotMinutes) out.push(fromMinutes(m));
  return out;
}
function liveAppointments(centreId, svcId, date) {
  return state.appointments.filter(a => a.centreId === centreId && a.svcId === svcId && a.date === date && (a.status === "booked" || a.status === "checked-in"));
}
/* Returns every slot for a day with its state: free seats, or why it cannot be booked. */
function daySlots(centre, svcId, date) {
  if (!isOpenDay(centre, date)) return [];
  const taken = {}, isToday = date === todayStr(), now = nowMinutes();
  liveAppointments(centre.id, svcId, date).forEach(a => { taken[a.time] = (taken[a.time] || 0) + 1; });
  return slotTimes(centre).map(time => {
    const used = taken[time] || 0, past = isToday && toMinutes(time) <= now + 15;
    return { time, left: Math.max(0, centre.slotCapacity - used), past, ok: !past && used < centre.slotCapacity };
  });
}
function bookingDates(centre) { return Array.from({ length: centre.bookDays + 1 }, (_, i) => addDays(todayStr(), i)); }
function nextFreeSlot(centre, svcId) {
  if (!apptState(centre, svcId).ok) return null;
  for (const date of bookingDates(centre)) {
    const slot = daySlots(centre, svcId, date).find(s => s.ok);
    if (slot) return { date, time: slot.time };
  }
  return null;
}

/* ================================================================ CUSTOMER RECORDS */
function myActiveTokens() {
  if (!currentUser) return [];
  const out = [];
  state.centres.forEach(c => {
    c.counters.forEach(k => { if (k.current && isMine(k.current)) out.push({ ...k.current, status: "serving", counterLabel: k.label }); });
    Object.keys(state.queues[c.id] || {}).forEach(svcId => {
      state.queues[c.id][svcId].waiting.forEach(e => { if (isMine(e)) out.push({ ...e, status: "waiting" }); });
    });
  });
  return out.sort((a, b) => a.createdAt - b.createdAt);
}
function myAppointments() { return state.appointments.filter(isMine).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)); }
function myUpcoming() { return myAppointments().filter(a => a.status === "booked" && a.date >= todayStr()); }
function findWaiting(entryId) {
  for (const c of state.centres) {
    for (const svcId of Object.keys(state.queues[c.id] || {})) {
      const q = state.queues[c.id][svcId], e = q.waiting.find(x => x.id === entryId);
      if (e) return { centre: c, queue: q, entry: e, svcId };
    }
  }
  return null;
}
function tokenPosition(entry) {
  const centre = getCentre(entry.centreId);
  const line = pooledLine(centre, entry.svcId), index = line.findIndex(e => e.id === entry.id);
  return index < 0 ? null : index + 1;
}

/* ================================================================ ACTIVITY + IN-APP NOTIFICATIONS
   Notifications are in-app only: nothing is sent by SMS, e-mail or push. */
function addActivity(message, icon = "✓", centreId = null) {
  state.activity.unshift({ message, icon, time: Date.now(), centreId });
  state.activity = state.activity.slice(0, 60);
}
function notify(userId, message, icon = "🔔") {
  if (!userId) return;
  state.notices.unshift({ id: uid("n"), userId, message, icon, time: Date.now() });
  state.notices = state.notices.slice(0, 120);
}
/* After every change, tell waiting customers when they move up to 2nd or 1st in line (once each). */
function scanNotices() {
  state.centres.forEach(c => {
    Object.keys(state.queues[c.id] || {}).forEach(svcId => {
      state.queues[c.id][svcId].waiting.forEach(e => {
        if (!e.userId) return;
        const pos = tokenPosition(e);
        e.notified = e.notified || {};
        if (pos === 1 && !e.notified.one) { e.notified.one = e.notified.two = true; notify(e.userId, `${e.token}: you are next at ${c.name}. Please stay near the counters.`, "⏰"); }
        else if (pos === 2 && !e.notified.two) { e.notified.two = true; notify(e.userId, `${e.token}: one person is ahead of you at ${c.name}.`, "⏳"); }
      });
    });
  });
}
function closeToken(entry, outcome, extra = {}) {
  const record = { ...entry, ...extra, outcome, closedAt: Date.now() };
  delete record.notified;
  state.tokenLog.unshift(record);
  state.tokenLog = state.tokenLog.slice(0, 600);
  if (entry.apptId) {
    const appt = state.appointments.find(a => a.id === entry.apptId);
    if (appt && appt.status === "checked-in") appt.status = outcome === "completed" ? "completed" : outcome === "no-show" ? "no-show" : "cancelled";
  }
}
