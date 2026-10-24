
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
