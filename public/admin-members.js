const statusEl = document.getElementById("membersStatus");
const membersSection = document.getElementById("membersSection");
const refreshBtn = document.getElementById("refreshMembersBtn");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const selectAllMembers = document.getElementById("selectAllMembers");
const filterAllBtn = document.getElementById("filterAllBtn");
const filterTodayBtn = document.getElementById("filterTodayBtn");
const filterYesterdayBtn = document.getElementById("filterYesterdayBtn");
const membersTbody = document.getElementById("membersTbody");
const themeToggleBtn = document.getElementById("themeToggleBtn");

const THEME_KEY = "owner_theme";
let activeFilter = "all";

function getAdminPassword() {
  return (sessionStorage.getItem("admin_password") || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getTodayLocalDate() {
  return new Date().toLocaleDateString("en-CA");
}

function getYesterdayLocalDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA");
}

function formatCheckinDate(value) {
  if (!value) return "-";
  const dt = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

function formatCheckinTime(_value) {
  // Existing records store date-only check-ins. Time can be added later if persisted server-side.
  return "--";
}

function passesFilter(member) {
  const date = String(member.lastCheckinDate || "");
  if (activeFilter === "today") return date === getTodayLocalDate();
  if (activeFilter === "yesterday") return date === getYesterdayLocalDate();
  return true;
}

function setFilterButtonStates() {
  const map = {
    all: filterAllBtn,
    today: filterTodayBtn,
    yesterday: filterYesterdayBtn
  };
  Object.entries(map).forEach(([key, btn]) => {
    btn.classList.toggle("active-filter", key === activeFilter);
  });
}

function applyTheme(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", safeTheme);
  localStorage.setItem(THEME_KEY, safeTheme);
  themeToggleBtn.textContent = safeTheme === "dark" ? "Light mode" : "Dark mode";
}

function getSelectedMemberIds() {
  return Array.from(
    membersTbody.querySelectorAll(".member-select:checked")
  ).map((el) => el.getAttribute("data-member-id"));
}

function updateBulkDeleteState() {
  const selectedCount = getSelectedMemberIds().filter(Boolean).length;
  deleteSelectedBtn.disabled = selectedCount === 0;
  deleteSelectedBtn.textContent =
    selectedCount > 0 ? `Delete selected (${selectedCount})` : "Delete selected";
}

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
  const password = getAdminPassword();
  if (!password) {
    window.location.replace("/owner.html");
    return;
  }

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
  if (response.status === 401) {
    sessionStorage.removeItem("admin_password");
    statusEl.innerHTML =
      'Session expired or invalid. <a href="/owner.html">Sign in on Owner</a> again.';
    membersSection.classList.add("hidden");
    return;
  }
  if (!response.ok) throw new Error(data.error || "Could not load customers.");

  const members = (Array.isArray(data.members) ? data.members : []).filter(passesFilter);
  if (!members.length) {
    if (activeFilter === "today") {
      statusEl.textContent = "No customers scanned today yet.";
    } else if (activeFilter === "yesterday") {
      statusEl.textContent = "No customers scanned yesterday.";
    } else {
      statusEl.textContent = "No customers found yet.";
    }
    return;
  }

  members.forEach((member) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="admin-members-cell" style="padding: 6px">
        <input
          type="checkbox"
          class="member-select"
          data-member-id="${escapeHtml(member.id)}"
          aria-label="Select customer ${escapeHtml(member.name || member.phoneDisplay || member.phone || member.id)}"
        />
      </td>
      <td class="admin-members-cell" style="padding: 6px">${escapeHtml(member.name || "")}</td>
      <td class="admin-members-cell" style="padding: 6px">${escapeHtml(member.phoneDisplay || member.phone || "")}</td>
      <td class="admin-members-cell" style="padding: 6px">${String(member.points ?? 0)}</td>
      <td class="admin-members-cell" style="padding: 6px">${escapeHtml(formatCheckinDate(member.lastCheckinDate))}</td>
      <td class="admin-members-cell" style="padding: 6px">${escapeHtml(formatCheckinTime(member.lastCheckinDate))}</td>
      <td class="admin-members-cell" style="padding: 6px">
        <button
          type="button"
          class="btn-link secondary delete-member-btn admin-delete-btn"
          data-member-id="${escapeHtml(member.id)}"
        >
          Delete
        </button>
      </td>
    `;
    membersTbody.appendChild(row);
  });

  selectAllMembers.checked = false;
  updateBulkDeleteState();
  statusEl.textContent = `Loaded ${members.length} customer(s).`;
}

async function deleteMember(memberId) {
  const password = getAdminPassword();
  if (!password) {
    window.location.replace("/owner.html");
    return;
  }

  const response = await fetch(`/api/admin/loyalty/member/${encodeURIComponent(memberId)}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password
    },
    body: JSON.stringify({ password })
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    sessionStorage.removeItem("admin_password");
    throw new Error("Session expired. Sign in again.");
  }
  if (!response.ok) {
    throw new Error(data.error || "Could not delete customer.");
  }
}

