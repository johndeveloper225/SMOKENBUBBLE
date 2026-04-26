function getMemberIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("card");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return parts[parts.length - 1] || "";
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

function pointsCacheKey(phone) {
  return `loyalty_points_${phone || "unknown"}`;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
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
  const queryPoints = Number.parseInt(getQueryParam("points") || "0", 10);
  const showOwnerQr = getQueryParam("showqr") === "1";
  const pointsCurrent = document.getElementById("pointsCurrent");
  const pointsGoal = document.getElementById("pointsGoal");
  const ruleLine = document.getElementById("ruleLine");
  const rewardLine = document.getElementById("rewardLine");
  const cardName = document.getElementById("cardName");
  const cardPhone = document.getElementById("cardPhone");
  const cardQr = document.getElementById("cardQr");
  const ownerQrSection = document.getElementById("ownerQrSection");
  const ownerQrHint = document.getElementById("ownerQrHint");
  const cardStatus = document.getElementById("cardStatus");
  const appleWalletBtn = document.getElementById("appleWalletBtn");
  const googleWalletBtn = document.getElementById("googleWalletBtn");

  if (showOwnerQr) {
    ownerQrSection.classList.remove("hidden");
    ownerQrHint.classList.remove("hidden");
  } else {
    ownerQrSection.classList.add("hidden");
    ownerQrHint.classList.add("hidden");
  }

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

    if (data.phone) {
      localStorage.setItem(pointsCacheKey(data.phone), String(data.points ?? 0));
    }

    cardName.textContent = data.name;
    cardPhone.textContent = data.phoneDisplay || data.phone || "";
    if (showOwnerQr) {
      cardQr.src = data.qrDataUrl;
    }
    cardStatus.textContent = "";

    const memberId = data.id || id;
    const phone = encodeURIComponent(data.phone || queryPhone || "");
    const name = encodeURIComponent(data.name || queryName || "Member");
    const successBase = `/wallet-success.html?memberId=${encodeURIComponent(
      memberId
    )}&phone=${phone}&name=${name}`;

    if (isIOS() && data.appleWalletLoyaltyUrl && data.appleWalletEnabled) {
      const next = encodeURIComponent(data.appleWalletLoyaltyUrl);
      appleWalletBtn.href = `${successBase}&wallet=apple&next=${next}`;
      appleWalletBtn.classList.remove("hidden");
    } else {
      appleWalletBtn.classList.add("hidden");
    }

    if (isAndroid()) {
      googleWalletBtn.href = `${successBase}&wallet=google`;
      googleWalletBtn.classList.remove("hidden");
    } else {
      googleWalletBtn.classList.add("hidden");
    }
  } catch (e) {
    const cachedPoints = Number.parseInt(
      localStorage.getItem(pointsCacheKey(queryPhone)) || `${queryPoints || 0}`,
      10
    );
    pointsCurrent.textContent = Number.isFinite(cachedPoints)
      ? String(Math.max(0, cachedPoints))
      : "0";
    pointsGoal.textContent = "10";
    cardName.textContent = "";
    cardPhone.textContent = "";
    cardStatus.textContent = e.message || "Could not load card.";
    appleWalletBtn.classList.add("hidden");
    googleWalletBtn.classList.add("hidden");
  }
}

loadCard();
