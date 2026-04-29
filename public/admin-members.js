const statusEl = document.getElementById("membersStatus");
const membersSection = document.getElementById("membersSection");
const refreshBtn = document.getElementById("refreshMembersBtn");
const membersTbody = document.getElementById("membersTbody");
const themeToggleBtn = document.getElementById("themeToggleBtn");

const THEME_KEY = "owner_theme";

function getAdminPassword() {
  return (sessionStorage.getItem("admin_password") || "").trim();
}

function applyTheme(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", safeTheme);
  localStorage.setItem(THEME_KEY, safeTheme);
  themeToggleBtn.textContent = safeTheme === "dark" ? "Light mode" : "Dark mode";
}

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
  const password = getAdminPassword();
  if (!password) {
    window.location.replace("/owner.html");
    return;
  }

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
  if (response.status === 401) {
    sessionStorage.removeItem("admin_password");
    statusEl.innerHTML =
      'Session expired or invalid. <a href="/owner.html">Sign in on Owner</a> again.';
    membersSection.classList.add("hidden");
    return;
  }
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

refreshBtn.addEventListener("click", async () => {
  try {
    await loadMembers();
  } catch (e) {
    statusEl.textContent = e.message || "Could not load customers.";
  }
});

async function init() {
  const pwd = getAdminPassword();
  if (!pwd) {
    window.location.replace("/owner.html");
    return;
  }

  try {
    await auth(pwd);
  } catch {
    sessionStorage.removeItem("admin_password");
    window.location.replace("/owner.html");
    return;
  }

  membersSection.classList.remove("hidden");
  try {
    await loadMembers();
  } catch (e) {
    statusEl.textContent = e.message || "Could not load customers.";
  }
}

applyTheme(localStorage.getItem(THEME_KEY) || "light");
init();
