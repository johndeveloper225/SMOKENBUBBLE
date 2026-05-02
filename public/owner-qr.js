const joinQrImage = document.getElementById("joinQrImage");
const joinUrl = document.getElementById("joinUrl");
const qrLoadStatus = document.getElementById("qrLoadStatus");
const signOut = document.getElementById("ownerQrSignOut");
const ownerRuleLine = document.getElementById("ownerRuleLine");
const ownerRewardLine = document.getElementById("ownerRewardLine");

if (!sessionStorage.getItem("admin_password")) {
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

loadLoyaltyCopy();
loadJoinQr();
