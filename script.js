/* QueueEase - smart service discovery, digital queue and appointment management.
   Client-side prototype: plain HTML, CSS and JavaScript. No server or external libraries.
   All centres, queues and availability are SAMPLE DATA stored in this browser. */
"use strict";

const STORAGE_KEY = "queueease_state_v4";      // queues, catalogue, centres, appointments
const USERS_KEY = "queueease_users_v2";        // accounts (kept from the previous version)
const SESSION_KEY = "queueease_session_v1";    // signed-in account id (per tab)
const JOURNEY_KEY = "queueease_journey_v1";    // the customer's current service / location / centre choice
const PREFS_KEY = "queueease_prefs_v1";        // per-browser preferences (Smart Assist on/off, dismissed tips)
const STAFF_ACCESS_CODE = "QUEUEEASE-STAFF";   // code required to register a staff account

/* ---------------------------------------------------------------- safe storage
   Uses the browser's storage when allowed and quietly falls back to memory when it is blocked
   (some preview panes, private modes and sandboxed views block it). The site works either way. */
const memoryStore = { local: {}, session: {} };
const memoryOnly = { local: false, session: false };
let storageWarned = false;
function realStorage(kind) { return kind === "local" ? window.localStorage : window.sessionStorage; }
function storeGet(kind, key) {
  if (!memoryOnly[kind]) {
    try { return realStorage(kind).getItem(key); } catch (error) { memoryOnly[kind] = true; }
  }
  return Object.prototype.hasOwnProperty.call(memoryStore[kind], key) ? memoryStore[kind][key] : null;
}
function storeSet(kind, key, value) {
  if (!memoryOnly[kind]) {
    try { realStorage(kind).setItem(key, value); return true; } catch (error) { memoryOnly[kind] = true; }
  }
  memoryStore[kind][key] = value;
  if (!storageWarned && document.getElementById("toast")) {
    storageWarned = true;
    showToast("Browser storage is blocked here, so data lasts only while this page stays open.", true);
  }
  return false;
}
function storeRemove(kind, key) {
  delete memoryStore[kind][key];
  if (!memoryOnly[kind]) {
    try { realStorage(kind).removeItem(key); } catch (error) { memoryOnly[kind] = true; }
  }
}
function readJSON(kind, key, fallback) {
  try { const raw = storeGet(kind, key); return raw ? JSON.parse(raw) : fallback; } catch (error) { return fallback; }
}

/* ---------------------------------------------------------------- roles and views */
const ROLE_LABEL = { citizen: "Customer", staff: "Staff", admin: "Administrator" };
const ROLE_VIEWS = {
  citizen: ["overview", "services", "centres", "centre", "activity", "display"],
  staff: ["overview", "staff", "display"],
  admin: ["overview", "staff", "admin", "display"]
};
const NAV_PARENT = { centres: "services", centre: "services" };
const QUICK_ACCOUNTS = [
  { name: "Asha Verma", username: "customer", password: "customer123", role: "citizen" },
  { name: "Rajiv Menon", username: "staff", password: "staff123", role: "staff", centreId: "CH22" },
  { name: "Priya Nair", username: "admin", password: "admin123", role: "admin" }
];

/* Queue status thresholds, based on the estimated wait for someone joining now (minutes). */
const WAIT_LOW = 15;      // under 15 min  -> Low waiting
const WAIT_BUSY = 40;     // 15 to 39 min  -> Moderate waiting, 40+ min -> Busy
const MAX_ACTIVE_TOKENS = 2;
const MAX_UPCOMING_APPTS = 3;

