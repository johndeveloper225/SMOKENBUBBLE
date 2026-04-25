function getParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

async function awardPoint(memberId, phone, name) {
  let resolvedId = memberId;

  if (!resolvedId && phone) {
    const registerResp = await fetch("/api/loyalty/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, name: name || "Member" })
    });
    if (!registerResp.ok) throw new Error("Could not find loyalty member.");
    const registered = await registerResp.json();
    resolvedId = registered.id;
  }

  if (!resolvedId) return;

  await fetch("/api/loyalty/checkin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memberId: resolvedId })
  }).catch(() => {
    // Success page should still render even if check-in fails.
  });
}

async function init() {
  const memberId = getParam("memberId");
  const phone = getParam("phone");
  const name = getParam("name");
  const wallet = getParam("wallet");
  const next = getParam("next");
  const successMessage = document.getElementById("successMessage");
  const continueWalletLink = document.getElementById("continueWalletLink");

  await awardPoint(memberId, phone, name);

  if (wallet === "google") {
    successMessage.textContent =
      "Congratulations, you just earned 1 point. Get 5 euro off at 10 points. Thank you and you are welcome.";
  }

  if (wallet === "apple" && next) {
    continueWalletLink.href = next;
    continueWalletLink.classList.remove("hidden");
  }
}

init();
