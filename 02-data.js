
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