refreshBtn.addEventListener("click", async () => {
  try {
    await loadMembers();
  } catch (e) {
    statusEl.textContent = e.message || "Could not load customers.";
  }
});

membersTbody.addEventListener("click", async (event) => {
  const button = event.target.closest(".delete-member-btn");
  if (!button) return;

  const memberId = button.getAttribute("data-member-id");
  if (!memberId) return;

  const confirmed = window.confirm("Delete this customer permanently?");
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Deleting...";

  try {
    await deleteMember(memberId);
    statusEl.textContent = "Customer deleted.";
    await loadMembers();
  } catch (e) {
    statusEl.textContent = e.message || "Could not delete customer.";
    button.disabled = false;
    button.textContent = "Delete";
  }
});

membersTbody.addEventListener("change", (event) => {
  if (event.target.classList.contains("member-select")) {
    const all = membersTbody.querySelectorAll(".member-select");
    const checked = membersTbody.querySelectorAll(".member-select:checked");
    selectAllMembers.checked = all.length > 0 && all.length === checked.length;
    updateBulkDeleteState();
  }
});

selectAllMembers.addEventListener("change", () => {
  const checked = selectAllMembers.checked;
  membersTbody.querySelectorAll(".member-select").forEach((box) => {
    box.checked = checked;
  });
  updateBulkDeleteState();
});

filterAllBtn.addEventListener("click", async () => {
  activeFilter = "all";
  setFilterButtonStates();
  await loadMembers();
});

filterTodayBtn.addEventListener("click", async () => {
  activeFilter = "today";
  setFilterButtonStates();
  await loadMembers();
});

filterYesterdayBtn.addEventListener("click", async () => {
  activeFilter = "yesterday";
  setFilterButtonStates();
  await loadMembers();
});

deleteSelectedBtn.addEventListener("click", async () => {
  const ids = getSelectedMemberIds().filter(Boolean);
  if (!ids.length) return;

  const confirmed = window.confirm(
    `Delete ${ids.length} selected customer(s) permanently?`
  );
  if (!confirmed) return;

  deleteSelectedBtn.disabled = true;
  deleteSelectedBtn.textContent = "Deleting selected...";
  let deleted = 0;
  try {
    for (const id of ids) {
      await deleteMember(id);
      deleted += 1;
    }
    statusEl.textContent = `Deleted ${deleted} customer(s).`;
    await loadMembers();
  } catch (e) {
    statusEl.textContent =
      e.message || `Deleted ${deleted} customer(s), but some failed.`;
    await loadMembers();
  } finally {
    updateBulkDeleteState();
  }
});

async function init() {
  const pwd = getAdminPassword();
  if (!pwd) {
    window.location.replace("/owner.html");
    return;
  }

  try {
    await auth(pwd);
  } catch {
    sessionStorage.removeItem("admin_password");
    window.location.replace("/owner.html");
    return;
  }

  membersSection.classList.remove("hidden");
  try {
    await loadMembers();
  } catch (e) {
    statusEl.textContent = e.message || "Could not load customers.";
  }
}

applyTheme(localStorage.getItem(THEME_KEY) || "light");
deleteSelectedBtn.disabled = true;
setFilterButtonStates();
init();
