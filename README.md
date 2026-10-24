# QueueEase: Smart Service Discovery, Digital Queue and Appointment Management

A client-side prototype built with plain HTML, CSS and JavaScript. There is no server and no external library.

> **All centres, queues, slots and availability are sample data.** The centre names follow the Sampark Centres, Sewa Kendras and Saral Kendras of the Chandigarh tricity. The addresses, hours, services, fees and waiting figures are invented. They are not live, official or verified.

## Setup

1. Keep `index.html`, `style.css` and `script.js` in the same folder.
2. Open `index.html` in a modern browser (Chrome, Edge, Firefox or Safari). Double-clicking the file works.
   - Optional: serve the folder with `python -m http.server 8000`, then open `http://localhost:8000`. Use this if you want "Use my location" to work, because browsers only allow geolocation on `localhost` or HTTPS.
3. Sign in with a quick-login button, or use these demo accounts:

| Role | Username | Password | Notes |
|---|---|---|---|
| Customer | `customer` | `customer123` | Comes with a sample history and one upcoming appointment |
| Staff | `staff` | `staff123` | Assigned to Sampark Centre, Sector 22 |
| Admin | `admin` | `admin123` | Full access |

New staff accounts can register with the access code `QUEUEEASE-STAFF`.

**Tip for demos:** open a customer tab and a staff tab side by side. They share data and update each other instantly.

Centres follow their opening hours. To demo walk-in tokens in the evening, go to **Administration → Settings** and turn on **Ignore opening hours**. Customers then see a "demo: opening hours ignored" label.

`src/` holds the same code split into numbered parts for easier editing. To rebuild after editing the parts, run `cat src/0*.js src/1*.js > script.js`. The app only needs `script.js`.

## Customer journey

**Select service → Exact service → Find a centre → Centre queue and slots → Token or appointment → Track**

A five-step progress bar sits at the top of the journey. Every completed step is clickable, and the browser Back button works.

1. **Service discovery.** Search across all services, or browse 7 categories with 28 services. Each service shows walk-in and appointment support, typical counter time, notes, a document checklist and how many centres offer it. A fee appears only if an admin has configured it.
2. **Centre discovery.** The list shows only centres that offer the selected service; a count tells you how many centres were hidden. You can set a location by sector, town or PIN code, or with "Use my location", which asks for permission only when pressed. Filters cover walk-in available now, appointment slots, open now and distance. Sort options are nearest, shortest wait, earliest appointment and name. There is a list view and a schematic plot; the plot is clearly labelled as not a map.
3. **Centre details.** Shows the queue for the selected service at that centre: status, people waiting, estimated wait with the method explained, open counters and now-serving token numbers (never names). It also shows notices, the token cutoff, a refresh button, and every other service at the centre.
4. **Options:**
   - **A. Walk-in token.** Confirmation modal, optional priority request, then a receipt with token, position, people ahead, estimated wait and status.
   - **B. Appointment.** Date strip, slot grid with seats left, a details form (name and a validated 10-digit mobile number), a review step, then a booking reference such as `QE-1023-K7P2`.
   - **C. Explore other centres.** The top alternatives, plus "Compare all". Your service and location stay selected.
5. **My activity.** Three tabs: Active, Upcoming and History (completed, cancelled, no-show, missed). Each card shows its next step. You can cancel with confirmation, and check in on the appointment day, which turns the booking into a token.

**Notifications** are in-app only. You get messages when your token is issued, when one person is ahead, when you are next, when you are called, when service is complete, and when a booking is cancelled by the centre.

**Smart Assist** is optional and rule-based. It suggests a quieter centre only when the saving is at least 10 minutes and at least 30%. It explains why, and mentions extra distance when it knows your location. It also suggests alternative dates or centres when a day is full. Every tip can be dismissed, and Smart Assist can be turned off on the Overview page.

## Staff console

- Centre-scoped. Staff see their assigned centre; admins can switch centres.
- Counter tabs. Call next (`N`), mark served (`S`), skip to the end of the line (`K`), and no-show. A second skip also marks a no-show.
- Call a specific token, or remove a token with confirmation.
- Open or close counters. A counter can't be closed while it is serving someone.
- Pause or resume new tokens for each service.
- Search customers by name, token, booking reference or mobile (`/` focuses the search).
- Today's appointments: check in for the customer, or mark a no-show from 30 minutes after the slot.

## Administration

- **Services catalogue:** add, edit, activate or deactivate categories and services. Each service has a token code, walk-in/appointment flags, typical minutes, notes, documents and an optional fee. Token codes must be unique.
- **Centres:** add a centre; edit details, hours, days, status, public notice, visibility and token cutoff. Choose the services offered, with per-service walk-in, appointment and interruption settings. Manage counters and the services each counter serves. Configure slots: length, bookings per slot, days ahead, and holidays. Adding a holiday cancels affected bookings and notifies those customers.
- **Staff:** assign staff to centres, or remove staff accounts.
- **Analytics** (today, 7 days or all): tokens served, average actual wait, average time at the counter, no-show rate, tokens by centre, most requested services, appointment outcomes and people waiting now. CSV export is available.
- **Settings:** the opening-hours override, a demo-data reset, and what a real deployment would need.

