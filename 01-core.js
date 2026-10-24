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
