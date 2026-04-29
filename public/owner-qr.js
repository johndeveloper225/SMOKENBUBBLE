const joinQrImage = document.getElementById("joinQrImage");
const joinUrl = document.getElementById("joinUrl");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const qrLoadStatus = document.getElementById("qrLoadStatus");
const signOut = document.getElementById("ownerQrSignOut");

const THEME_KEY = "owner_theme";

if (!sessionStorage.getItem("admin_password")) {
  window.location.replace("/owner.html");
}

function applyTheme(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", safeTheme);
  localStorage.setItem(THEME_KEY, safeTheme);
  themeToggleBtn.textContent =
    safeTheme === "dark" ? "Light mode" : "Dark mode";
}

themeToggleBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "dark" ? "light" : "dark");
});

signOut.addEventListener("click", () => {
  sessionStorage.removeItem("admin_password");
  window.location.href = "/owner.html";
});

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
      joinUrl.textContent = data.joinUrl;
    }
    qrLoadStatus.textContent = "";
  } catch (err) {
    joinQrImage.alt = "Could not load join QR";
    qrLoadStatus.textContent = err.message || "Could not load QR.";
  }
}

applyTheme(localStorage.getItem(THEME_KEY) || "light");
loadJoinQr();
