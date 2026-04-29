const adminAccessForm = document.getElementById("adminAccessForm");
const adminPasswordInput = document.getElementById("adminPassword");
const showPassword = document.getElementById("showPassword");
const scannerSection = document.getElementById("scannerSection");
const startScanBtn = document.getElementById("startScanBtn");
const scanStatus = document.getElementById("scanStatus");
const checkinResult = document.getElementById("checkinResult");
const rName = document.getElementById("rName");
const rPoints = document.getElementById("rPoints");
const rMessage = document.getElementById("rMessage");
const adminCardLink = document.getElementById("adminCardLink");

let scanner = null;
let handled = false;
let isAdminUnlocked = false;

showPassword.addEventListener("change", () => {
  adminPasswordInput.type = showPassword.checked ? "text" : "password";
});

async function unlockAdmin() {
  const adminPassword = (adminPasswordInput?.value || "").trim();
  if (!adminPassword) {
    scanStatus.textContent = "Enter admin password.";
    return;
  }
  scanStatus.textContent = "Signing in...";
  const response = await fetch("/api/admin/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": adminPassword
    },
    body: JSON.stringify({ password: adminPassword })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Sign in failed.");
  }
  isAdminUnlocked = true;
  scannerSection.classList.remove("hidden");
  scanStatus.textContent = "Signed in. Tap Start scanner.";
  sessionStorage.setItem("admin_password", adminPassword);
}

adminAccessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await unlockAdmin();
  } catch (e) {
    scanStatus.textContent = e.message || "Sign in failed.";
  }
});

function extractLoyaltyMemberId(decodedText) {
  try {
    const url = new URL(decodedText);
    const phone = url.searchParams.get("phone") || "";
    const name = url.searchParams.get("name") || "Member";
    const match = url.pathname.match(/\/loyalty\/card\/([^/]+)/);
    if (match) return { memberId: match[1], phone, name };
    if (url.pathname.includes("/loyalty/card")) {
      return {
        memberId: "",
        phone,
        name
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function checkIn(memberId, phone, name) {
  const adminPassword = (adminPasswordInput?.value || "").trim();
  if (!adminPassword) {
    throw new Error("Admin password is required.");
  }
  const response = await fetch("/api/loyalty/checkin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": adminPassword
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

async function ensureMemberByPhone(phone, name) {
  const response = await fetch("/api/loyalty/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, name: name || "Member" })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not resolve member.");
  return data;
}

async function processMember(member) {
  try {
    let memberId = member.memberId;
    if (!memberId && member.phone) {
      const resolved = await ensureMemberByPhone(member.phone, member.name);
      memberId = resolved.id;
    }
    if (!memberId) throw new Error("Could not resolve member from QR.");

    scanStatus.textContent = "Checking in…";
    const data = await checkIn(memberId, member.phone, member.name);
    rName.textContent = data.name;
    rPoints.textContent = String(data.points);
    rMessage.textContent = data.message || "";
    if (memberId) {
      adminCardLink.href = `/admin/card/${encodeURIComponent(memberId)}`;
      adminCardLink.classList.remove("hidden");
    } else {
      adminCardLink.classList.add("hidden");
    }
    checkinResult.classList.remove("hidden");
    scanStatus.textContent = "Check-in complete.";
  } catch (e) {
    const p = e.payload || {};
    rName.textContent = p.name || "—";
    rPoints.textContent = p.points != null ? String(p.points) : "—";
    rMessage.textContent = e.message || "Error";
    adminCardLink.classList.add("hidden");
    checkinResult.classList.remove("hidden");
    scanStatus.textContent =
      e.status === 409 ? "Already checked in today." : "Check-in failed.";
  }

  if (scanner) {
    try {
      await scanner.stop();
    } catch {
      /* ignore */
    }
    scanner = null;
  }
  startScanBtn.disabled = false;
}

async function startScanner() {
  if (!isAdminUnlocked) {
    scanStatus.textContent = "Sign in first.";
    return;
  }
  handled = false;
  checkinResult.classList.add("hidden");
  if (scanner) return;

  scanner = new Html5Qrcode("reader");
  scanStatus.textContent = "Starting camera…";

  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      async (decodedText) => {
        if (handled) return;
        const member = extractLoyaltyMemberId(decodedText);
        if (!member) {
          scanStatus.textContent =
            "Not a loyalty card URL. Scan the member’s card QR.";
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

startScanBtn.addEventListener("click", () => {
  startScanner();
});
