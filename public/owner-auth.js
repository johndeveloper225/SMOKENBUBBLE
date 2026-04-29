const form = document.getElementById("ownerAccessForm");
const passwordInput = document.getElementById("ownerPassword");
const showPassword = document.getElementById("showOwnerPassword");
const statusEl = document.getElementById("ownerStatus");
const themeToggleBtn = document.getElementById("themeToggleBtn");

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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = (passwordInput.value || "").trim();
  if (!password) {
    statusEl.textContent = "Enter admin password.";
    return;
  }
  statusEl.textContent = "Signing in...";
  try {
    const response = await fetch("/api/admin/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password
      },
      body: JSON.stringify({ password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Sign in failed.");
    }
    sessionStorage.setItem("admin_password", password);
    window.location.href = "/admin-members.html";
  } catch (e) {
    statusEl.textContent = e.message || "Sign in failed.";
  }
});

applyTheme(localStorage.getItem(THEME_KEY) || "light");
