const joinQrImage = document.getElementById("joinQrImage");
const joinUrl = document.getElementById("joinUrl");

async function loadJoinQr() {
  try {
    const response = await fetch("/api/public/join-qr");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load join QR.");
    if (data.qrDataUrl) {
      joinQrImage.src = data.qrDataUrl;
    }
    if (data.joinUrl) {
      joinUrl.href = data.joinUrl;
      joinUrl.textContent = data.joinUrl;
    }
  } catch {
    joinQrImage.alt = "Could not load join QR";
  }
}

loadJoinQr();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