Every change takes effect for customers immediately. Safeguards prevent damage:

- A service with people in its queue can't be removed from a centre.
- Deactivating a service stops new tokens and bookings. People already waiting can still be served.

## Queue logic

**Separate queues.** Every centre keeps its own queue for each service (`state.queues[centreId][serviceId]`).

**Order.** Priority requests come first, then appointment check-ins, then walk-ins. Within each group it is first come, first served. A skipped token goes to the end once.

**Shared counters.** A counter can serve several services. When it calls the next customer, it takes the next person across all of its services. The line a token really stands in is therefore the pooled line of every service sharing those counters. Position and people ahead are counted in that pooled line. Customers see, for example, "+3 for other services at the same counters".

**Estimated wait** =
(sum of typical minutes for everyone ahead in the pooled line + minutes left for customers already at those counters)
÷ number of open counters.

**Typical minutes** are learned from completed tokens:
`(prior × 3 + sum of observed durations) ÷ (3 + number of samples)`.
This uses up to 20 recent tokens for that service at that centre, or across all centres if the centre has fewer than 3. With little data the estimate leans on the configured value; with more data it follows reality.

**Status labels** use the estimated wait for someone joining now:

| Label | Meaning |
|---|---|
| Low waiting | under 15 min |
| Moderate waiting | 15–39 min |
| Busy | 40 min or more |
| Token issuance paused | outside hours, within the closing cutoff (30 min by default), no open counter, or paused by staff |
| Appointment only | walk-in tokens not offered for this service here |
| Service unavailable | centre temporarily closed, or service interrupted |

**Appointments.** Slots run from opening to closing at the configured length. Each slot accepts the configured number of bookings per service. Past slots, and slots starting within 15 minutes, can't be booked. Closed days and holidays have no slots.

**Booking rules:**
- No two bookings for the same service on the same date.
- At most 3 upcoming appointments.
- At most 2 active tokens.
- Slot availability is re-checked at the moment of confirmation.

**Sync.** Every action re-reads storage before changing anything. Other open tabs update through the `storage` event, and all views refresh every 15 seconds. Nothing claims to be real-time from a real centre.

## Test results

The tests ran automatically in headless Chromium (Playwright) on 23 Oct 2026, with the browser set to the India time zone and screens of 1440 px and 390 px wide. **63 of 63 checks passed, with no JavaScript errors.** Covered:

- **Discovery:** 7 categories; search hits and no-match; exact-service selection.
- **Centre matching:** only offering centres are listed; Mohali is correctly excluded for date-of-birth/mobile updates.
- **Location:** unknown place message; sector search; PIN search; nearest-first order with ascending distances; 5 km filter; walk-in filter; schematic view; geolocation both denied and granted.
- **Tokens:** confirmation modal; name validation; token prefix; receipt; tracking; duplicate in the same queue blocked; switching centre needs explicit consent; closing the modal keeps the original token.
- **Appointments:** mobile validation; review step; reference format; duplicate same-day booking blocked; full slot disabled; cancellation.
- **Persistence and permissions:** session, token and route survive a refresh; customers can't open the admin or staff pages.
- **Staff and customer in two tabs:** staff console scoped to its centre; tokens called in order; customer sees "Being served"; "you are next" and "it is your turn" notifications; completed history; skip goes to the end; a paused service shows as paused to customers and disables "Get a token"; staff search.
- **Admin:** a deactivated service is hidden and its route shows unavailable; duplicate token code rejected; a new service plus counter appears only at the configured centre; a closed centre shows its notice; analytics renders; CSV downloads; the live demo runs.
- **Mobile:** no horizontal scrolling on 5 customer screens.

## Known limitations

- **Single browser only.** Data lives in this browser's `localStorage`. Different devices don't share it. A real system needs a shared database, a server API and real-time sync such as WebSockets.
- **Not real security.** Passwords are salted and SHA-256 hashed in the browser, and roles are checked only in the browser.
- **No outside notifications.** Nothing is sent by SMS, e-mail or push.
- **Simulated data.** Centre data, document checklists and waits are samples. Eligibility, documents and fees must come from official sources.
- **Limited location search.** It knows only about 14 tricity places. There is no map provider; the schematic plot is not a map.
- **Simple estimates.** The wait model assumes counters free up evenly and ignores walk-outs.
- **Edits can collide.** Two admins editing the same thing in two tabs at the same moment: the last save wins.
