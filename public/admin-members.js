const form = document.getElementById("adminMembersAccessForm");
const passwordInput = document.getElementById("adminMembersPassword");
const showPassword = document.getElementById("showMembersPassword");
const statusEl = document.getElementById("membersStatus");
const membersSection = document.getElementById("membersSection");
const refreshBtn = document.getElementById("refreshMembersBtn");
const membersTbody = document.getElementById("membersTbody");
const themeToggleBtn = document.getElementById("themeToggleBtn");

let isUnlocked = false;

const THEME_KEY = "owner_theme";

function applyTheme(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", safeTheme);
  localStorage.setItem(THEME_KEY, safeTheme);
  themeToggleBtn.textContent = safeTheme === "dark" ? "Light mode" : "Dark mode";
}

showPassword.addEventListener("change", () => {
  passwordInput.type = showPassword.checked ? "text" : "password";
});

themeToggleBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "dark" ? "light" : "dark");
});

async function auth(password) {
  const response = await fetch("/api/admin/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password
    },
    body: JSON.stringify({ password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Sign in failed.");
}

async function loadMembers() {
  if (!isUnlocked) return;
  const password = (passwordInput.value || "").trim();
  statusEl.textContent = "Loading customers...";
  membersTbody.innerHTML = "";

  const response = await fetch("/api/admin/loyalty/members", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password
    },
    body: JSON.stringify({ password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not load customers.");

  const members = Array.isArray(data.members) ? data.members : [];
  if (!members.length) {
    statusEl.textContent = "No customers found yet.";
    return;
  }

  members.forEach((member) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td style="padding: 6px; border-top: 1px solid #e2e8f0">${member.name || ""}</td>
      <td style="padding: 6px; border-top: 1px solid #e2e8f0">${member.phoneDisplay || member.phone || ""}</td>
      <td style="padding: 6px; border-top: 1px solid #e2e8f0">${String(member.points ?? 0)}</td>
    `;
    membersTbody.appendChild(row);
  });

  statusEl.textContent = `Loaded ${members.length} customer(s).`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = (passwordInput.value || "").trim();
  if (!password) {
    statusEl.textContent = "Enter admin password.";
    return;
  }
  statusEl.textContent = "Signing in...";
  try {
    await auth(password);
    sessionStorage.setItem("admin_password", password);
    window.location.replace("/owner-qr.html");
  } catch (e) {
    statusEl.textContent = e.message || "Sign in failed.";
  }
});

refreshBtn.addEventListener("click", async () => {
  try {
    await loadMembers();
  } catch (e) {
    statusEl.textContent = e.message || "Could not load customers.";
  }
});

async function trySessionUnlock() {
  const pwd = sessionStorage.getItem("admin_password");
  if (!pwd) return;
  passwordInput.value = pwd;
  try {
    await auth(pwd);
    isUnlocked = true;
    membersSection.classList.remove("hidden");
    await loadMembers();
  } catch {
    sessionStorage.removeItem("admin_password");
    passwordInput.value = "";
  }
}

applyTheme(localStorage.getItem(THEME_KEY) || "light");
trySessionUnlock();
