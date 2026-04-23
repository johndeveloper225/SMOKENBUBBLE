function getMemberIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("card");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return parts[parts.length - 1] || "";
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

async function registerFromPhone(phone, name) {
  const response = await fetch("/api/loyalty/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, name: name || "Member" })
  });
  if (!response.ok) throw new Error("Card not found.");
  return response.json();
}

async function loadCard() {
  const id = getMemberIdFromPath();
  const queryPhone = getQueryParam("phone");
  const queryName = getQueryParam("name");
  const pointsCurrent = document.getElementById("pointsCurrent");
  const pointsGoal = document.getElementById("pointsGoal");
  const ruleLine = document.getElementById("ruleLine");
  const rewardLine = document.getElementById("rewardLine");
  const cardName = document.getElementById("cardName");
  const cardPhone = document.getElementById("cardPhone");
  const cardQr = document.getElementById("cardQr");
  const cardStatus = document.getElementById("cardStatus");
  const appleWalletBtn = document.getElementById("appleWalletBtn");

  if (!id && !queryPhone) {
    cardStatus.textContent = "Invalid card link.";
    return;
  }

  try {
    let data = null;

    if (id) {
      const response = await fetch(`/api/loyalty/member/${encodeURIComponent(id)}`);
      if (response.ok) {
        data = await response.json();
      }
    }

    // Vercel serverless can lose transient records; recover via phone if provided.
    if (!data && queryPhone) {
      data = await registerFromPhone(queryPhone, queryName);
    }

    if (!data) throw new Error("Card not found.");
    const goal = Number(data.pointsGoal) > 0 ? Number(data.pointsGoal) : 10;

    pointsCurrent.textContent = String(data.points ?? 0);
    pointsGoal.textContent = String(goal);
    if (data.pointsRuleText) ruleLine.textContent = data.pointsRuleText;
    if (data.rewardText) rewardLine.textContent = data.rewardText;

    cardName.textContent = data.name;
    cardPhone.textContent = data.phoneDisplay || data.phone || "";
    cardQr.src = data.qrDataUrl;
    cardStatus.textContent = "";

    if (data.appleWalletLoyaltyUrl && data.appleWalletEnabled) {
      appleWalletBtn.href = data.appleWalletLoyaltyUrl;
      appleWalletBtn.classList.remove("hidden");
    } else {
      appleWalletBtn.classList.add("hidden");
    }
  } catch (e) {
    pointsCurrent.textContent = "—";
    pointsGoal.textContent = "—";
    cardName.textContent = "";
    cardPhone.textContent = "";
    cardStatus.textContent = e.message || "Could not load card.";
    appleWalletBtn.classList.add("hidden");
  }
}

loadCard();
