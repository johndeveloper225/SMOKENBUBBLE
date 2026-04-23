function getMemberIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("card");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return parts[parts.length - 1] || "";
}

async function loadCard() {
  const id = getMemberIdFromPath();
  const pointsCurrent = document.getElementById("pointsCurrent");
  const pointsGoal = document.getElementById("pointsGoal");
  const ruleLine = document.getElementById("ruleLine");
  const rewardLine = document.getElementById("rewardLine");
  const cardName = document.getElementById("cardName");
  const cardPhone = document.getElementById("cardPhone");
  const cardQr = document.getElementById("cardQr");
  const cardStatus = document.getElementById("cardStatus");
  const appleWalletBtn = document.getElementById("appleWalletBtn");

  if (!id) {
    cardStatus.textContent = "Invalid card link.";
    return;
  }

  try {
    const response = await fetch(`/api/loyalty/member/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error("Card not found.");

    const data = await response.json();
    const goal = Number(data.pointsGoal) > 0 ? Number(data.pointsGoal) : 10;

    pointsCurrent.textContent = String(data.points ?? 0);
    pointsGoal.textContent = String(goal);
    if (data.pointsRuleText) ruleLine.textContent = data.pointsRuleText;
    if (data.rewardText) rewardLine.textContent = data.rewardText;

    cardName.textContent = data.name;
    cardPhone.textContent = data.phoneDisplay || data.phone || "";
    cardQr.src = data.qrDataUrl;
    cardStatus.textContent = "";

    if (data.appleWalletLoyaltyUrl) {
      appleWalletBtn.href = data.appleWalletLoyaltyUrl;
      appleWalletBtn.classList.remove("hidden");
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
