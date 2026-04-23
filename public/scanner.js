const startScanBtn = document.getElementById("startScanBtn");
const scanStatus = document.getElementById("scanStatus");
const scanResult = document.getElementById("scanResult");
const scanName = document.getElementById("scanName");
const scanMemberId = document.getElementById("scanMemberId");
const scanLink = document.getElementById("scanLink");

let scanner = null;
let hasScanned = false;

async function fetchPassFromUrl(decodedText) {
  try {
    const url = new URL(decodedText);
    const parts = url.pathname.split("/");
    const id = parts[parts.length - 1];

    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
      throw new Error("User/pass not found.");
    }

    const data = await response.json();

    scanName.textContent = data.name;
    scanMemberId.textContent = data.memberId;
    scanLink.href = data.passUrl;
    scanLink.textContent = data.passUrl;
    scanResult.classList.remove("hidden");
    scanStatus.textContent = "Scan successful.";
  } catch (_error) {
    scanStatus.textContent = "Scanned content is not a valid pass URL.";
  }
}

async function startScanner() {
  if (scanner) {
    return;
  }

  scanner = new Html5Qrcode("reader");
  scanStatus.textContent = "Starting camera...";

  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      async (decodedText) => {
        if (hasScanned) {
          return;
        }
        hasScanned = true;
        await fetchPassFromUrl(decodedText);
        await scanner.stop();
        startScanBtn.disabled = false;
      },
      () => {}
    );

    scanStatus.textContent = "Camera active. Align QR in the frame.";
    startScanBtn.disabled = true;
  } catch (_error) {
    scanStatus.textContent =
      "Could not access camera. Allow camera permissions and try again.";
  }
}

startScanBtn.addEventListener("click", async () => {
  hasScanned = false;
  await startScanner();
});
