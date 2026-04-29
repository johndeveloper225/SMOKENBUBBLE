const form = document.getElementById("adminMembersAccessForm");
const passwordInput = document.getElementById("adminMembersPassword");
const showPassword = document.getElementById("showMembersPassword");
const statusEl = document.getElementById("membersStatus");
const adminPanel = document.getElementById("adminPanel");
const scannerSection = document.getElementById("scannerSection");
const checkinResult = document.getElementById("checkinResult");
const scanStatus = document.getElementById("scanStatus");
const startScanBtn = document.getElementById("startScanBtn");
const rName = document.getElementById("rName");
const rPoints = document.getElementById("rPoints");
const rMessage = document.getElementById("rMessage");
const membersSection = document.getElementById("membersSection");
const refreshBtn = document.getElementById("refreshMembersBtn");
const membersTbody = document.getElementById("membersTbody");
const themeToggleBtn = document.getElementById("themeToggleBtn");

let isUnlocked = false;
let scanner = null;
let handled = false;

const THEME_KEY = "owner_theme";

function applyTheme(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", safeTheme);
  localStorage.setItem(THEME_KEY, safeTheme);
  themeToggleBtn.textContent =
    safeTheme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme";
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

function extractLoyaltyMemberId(decodedText) {
  try {
    const url = new URL(decodedText);
    const phone = url.searchParams.get("phone") || "";
    const name = url.searchParams.get("name") || "Member";
    const match = url.pathname.match(/\/loyalty\/card\/([^/]+)/);
    if (match) return { memberId: match[1], phone, name };
    if (url.pathname.includes("/loyalty/card")) {
      return { memberId: "", phone, name };
    }
    return null;
  } catch {
    return null;
  }
}

async function ensureMemberByPhone(phone, name, password) {
  const response = await fetch("/api/loyalty/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password
    },
    body: JSON.stringify({ phone, name: name || "Member" })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not resolve member.");
  return data;
}

async function checkIn(memberId, phone, name, password) {
  const response = await fetch("/api/loyalty/checkin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password
    },
    body: JSON.stringify({ memberId, phone, name })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || "Check-in failed.");
    err.payload = data;
    err.status = response.status;
    throw err;
  }
  return data;
}

async function processMember(member) {
  const password = (passwordInput.value || "").trim();
  try {
    let memberId = member.memberId;
    if (!memberId && member.phone) {
      const resolved = await ensureMemberByPhone(member.phone, member.name, password);
      memberId = resolved.id;
    }
    if (!memberId) throw new Error("Could not resolve member from QR.");

    scanStatus.textContent = "Checking in...";
    const data = await checkIn(memberId, member.phone, member.name, password);
    rName.textContent = data.name;
    rPoints.textContent = String(data.points);
    rMessage.textContent = data.message || "";
    checkinResult.classList.remove("hidden");
    scanStatus.textContent = "Check-in complete.";
    await loadMembers();
  } catch (e) {
    const p = e.payload || {};
    rName.textContent = p.name || "-";
    rPoints.textContent = p.points != null ? String(p.points) : "-";
    rMessage.textContent = e.message || "Error";
    checkinResult.classList.remove("hidden");
    scanStatus.textContent =
      e.status === 409 ? "Already checked in today." : "Check-in failed.";
  }

  if (scanner) {
    try {
      await scanner.stop();
    } catch {
      // ignore stop errors
    }
    scanner = null;
  }
  startScanBtn.disabled = false;
}

async function startScanner() {
  if (!isUnlocked) {
    scanStatus.textContent = "Sign in first.";
    return;
  }
  handled = false;
  checkinResult.classList.add("hidden");
  if (scanner) return;

  scanner = new Html5Qrcode("reader");
  scanStatus.textContent = "Starting camera...";

  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      async (decodedText) => {
        if (handled) return;
        const member = extractLoyaltyMemberId(decodedText);
        if (!member) {
          scanStatus.textContent = "Not a loyalty card URL. Scan the member QR.";
          return;
        }
        handled = true;
        await processMember(member);
      },
      () => {}
    );
    scanStatus.textContent = "Camera on. Scan member QR.";
    startScanBtn.disabled = true;
  } catch {
    scanStatus.textContent =
      "Could not use camera. Allow permissions or use HTTPS on mobile.";
  }
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
    isUnlocked = true;
    sessionStorage.setItem("admin_password", password);
    adminPanel.classList.remove("hidden");
    scannerSection.classList.remove("hidden");
    membersSection.classList.remove("hidden");
    await loadMembers();
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

startScanBtn.addEventListener("click", () => {
  startScanner();
});

const savedPassword = sessionStorage.getItem("admin_password") || "";
if (savedPassword) {
  passwordInput.value = savedPassword;
}

applyTheme(localStorage.getItem(THEME_KEY) || "light");