/* ---------------------------------------------------------------- helpers */
const $ = id => document.getElementById(id);
function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
const h = escapeHTML;
function uid(prefix) { return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}
function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}
function dateStr(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function todayStr() { return dateStr(new Date()); }
function addDays(str, n) { const d = parseDate(str); d.setDate(d.getDate() + n); return dateStr(d); }
function parseDate(str) { const [y, m, d] = str.split("-").map(Number); return new Date(y, m - 1, d); }
function prettyDate(str) {
  if (str === todayStr()) return "Today";
  if (str === addDays(todayStr(), 1)) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(parseDate(str));
}
function toMinutes(hhmm) { const [a, b] = hhmm.split(":").map(Number); return a * 60 + b; }
function fromMinutes(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
function nowMinutes() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function ordinal(number) {
  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) return number + "th";
  return number + ({ 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th");
}
function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
function km(value) { return value < 1 ? Math.round(value * 1000) + " m" : value.toFixed(value < 10 ? 1 : 0) + " km"; }
function haversine(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const NAME_PATTERN = /^[\p{L}][\p{L}\s'.-]{1,49}$/u;
const MOBILE_PATTERN = /^[6-9]\d{9}$/;

let toastTimeout = null;
function showToast(message, isError = false) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 3400);
}

/* ================================================================ SAMPLE DATA
   Everything below is invented demo data for a college prototype. Centre names follow the kinds of
   citizen-service centres found in the Chandigarh tricity, but the addresses, hours, services, queues
   and slots are NOT official, live or verified. */

const CATEGORY_SEED = [
  { id: "aadhaar", name: "Aadhaar Services", icon: "◉", tone: "teal", desc: "Enrolment, demographic and biometric updates, and Aadhaar document help." },
  { id: "birth", name: "Birth & Civil Registration", icon: "✿", tone: "sky", desc: "Birth and death certificates, corrections and status enquiries." },
  { id: "income", name: "Income Certificate", icon: "₹", tone: "green", desc: "New income certificates, renewals and document help." },
  { id: "residence", name: "Residence & Domicile", icon: "⌂", tone: "indigo", desc: "Residence and domicile certificates, corrections and status." },
  { id: "caste", name: "Caste Certificate", icon: "❖", tone: "amber", desc: "New caste certificates, corrections and reapplications." },
  { id: "other", name: "Other Certificates & Public Services", icon: "▤", tone: "rose", desc: "EWS certificate, ration card, pension and other local services." },
  { id: "general", name: "General Centre Assistance", icon: "✚", tone: "slate", desc: "Document submission, verification, application help and enquiries." }
];

const PREP_ID = "Original proof of identity and proof of address, as listed on the official document list for this service.";
const SERVICE_SEED = [
  // Aadhaar
  { id: "aad-enrol", catId: "aadhaar", prefix: "AE", name: "Aadhaar enrolment", minutes: 20, walkIn: true, appt: true,
    desc: "New Aadhaar enrolment for eligible residents who do not have an Aadhaar number yet.",
    notes: "Eligibility and accepted documents follow the official enrolment rules. Children are usually enrolled with a parent or guardian present.",
    docs: [PREP_ID, "Proof of date of birth, if available.", "For a child: the parent or guardian's Aadhaar."] },
  { id: "aad-demo", catId: "aadhaar", prefix: "AU", name: "Name or address update", minutes: 12, walkIn: true, appt: true,
    desc: "Update demographic details such as name or address on an existing Aadhaar.",
    notes: "Only the details permitted by the current update rules can be changed at a centre.",
    docs: ["Your Aadhaar number.", "A valid supporting document for the detail you are updating."] },
  { id: "aad-dobmob", catId: "aadhaar", prefix: "AM", name: "Date of birth or mobile update", minutes: 10, walkIn: true, appt: true,
    desc: "Update date of birth or the linked mobile number, where the centre offers it.",
    notes: "Date-of-birth changes are limited by the official rules. A mobile update usually needs biometric verification.",
    docs: ["Your Aadhaar number.", "Proof of date of birth (for a date-of-birth update)."] },
  { id: "aad-bio", catId: "aadhaar", prefix: "AB", name: "Biometric update", minutes: 15, walkIn: true, appt: true,
    desc: "Update fingerprints, iris scan or photograph.",
    notes: "Mandatory biometric updates for children at certain ages are handled here.",
    docs: ["Your Aadhaar number or enrolment slip."] },
  { id: "aad-doc", catId: "aadhaar", prefix: "AD", name: "Aadhaar document assistance", minutes: 8, walkIn: true, appt: false,
    desc: "Help with Aadhaar-related documents and printouts.",
    notes: "Walk-in only.", docs: ["Your Aadhaar number and the registered mobile phone."] },
  // Birth and civil registration
  { id: "bir-new", catId: "birth", prefix: "BC", name: "Birth certificate application", minutes: 15, walkIn: true, appt: true,
    desc: "Apply for a birth certificate for a registered birth.", notes: "",
    docs: ["Hospital discharge slip or birth report.", "Parents' identity proof."] },
  { id: "bir-corr", catId: "birth", prefix: "BX", name: "Birth certificate correction", minutes: 20, walkIn: false, appt: true,
    desc: "Correct an error in an issued birth certificate, where offered.",
    notes: "Appointment only, because a records officer must verify the change.",
    docs: ["The issued birth certificate.", "Documentary proof of the correct detail.", "Applicant's identity proof."] },
  { id: "bir-status", catId: "birth", prefix: "BS", name: "Certificate status enquiry", minutes: 5, walkIn: true, appt: false,
    desc: "Check the status of a pending birth or death certificate application.", notes: "Walk-in only.",
    docs: ["Your application or receipt number."] },
  { id: "civ-death", catId: "birth", prefix: "DC", name: "Death certificate application", minutes: 15, walkIn: true, appt: true,
    desc: "Apply for a death certificate for a registered death.", notes: "",
    docs: ["Hospital or cremation/burial ground report.", "Applicant's identity proof."] },
  // Income
  { id: "inc-new", catId: "income", prefix: "IN", name: "New income certificate", minutes: 15, walkIn: true, appt: true,
    desc: "Apply for a new income certificate.", notes: "",
    docs: [PREP_ID, "Income proof such as a salary slip, ITR or a self-declaration, as applicable."] },
  { id: "inc-renew", catId: "income", prefix: "IR", name: "Renewal or reapplication", minutes: 12, walkIn: true, appt: true,
    desc: "Renew an expired income certificate or reapply after a rejection.", notes: "",
    docs: ["Previous certificate or application number.", "Current income proof."] },
  { id: "inc-status", catId: "income", prefix: "IS", name: "Income certificate status enquiry", minutes: 5, walkIn: true, appt: false,
    desc: "Check the status of a pending income certificate application.", notes: "Walk-in only.", docs: ["Application or receipt number."] },
  { id: "inc-docs", catId: "income", prefix: "ID", name: "Document help (income)", minutes: 10, walkIn: false, appt: true,
    desc: "Get help preparing the documents for an income certificate.", notes: "Appointment only.", docs: ["Any documents you already have."] },
  // Residence and domicile
  { id: "res-new", catId: "residence", prefix: "RC", name: "Residence certificate", minutes: 15, walkIn: true, appt: true,
    desc: "Apply for a residence certificate.", notes: "", docs: [PREP_ID, "Proof of how long you have lived at the address, as required."] },
  { id: "dom-new", catId: "residence", prefix: "DM", name: "Domicile certificate", minutes: 15, walkIn: true, appt: true,
    desc: "Apply for a domicile certificate.", notes: "Eligibility rules differ between Chandigarh, Punjab and Haryana.",
    docs: [PREP_ID, "Proof of residence for the required period."] },
  { id: "res-corr", catId: "residence", prefix: "RX", name: "Correction or reapplication", minutes: 15, walkIn: false, appt: true,
    desc: "Correct a residence or domicile certificate, or reapply.", notes: "Appointment only.", docs: ["Issued certificate or application number.", "Supporting proof."] },
  { id: "res-status", catId: "residence", prefix: "RS", name: "Residence/domicile status enquiry", minutes: 5, walkIn: true, appt: false,
    desc: "Check the status of a residence or domicile application.", notes: "Walk-in only.", docs: ["Application or receipt number."] },
  // Caste
  { id: "cas-new", catId: "caste", prefix: "CN", name: "Caste certificate: new application", minutes: 15, walkIn: true, appt: true,
    desc: "Apply for a new caste certificate.", notes: "", docs: [PREP_ID, "Supporting caste documents as listed for your state or UT."] },
  { id: "cas-corr", catId: "caste", prefix: "CX", name: "Caste certificate: correction or reapplication", minutes: 15, walkIn: true, appt: true,
    desc: "Correct a caste certificate or reapply.", notes: "", docs: ["Issued certificate or application number.", "Supporting proof."] },
  { id: "cas-status", catId: "caste", prefix: "CS", name: "Caste certificate status enquiry", minutes: 5, walkIn: true, appt: false,
    desc: "Check the status of a caste certificate application.", notes: "Walk-in only.", docs: ["Application or receipt number."] },
  // Other
  { id: "ews", catId: "other", prefix: "EW", name: "EWS certificate", minutes: 15, walkIn: true, appt: true,
    desc: "Apply for an Economically Weaker Section (EWS) certificate.", notes: "", docs: [PREP_ID, "Income and asset declaration as required."] },
  { id: "ration", catId: "other", prefix: "RA", name: "Ration card assistance", minutes: 12, walkIn: true, appt: true,
    desc: "Help with ration card applications, additions and corrections.", notes: "", docs: ["Existing ration card, if any.", "Family members' identity proof."] },
  { id: "pension", catId: "other", prefix: "PN", name: "Pension assistance", minutes: 15, walkIn: true, appt: true,
    desc: "Help with old-age, widow or disability pension applications.", notes: "", docs: ["Identity and age proof.", "Bank account details for payment."] },
  { id: "other-cert", catId: "other", prefix: "OC", name: "Other local certificates", minutes: 12, walkIn: true, appt: false,
    desc: "Other locally offered certificates and services.", notes: "Ask at the help desk for what this centre offers.", docs: ["Identity proof."] },
  // General
  { id: "gen-submit", catId: "general", prefix: "DS", name: "Document submission", minutes: 6, walkIn: true, appt: true,
    desc: "Submit documents for an application you have already made.", notes: "", docs: ["Application number and the documents requested."] },
  { id: "gen-assist", catId: "general", prefix: "AA", name: "Application assistance", minutes: 12, walkIn: true, appt: true,
    desc: "Get help filling in an application form.", notes: "", docs: ["Identity proof and any documents for the application."] },
  { id: "gen-verify", catId: "general", prefix: "DV", name: "Document verification", minutes: 15, walkIn: false, appt: true,
    desc: "Scheduled verification of original documents.", notes: "Appointment only.", docs: ["Originals and one set of photocopies."] },
  { id: "gen-enq", catId: "general", prefix: "GE", name: "General enquiry", minutes: 5, walkIn: true, appt: false,
    desc: "Ask a question at the help desk.", notes: "Walk-in only.", docs: [] }
];

/* Places known to the manual location search (approximate coordinates, sample data). */
const PLACES = [
  { label: "Chandigarh (city centre)", keys: "chandigarh city tricity", pin: "160017", lat: 30.7333, lng: 76.7794 },
  { label: "Sector 8, Chandigarh", keys: "sector 8 sec 8", pin: "160009", lat: 30.7413, lng: 76.8030 },
  { label: "Sector 14 (Panjab University), Chandigarh", keys: "sector 14 pu panjab university", pin: "160014", lat: 30.7600, lng: 76.7680 },
  { label: "Sector 15, Chandigarh", keys: "sector 15 sec 15", pin: "160015", lat: 30.7470, lng: 76.7680 },
  { label: "Sector 17, Chandigarh", keys: "sector 17 sec 17 plaza", pin: "160017", lat: 30.7410, lng: 76.7790 },
  { label: "Sector 22, Chandigarh", keys: "sector 22 sec 22", pin: "160022", lat: 30.7330, lng: 76.7720 },
  { label: "Sector 35, Chandigarh", keys: "sector 35 sec 35", pin: "160035", lat: 30.7225, lng: 76.7570 },
  { label: "Sector 43, Chandigarh", keys: "sector 43 sec 43 isbt", pin: "160047", lat: 30.7195, lng: 76.7470 },
  { label: "Manimajra, Chandigarh", keys: "manimajra mani majra", pin: "160101", lat: 30.7186, lng: 76.8356 },
  { label: "Mohali (Phase 7)", keys: "mohali phase 7 sas nagar sector 61", pin: "160062", lat: 30.7046, lng: 76.7179 },
  { label: "Kharar", keys: "kharar", pin: "140301", lat: 30.7466, lng: 76.6469 },
  { label: "Zirakpur", keys: "zirakpur", pin: "140603", lat: 30.6425, lng: 76.8173 },
  { label: "Panchkula (Sector 5)", keys: "panchkula sector 5 pkl", pin: "134109", lat: 30.6942, lng: 76.8606 },
  { label: "Panchkula (Sector 20)", keys: "panchkula sector 20", pin: "134116", lat: 30.6686, lng: 76.8564 }
];

const ALL_AADHAAR = ["aad-enrol", "aad-demo", "aad-dobmob", "aad-bio", "aad-doc"];
const CERTS = ["bir-new", "bir-corr", "bir-status", "civ-death", "inc-new", "inc-renew", "inc-status", "inc-docs", "res-new", "dom-new", "res-corr", "res-status", "cas-new", "cas-corr", "cas-status", "ews"];
const GENERAL = ["gen-submit", "gen-assist", "gen-verify", "gen-enq"];

/* offers: list of service ids. Per-centre exceptions go in `limits`. */
const CENTRE_SEED = [
  { id: "CH17", kind: "Sampark Centre", name: "Sampark Centre, Sector 17", area: "Sector 17", city: "Chandigarh", pin: "160017",
    address: "Sample address: Shop-cum-office block, Sector 17-B", lat: 30.7410, lng: 76.7790, open: "08:00", close: "20:00", days: [1, 2, 3, 4, 5, 6],
    offers: [...ALL_AADHAAR, ...CERTS, "ration", "pension", "other-cert", ...GENERAL], slotMinutes: 30, slotCapacity: 2,
    counters: [["Counter 1", ["aad-enrol", "aad-bio"]], ["Counter 2", ["aad-demo", "aad-dobmob", "aad-doc"]], ["Counter 3", CERTS], ["Counter 4", CERTS], ["Counter 5", ["ration", "pension", "other-cert", ...GENERAL]]] },
  { id: "CH22", kind: "Sampark Centre", name: "Sampark Centre, Sector 22", area: "Sector 22", city: "Chandigarh", pin: "160022",
    address: "Sample address: Near the market, Sector 22-B", lat: 30.7330, lng: 76.7720, open: "09:00", close: "17:00", days: [1, 2, 3, 4, 5, 6],
    offers: [...ALL_AADHAAR, "bir-new", "bir-status", "inc-new", "inc-renew", "inc-status", "res-new", "dom-new", "res-status", ...GENERAL], slotMinutes: 30, slotCapacity: 2,
    limits: { "aad-bio": { interrupted: "Biometric devices are under maintenance today (sample notice)." } },
    counters: [["Counter 1", ALL_AADHAAR], ["Counter 2", ALL_AADHAAR], ["Counter 3", ["bir-new", "bir-status", "inc-new", "inc-renew", "inc-status", "res-new", "dom-new", "res-status"]], ["Counter 4", GENERAL]] },
  { id: "CH35", kind: "Sampark Centre", name: "Sampark Centre, Sector 35", area: "Sector 35", city: "Chandigarh", pin: "160035",
    address: "Sample address: Community centre building, Sector 35-C", lat: 30.7225, lng: 76.7570, open: "09:00", close: "17:00", days: [1, 2, 3, 4, 5],
    offers: ["aad-enrol", "aad-demo", "aad-dobmob", "res-new", "dom-new", "res-corr", "cas-new", "cas-corr", "cas-status", "ews", "gen-submit", "gen-enq"], slotMinutes: 30, slotCapacity: 2,
    counters: [["Counter 1", ["aad-enrol", "aad-demo", "aad-dobmob"]], ["Counter 2", ["res-new", "dom-new", "res-corr", "cas-new", "cas-corr", "cas-status", "ews", "gen-submit", "gen-enq"]]] },
  { id: "CHMM", kind: "Sampark Centre", name: "Sampark Centre, Manimajra", area: "Manimajra", city: "Chandigarh", pin: "160101",
    address: "Sample address: Main road, Manimajra", lat: 30.7186, lng: 76.8356, open: "09:00", close: "17:00", days: [1, 2, 3, 4, 5, 6],
    offers: ["aad-demo", "aad-dobmob", "aad-doc", "bir-new", "bir-status", "civ-death", "inc-new", "inc-renew", "inc-status", "gen-submit", "gen-assist", "gen-enq"], slotMinutes: 30, slotCapacity: 1,
    pausedQueues: ["inc-new"],
    counters: [["Counter 1", ["aad-demo", "aad-dobmob", "aad-doc"]], ["Counter 2", ["bir-new", "bir-status", "civ-death", "inc-new", "inc-renew", "inc-status"]], ["Counter 3", ["gen-submit", "gen-assist", "gen-enq"], false]] },
  { id: "CH43", kind: "Sampark Centre", name: "Sampark Centre, Sector 43", area: "Sector 43", city: "Chandigarh", pin: "160047",
    address: "Sample address: Near the bus stand, Sector 43", lat: 30.7195, lng: 76.7470, open: "10:00", close: "18:00", days: [1, 2, 3, 4, 5, 6],
    offers: ["aad-demo", "aad-dobmob", "bir-new", "inc-new", "res-new", "gen-enq"], slotMinutes: 30, slotCapacity: 2,
    status: "closed", notice: "Temporarily closed for renovation (sample notice). Please use another centre.",
    counters: [["Counter 1", ["aad-demo", "aad-dobmob"], false], ["Counter 2", ["bir-new", "inc-new", "res-new", "gen-enq"], false]] },
  { id: "MOH7", kind: "Sewa Kendra", name: "Sewa Kendra, Mohali Phase 7", area: "Phase 7, Mohali", city: "SAS Nagar (Mohali)", pin: "160062",
    address: "Sample address: Near the district offices, Phase 7", lat: 30.7046, lng: 76.7179, open: "09:00", close: "17:00", days: [1, 2, 3, 4, 5, 6],
    offers: ["aad-enrol", "aad-demo", "aad-bio", "bir-new", "bir-corr", "bir-status", "civ-death", "inc-new", "inc-renew", "inc-status", "inc-docs", "res-new", "dom-new", "res-corr", "res-status", "cas-new", "cas-corr", "cas-status", "ews", "ration", "pension", "gen-submit", "gen-assist", "gen-verify", "gen-enq"],
    slotMinutes: 30, slotCapacity: 2,
    counters: [["Counter 1", ["aad-enrol", "aad-demo", "aad-bio"]], ["Counter 2", CERTS], ["Counter 3", CERTS], ["Counter 4", ["ration", "pension", ...GENERAL]]] },
  { id: "KHR", kind: "Sewa Kendra", name: "Sewa Kendra, Kharar", area: "Kharar", city: "SAS Nagar (Mohali)", pin: "140301",
    address: "Sample address: Tehsil complex, Kharar", lat: 30.7466, lng: 76.6469, open: "09:00", close: "17:00", days: [1, 2, 3, 4, 5],
    offers: ["aad-demo", "aad-dobmob", "inc-new", "inc-renew", "inc-status", "res-new", "dom-new", "cas-new", "cas-status", "pension", "ration", "gen-enq"],
    slotMinutes: 30, slotCapacity: 1,
    counters: [["Counter 1", ["aad-demo", "aad-dobmob", "gen-enq"]], ["Counter 2", ["inc-new", "inc-renew", "inc-status", "res-new", "dom-new", "cas-new", "cas-status", "pension", "ration"]]] },
  { id: "PKL5", kind: "Antyodaya Saral Kendra", name: "Saral Kendra, Panchkula Sector 5", area: "Sector 5, Panchkula", city: "Panchkula", pin: "134109",
    address: "Sample address: Mini secretariat area, Sector 5", lat: 30.6942, lng: 76.8606, open: "09:00", close: "17:00", days: [1, 2, 3, 4, 5, 6],
    offers: ["aad-enrol", "aad-demo", "aad-dobmob", "aad-bio", "bir-new", "bir-status", "inc-new", "inc-renew", "inc-status", "res-new", "dom-new", "res-status", "cas-new", "cas-corr", "cas-status", "ews", "ration", "pension", "gen-submit", "gen-assist", "gen-verify", "gen-enq"],
    slotMinutes: 30, slotCapacity: 2,
    counters: [["Counter 1", ["aad-enrol", "aad-bio"]], ["Counter 2", ["aad-demo", "aad-dobmob"]], ["Counter 3", ["bir-new", "bir-status", "inc-new", "inc-renew", "inc-status", "res-new", "dom-new", "res-status", "cas-new", "cas-corr", "cas-status", "ews"]], ["Counter 4", ["bir-new", "inc-new", "inc-renew", "res-new", "dom-new", "cas-new", "cas-corr", "ews"]], ["Counter 5", ["ration", "pension", ...GENERAL]]] },
  { id: "ZRK", kind: "Sewa Kendra", name: "Sewa Kendra, Zirakpur", area: "Zirakpur", city: "SAS Nagar (Mohali)", pin: "140603",
    address: "Sample address: Near the municipal office, Zirakpur", lat: 30.6425, lng: 76.8173, open: "09:00", close: "17:00", days: [1, 2, 3, 4, 5, 6],
    offers: ["aad-demo", "aad-dobmob", "aad-doc", "bir-new", "bir-status", "inc-new", "inc-renew", "res-new", "dom-new", "gen-submit", "gen-enq"],
    slotMinutes: 30, slotCapacity: 1,
    limits: { "bir-new": { appt: false } },
    counters: [["Counter 1", ["aad-demo", "aad-dobmob", "aad-doc", "gen-submit", "gen-enq"]], ["Counter 2", ["bir-new", "bir-status", "inc-new", "inc-renew", "res-new", "dom-new"]]] }
];

const SAMPLE_NAMES = ["Kavita Rao", "Rahul Sharma", "Simran Kaur", "Gaurav Singh", "Neha Joshi", "Karan Malhotra", "Pooja Nanda", "Vikram Bedi", "Meera Kapoor",
  "Amit Verma", "Sunita Rani", "Harjot Dhillon", "Rajesh Kumar", "Anjali Mehta", "Ishaan Rao", "Naina Iyer", "Dev Patel", "Zoya Khan", "Arjun Nair", "Tara Sen",
  "Rohan Bose", "Diya Menon", "Manpreet Gill", "Baldev Saini", "Ritu Chauhan", "Jaspreet Sandhu", "Sahil Arora", "Komal Thakur", "Nitin Goyal", "Preeti Bansal"];

/* Small deterministic random generator so the sample data looks the same on every reset. */
function seededRandom(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

function buildCentre(seed) {
  const offers = {};
  seed.offers.forEach(svcId => {
    const svc = SERVICE_SEED.find(s => s.id === svcId);
    offers[svcId] = { walkIn: svc.walkIn, appt: svc.appt, interrupted: "", ...(seed.limits && seed.limits[svcId] || {}) };
  });
  return {
    id: seed.id, kind: seed.kind, name: seed.name, area: seed.area, city: seed.city, pin: seed.pin, address: seed.address,
    lat: seed.lat, lng: seed.lng, open: seed.open, close: seed.close, days: seed.days.slice(),
    status: seed.status || "open", notice: seed.notice || "", active: true,
    tokenCutoff: 30, slotMinutes: seed.slotMinutes, slotCapacity: seed.slotCapacity, bookDays: 14, closedDates: [],
    offers,
    counters: seed.counters.map((c, i) => ({ id: seed.id + "-K" + (i + 1), label: c[0], svcIds: c[1].filter(id => offers[id]), open: c[2] !== false, current: null }))
  };
}

/* Queue sizes for the sample data: [centre, service, waiting, serving?] */
const QUEUE_SEED = [
  ["CH17", "aad-enrol", 3, true], ["CH17", "aad-demo", 3, true], ["CH17", "aad-dobmob", 2], ["CH17", "inc-new", 3, true], ["CH17", "bir-new", 2], ["CH17", "dom-new", 1], ["CH17", "cas-new", 2], ["CH17", "pension", 1, true], ["CH17", "gen-enq", 2],
  ["CH22", "aad-enrol", 3, true], ["CH22", "aad-demo", 4, true], ["CH22", "aad-dobmob", 2], ["CH22", "inc-new", 2, true], ["CH22", "res-new", 1], ["CH22", "gen-submit", 1, true],
  ["CH35", "aad-demo", 1, true], ["CH35", "cas-new", 1],
  ["CHMM", "aad-demo", 2, true], ["CHMM", "bir-new", 1, true], ["CHMM", "inc-status", 1],
  ["MOH7", "aad-enrol", 2, true], ["MOH7", "inc-new", 4, true], ["MOH7", "res-new", 2], ["MOH7", "dom-new", 2, true], ["MOH7", "pension", 2, true], ["MOH7", "ration", 1],
  ["KHR", "aad-demo", 1], ["KHR", "inc-new", 1, true],
  ["PKL5", "aad-enrol", 2, true], ["PKL5", "aad-demo", 3, true], ["PKL5", "inc-new", 3, true], ["PKL5", "cas-new", 2], ["PKL5", "ews", 1], ["PKL5", "ration", 2, true],
  ["ZRK", "aad-demo", 2, true], ["ZRK", "inc-new", 1], ["ZRK", "gen-enq", 1, true]
];

function freshState() {
  const rand = seededRandom(20261023), now = Date.now(), minute = 60000;
  const pick = list => list[Math.floor(rand() * list.length)];
  const services = SERVICE_SEED.map(s => ({ ...s, docs: s.docs.slice(), fee: "", active: true }));
  const centres = CENTRE_SEED.map(buildCentre);
  const s = {
    version: 4, createdAt: now,
    settings: { ignoreHours: false },
    categories: CATEGORY_SEED.map(c => ({ ...c, active: true })),
    services, centres,
    queues: {}, appointments: [], tokenLog: [], activity: [], notices: []
  };
  const svc = id => services.find(x => x.id === id);
  centres.forEach(c => {
    s.queues[c.id] = {};
    Object.keys(c.offers).forEach(id => { s.queues[c.id][id] = { seq: 0, waiting: [], paused: false }; });
    const seed = CENTRE_SEED.find(x => x.id === c.id);
    (seed.pausedQueues || []).forEach(id => { s.queues[c.id][id].paused = true; });
  });
  const makeEntry = (centreId, svcId, minutesAgo, extra) => {
    const q = s.queues[centreId][svcId];
    q.seq += 1;
    return { id: uid("t"), token: svc(svcId).prefix + String(q.seq).padStart(3, "0"), userId: null, name: pick(SAMPLE_NAMES), centreId, svcId,
      createdAt: now - minutesAgo * minute, rank: 2, priority: false, sample: true, ...extra };
  };
  /* Completed tokens earlier today, so the wait-time model has data to learn from. */
  centres.forEach(c => {
    if (c.status !== "open") return;
    c.counters.forEach(counter => {
      for (let i = 0; i < 4; i++) {
        const svcId = pick(counter.svcIds), base = svc(svcId).minutes, took = Math.max(3, Math.round(base * (0.7 + rand() * 0.7)));
        const doneAgo = 30 + Math.round(rand() * 200), entry = makeEntry(c.id, svcId, doneAgo + took + 5 + Math.round(rand() * 25));
        entry.servingAt = now - (doneAgo + took) * minute; entry.completedAt = now - doneAgo * minute;
        s.tokenLog.push({ ...entry, counterId: counter.id, outcome: "completed", closedAt: entry.completedAt });
      }
    });
  });
  /* Waiting and serving customers. */
  QUEUE_SEED.forEach(([centreId, svcId, count, serving]) => {
    const c = centres.find(x => x.id === centreId), q = s.queues[centreId][svcId];
    if (serving) {
      const counter = c.counters.find(k => k.open && !k.current && k.svcIds.includes(svcId));
      if (counter) { const e = makeEntry(centreId, svcId, 18 + Math.round(rand() * 10)); e.servingAt = now - (2 + Math.round(rand() * 5)) * minute; e.counterId = counter.id; counter.current = e; }
    }
    for (let i = 0; i < count; i++) {
      const e = makeEntry(centreId, svcId, Math.max(1, (count - i) * 4 + Math.round(rand() * 3)));
      if (i === 0 && rand() < 0.25) { e.priority = true; e.rank = 0; }
      q.waiting.push(e);
    }
    sortQueue(q.waiting);
  });
  s.tokenLog.sort((a, b) => b.closedAt - a.closedAt);
  /* Sample appointments from other people, so some slots show as full. */
  centres.forEach(c => {
    if (c.status !== "open") return;
    const apptServices = Object.keys(c.offers).filter(id => svc(id).appt && c.offers[id].appt);
    for (let d = 0; d < 6; d++) {
      const date = addDays(todayStr(), d);
      if (!c.days.includes(parseDate(date).getDay())) continue;
      const slots = slotTimes(c);
      for (let k = 0; k < 5; k++) {
        const svcId = pick(apptServices), time = pick(slots);
        if (d === 0 && toMinutes(time) <= nowMinutes()) continue;
        const taken = s.appointments.filter(a => a.centreId === c.id && a.svcId === svcId && a.date === date && a.time === time).length;
        if (taken >= c.slotCapacity) continue;
        s.appointments.push({ id: uid("a"), ref: makeRef(s.appointments), userId: null, name: pick(SAMPLE_NAMES), mobile: "", centreId: c.id, svcId, date, time, status: "booked", createdAt: now - Math.round(rand() * 3000) * minute, sample: true });
      }
    }
  });
  /* History for the demo customer account, so My Activity has something to show. */
  const ch17 = centres[0], yesterday = now - 26 * 60 * minute;
  s.tokenLog.push({ id: uid("t"), token: "AU117", userId: "@customer", name: "Asha Verma", centreId: "CH17", svcId: "aad-demo", rank: 2, priority: false,
    createdAt: yesterday, servingAt: yesterday + 21 * minute, completedAt: yesterday + 33 * minute, counterId: ch17.counters[1].id, outcome: "completed", closedAt: yesterday + 33 * minute });
  s.appointments.push({ id: uid("a"), ref: makeRef(s.appointments), userId: "@customer", name: "Asha Verma", mobile: "9876500000", centreId: "PKL5", svcId: "inc-new",
    date: addDays(todayStr(), -3), time: "11:00", status: "cancelled", createdAt: now - 6 * 24 * 60 * minute, cancelledAt: now - 4 * 24 * 60 * minute });
  const pkl = centres.find(x => x.id === "MOH7");
  let future = addDays(todayStr(), 3);
  while (!pkl.days.includes(parseDate(future).getDay())) future = addDays(future, 1);
  s.appointments.push({ id: uid("a"), ref: makeRef(s.appointments), userId: "@customer", name: "Asha Verma", mobile: "9876500000", centreId: "MOH7", svcId: "dom-new",
    date: future, time: "11:30", status: "booked", createdAt: now - 2 * 60 * minute });
  s.activity = [
    { message: "Sample data loaded: 9 centres, 7 service categories, " + services.length + " services.", time: now - 3 * minute, icon: "✦" },
    { message: "Biometric updates paused at Sampark Centre, Sector 22 (sample notice).", time: now - 40 * minute, icon: "⏸" },
    { message: "Sampark Centre, Sector 43 marked temporarily closed (sample notice).", time: now - 90 * minute, icon: "⚙" }
  ];
  return s;
}

function makeRef(existing) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref;
  do {
    ref = "QE-" + todayStr().slice(5).replace("-", "") + "-" + Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (existing.some(a => a.ref === ref));
  return ref;
}

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

/* ================================================================ ACCOUNTS */
let authRole = "citizen";
let authMode = "login";

function loadUsers() {
  const saved = readJSON("local", USERS_KEY, []);
  return Array.isArray(saved) ? saved : [];
}
function saveUsers() { storeSet("local", USERS_KEY, JSON.stringify(users)); return true; }
/* Passwords are salted and hashed. This is still a browser-only prototype, not real security. */
async function hashPassword(password, salt) {
  const text = salt + ":" + password;
  if (window.crypto && window.crypto.subtle) {
    const buffer = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 5381;
  for (const char of text) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return "f" + hash.toString(16);
}
function makeSalt() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
async function createUser({ name, username, password, role, centreId }) {
  const salt = makeSalt();
  return { id: uid("u"), name, username, role, salt, hash: await hashPassword(password, salt), createdAt: Date.now(), centreId: centreId || null };
}
async function seedDefaultAccounts() {
  users = loadUsers();
  let changed = false;
  for (const account of QUICK_ACCOUNTS) {
    const existing = users.find(user => user.username === account.username);
    if (!existing) { users.push(await createUser(account)); changed = true; }
    else if (account.role === "staff" && !existing.centreId) { existing.centreId = account.centreId; changed = true; }
  }
  if (changed) saveUsers();
}

/* ---------------------------------------------------------------- auth screen (design unchanged) */
function updateAuthUI() {
  const register = authMode === "register";
  const roleLabel = ROLE_LABEL[authRole];
  document.querySelectorAll("[data-auth-role]").forEach(button => button.classList.toggle("active", button.dataset.authRole === authRole));
  document.querySelectorAll("[data-auth-mode='register']").forEach(el => el.classList.toggle("hidden", !register));
  $("staffCodeGroup").classList.toggle("hidden", !(register && authRole === "staff"));
  $("authTitle").textContent = roleLabel + (register ? " registration" : " login");
  $("authSubmit").innerHTML = (register ? "Create account" : "Log in") + " <span>→</span>";
  $("authSwitchText").textContent = register ? "Already registered?" : "New to QueueEase?";
  $("authSwitchBtn").textContent = register ? "Log in instead" : "Create an account";
  $("authPassword").autocomplete = register ? "new-password" : "current-password";
  const quick = $("quickLoginBtn");
  quick.classList.toggle("hidden", register);
  quick.textContent = "Quick login as " + roleLabel.toLowerCase();
  $("authSwitchBtn").parentElement.classList.toggle("hidden", authRole === "admin");
  $("authMessage").textContent = "";
  $("authMessage").className = "form-message";
}
function authFail(text, field) {
  $("authMessage").textContent = text;
  $("authMessage").className = "form-message";
  if (field) field.focus();
}
async function quickLogin() {
  await ready;
  users = loadUsers();
  const acct = QUICK_ACCOUNTS.find(account => account.role === authRole);
  const user = users.find(entry => entry.username === acct.username);
  if (!user) return authFail("Quick login is not available. Reload the page and try again.");
  signIn(user);
}
async function handleAuthSubmit(event) {
  event.preventDefault();
  await ready;
  users = loadUsers();
  const nameInput = $("authName"), usernameInput = $("authUsername"), passwordInput = $("authPassword"), confirmInput = $("authConfirm"), codeInput = $("authStaffCode");
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return authFail("Username must be 3–20 characters: letters, numbers or underscore.", usernameInput);
  if (password.length < 6) return authFail("Password must be at least 6 characters.", passwordInput);

  if (authMode === "login") {
    const user = users.find(entry => entry.username === username);
    const hash = user ? await hashPassword(password, user.salt) : null;
    if (!user || hash !== user.hash) return authFail("Incorrect username or password.", passwordInput);
    if (user.role !== authRole) return authFail(`This is a ${ROLE_LABEL[user.role].toLowerCase()} account. Use the ${ROLE_LABEL[user.role]} tab to sign in.`);
    signIn(user);
    return;
  }
  if (authRole === "admin") return authFail("Administrator accounts cannot be self-registered. Use the demo admin login.");
  const name = nameInput.value.trim().replace(/\s+/g, " ");
  if (!NAME_PATTERN.test(name)) return authFail("Enter a valid full name using at least 2 letters. Numbers and symbols are not allowed.", nameInput);
  if (password !== confirmInput.value) return authFail("The two passwords do not match.", confirmInput);
  if (authRole === "staff" && codeInput.value.trim() !== STAFF_ACCESS_CODE) return authFail("Invalid staff access code.", codeInput);
  if (users.some(entry => entry.username === username)) return authFail("That username is already taken. Please choose another.", usernameInput);
  const user = await createUser({ name, username, password, role: authRole, centreId: authRole === "staff" ? state.centres[0].id : null });
  users.push(user);
  saveUsers();
  signIn(user);
  if (user.role === "staff") showToast("Staff account created. You are assigned to " + state.centres[0].name + " until an administrator changes it.");
}
function signIn(user) {
  currentUser = user;
  storeSet("session", SESSION_KEY, user.id);
  enterApp();
  showToast("Welcome, " + firstName() + ".");
}
function restoreSession() {
  const id = storeGet("session", SESSION_KEY);
  const user = id ? loadUsers().find(entry => entry.id === id) : null;
  if (user) { currentUser = user; enterApp(); } else showAuth();
}
function showAuth() {
  $("authScreen").classList.remove("hidden");
  $("appShell").classList.add("hidden");
}
function firstName() { return currentUser ? currentUser.name.split(" ")[0] : ""; }
function isStaff() { return Boolean(currentUser) && (currentUser.role === "staff" || currentUser.role === "admin"); }
function isAdmin() { return Boolean(currentUser) && currentUser.role === "admin"; }
function isCustomer() { return Boolean(currentUser) && currentUser.role === "citizen"; }

function enterApp() {
  $("authScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("authForm").reset();
  const roleLabel = ROLE_LABEL[currentUser.role];
  $("userName").textContent = currentUser.name;
  $("userRole").textContent = roleLabel + " account";
  $("roleBadge").textContent = roleLabel.toUpperCase();
  $("sideAvatar").textContent = initials(currentUser.name);
  $("topAvatar").textContent = initials(currentUser.name);
  $("topAvatar").title = currentUser.name;
  document.querySelectorAll("[data-roles]").forEach(el => el.classList.toggle("hidden", !el.dataset.roles.split(" ").includes(currentUser.role)));
  notifSeen = Number(storeGet("local", "queueease_seen_" + currentUser.id)) || Date.now();
  journey = loadJourney();
  syncState();
  const route = parseRoute();
  if (route.view && ROLE_VIEWS[currentUser.role].includes(route.view)) applyRoute(route); else go("overview");
}
function logout() {
  if (simTimer) toggleSim();
  storeRemove("session", SESSION_KEY);
  currentUser = null;
  authRole = "citizen";
  authMode = "login";
  $("authForm").reset();
  closeModal();
  updateAuthUI();
  history.replaceState(null, "", location.pathname + location.search);
  showAuth();
  showToast("You have been logged out.");
}

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
