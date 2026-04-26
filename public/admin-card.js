function getMemberIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("card");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return parts[parts.length - 1] || "";
}

const adminAccessForm = document.getElementById("adminAccessForm");
const adminPassword = document.getElementById("adminPassword");
const adminStatus = document.getElementById("adminStatus");
const adminResult = document.getElementById("adminResult");
const adminName = document.getElementById("adminName");
const adminPhone = document.getElementById("adminPhone");
const adminPoints = document.getElementById("adminPoints");
const adminQr = document.getElementById("adminQr");

adminAccessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const memberId = getMemberIdFromPath();
  if (!memberId) {
    adminStatus.textContent = "Invalid card ID.";
    return;
  }

  adminStatus.textContent = "Checking password...";
  adminResult.classList.add("hidden");

  try {
    const response = await fetch(`/api/admin/loyalty/member/${encodeURIComponent(memberId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword.value || "" })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Could not load admin card.");
    }

    adminName.textContent = data.name || "";
    adminPhone.textContent = data.phoneDisplay || data.phone || "";
    adminPoints.textContent = String(data.points ?? 0);
    adminQr.src = data.qrDataUrl || "";
    adminResult.classList.remove("hidden");
    adminStatus.textContent = "";
  } catch (err) {
    adminStatus.textContent = err.message || "Access denied.";
    adminResult.classList.add("hidden");
  }
});
