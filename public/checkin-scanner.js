const startScanBtn = document.getElementById("startScanBtn");
const scanStatus = document.getElementById("scanStatus");
const checkinResult = document.getElementById("checkinResult");
const rName = document.getElementById("rName");
const rPoints = document.getElementById("rPoints");
const rMessage = document.getElementById("rMessage");

let scanner = null;
let handled = false;

function extractLoyaltyMemberId(decodedText) {
  try {
    const url = new URL(decodedText);
    const match = url.pathname.match(/\/loyalty\/card\/([^/]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function checkIn(memberId) {
  const response = await fetch("/api/loyalty/checkin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberId })
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

async function processMemberId(memberId) {
  try {
    scanStatus.textContent = "Checking in…";
    const data = await checkIn(memberId);
    rName.textContent = data.name;
    rPoints.textContent = String(data.points);
    rMessage.textContent = data.message || "";
    checkinResult.classList.remove("hidden");
    scanStatus.textContent = "Check-in complete.";
  } catch (e) {
    const p = e.payload || {};
    rName.textContent = p.name || "—";
    rPoints.textContent = p.points != null ? String(p.points) : "—";
    rMessage.textContent = e.message || "Error";
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
        const memberId = extractLoyaltyMemberId(decodedText);
        if (!memberId) {
          scanStatus.textContent =
            "Not a loyalty card URL. Scan the member’s card QR.";
          return;
        }
        handled = true;
        await processMemberId(memberId);
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
