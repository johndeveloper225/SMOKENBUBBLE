const joinQrImage = document.getElementById("joinQrImage");
const joinUrl = document.getElementById("joinUrl");
const qrLoadStatus = document.getElementById("qrLoadStatus");
const signOut = document.getElementById("ownerQrSignOut");
const ownerRuleLine = document.getElementById("ownerRuleLine");
const ownerRewardLine = document.getElementById("ownerRewardLine");

const memberScannerReader = document.getElementById("memberScannerReader");
const memberScanStatus = document.getElementById("memberScanStatus");
const memberScanBtn = document.getElementById("memberScanBtn");

let memberScanner = null;
let scanHandled = false;

const adminPassword = sessionStorage.getItem("admin_password");

if (!adminPassword) {
  window.location.replace("/owner.html");
}

signOut.addEventListener("click", () => {
  sessionStorage.removeItem("admin_password");
  window.location.href = "/owner.html";
});

async function loadLoyaltyCopy() {
  try {
    const response = await fetch("/api/public/loyalty-meta");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    const goal = Number(data.pointsGoal) > 0 ? Number(data.pointsGoal) : 10;
    if (data.pointsRuleText) ownerRuleLine.textContent = data.pointsRuleText;
    if (data.rewardText) ownerRewardLine.textContent = data.rewardText;
    else if (data.pointsGoal)
      ownerRewardLine.textContent = `Get £5 off when you reach ${goal} points`;
  } catch {
    // keep defaults in HTML
  }
}

async function loadJoinQr() {
  qrLoadStatus.textContent = "Loading QR…";
  try {
    const response = await fetch("/api/public/join-qr");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load join QR.");
    if (data.qrDataUrl) {
      joinQrImage.src = data.qrDataUrl;
    }
    if (data.joinUrl) {
      joinUrl.href = data.joinUrl;
      joinUrl.textContent = "Open join link";
    }
    qrLoadStatus.textContent = "";
  } catch (err) {
    joinQrImage.alt = "Could not load join QR";
    qrLoadStatus.textContent = err.message || "Could not load QR.";
  }
}

function extractLoyaltyFromQr(decodedText) {
  try {
    const url = new URL(decodedText);
    if (
      url.pathname.includes("/join/start") ||
      url.pathname.includes("/join.html") ||
      url.pathname.endsWith("/join")
    ) {
      return { kind: "join", url };
    }
    const phone = url.searchParams.get("phone") || "";
    const name = url.searchParams.get("name") || "Member";
    const match = url.pathname.match(/\/loyalty\/card\/([^/]+)/);
    if (match) return { kind: "loyalty", memberId: match[1], phone, name };
    return null;
  } catch {
    return null;
  }
}

async function postCheckIn(memberId, phone, name) {
  const password = (sessionStorage.getItem("admin_password") || "").trim();
  const response = await fetch("/api/loyalty/checkin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password
    },
    body: JSON.stringify({ password, memberId, phone, name })
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

async function stopMemberScanner() {
  scanHandled = false;
  if (memberScanner) {
    try {
      await memberScanner.stop();
    } catch {
      /* ignore */
    }
    memberScanner = null;
  }
  memberScanBtn.textContent = "Start camera";
}

async function onDecode(decodedText) {
  if (scanHandled) return;

  const parsed = extractLoyaltyFromQr(decodedText);
  if (!parsed) {
    memberScanStatus.textContent = "Not a loyalty card QR. Scan the customer card.";
    return;
  }
  if (parsed.kind === "join") {
    memberScanStatus.textContent = "That’s the store join QR — scan the customer’s loyalty card instead.";
    return;
  }

  scanHandled = true;
  memberScanStatus.textContent = "Checking in…";

  try {
    await postCheckIn(parsed.memberId, parsed.phone, parsed.name);
    memberScanStatus.textContent = `Checked in: ${parsed.name || "Member"} — points updated.`;
  } catch (e) {
    const p = e.payload || {};
    if (e.status === 409) {
      memberScanStatus.textContent =
        p.error === "Already checked in today."
          ? `${p.name || "Member"} — already checked in today (${p.points ?? ""} pts).`
          : e.message;
    } else {
      memberScanStatus.textContent = e.message || "Check-in failed.";
    }
    scanHandled = false;
  }

  try {
    await memberScanner.stop();
  } catch {
    /* ignore */
  }
  memberScanner = null;
  memberScanBtn.textContent = "Start camera";
}

async function startMemberScanner() {
  if (typeof Html5Qrcode === "undefined") {
    memberScanStatus.textContent = "Scanner library failed to load.";
    return;
  }

  memberScanStatus.textContent = "Starting camera…";
  scanHandled = false;

  memberScanner = new Html5Qrcode("memberScannerReader");

  try {
    await memberScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      async (text) => {
        await onDecode(text);
      },
      () => {}
    );
    memberScanBtn.textContent = "Stop camera";
    memberScanStatus.textContent = "Camera on — scan customer loyalty QR.";
  } catch {
    memberScanStatus.textContent =
      "Could not start camera. Allow permission or use HTTPS on mobile.";
    memberScanner = null;
    memberScanBtn.textContent = "Start camera";
  }
}

memberScanBtn.addEventListener("click", async () => {
  if (memberScanner) {
    await stopMemberScanner();
    memberScanStatus.textContent = "";
    return;
  }
  await startMemberScanner();
});

loadLoyaltyCopy();
loadJoinQr();
