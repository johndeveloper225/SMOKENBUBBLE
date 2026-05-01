const form = document.getElementById("loyaltyForm");

function buildPointsCongrats(points, goal) {
  const safePoints = Number.isFinite(Number(points)) ? Number(points) : 0;
  const safeGoal = Number.isFinite(Number(goal)) && Number(goal) > 0 ? Number(goal) : 10;
  if (safePoints <= 0) return "Card ready. Points are added only at checkout by staff.";
  if (safePoints >= safeGoal) {
    return `Congratulations! You reached ${safePoints}/${safeGoal} and unlocked your reward.`;
  }
  if (safePoints === 1) return "You have 1 point.";
  return `You currently have ${safePoints}/${safeGoal} points.`;
}

if (form) {
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = "Check out";
  const result = document.getElementById("result");
  const qrImage = document.getElementById("qrImage");
  const openCard = document.getElementById("openCard");
  const resultPoints = document.getElementById("resultPoints");
  const welcomeBack = document.getElementById("welcomeBack");
  const pointsCongrats = document.getElementById("pointsCongrats");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const phone = document.getElementById("phone").value.trim();
    const name = document.getElementById("name").value.trim();

    if (!phone || !name) return;

    try {
      const response = await fetch("/api/loyalty/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Could not register.");
      }

      const data = await response.json();

      if (qrImage && data.qrDataUrl) qrImage.src = data.qrDataUrl;
      openCard.href = data.cardUrl;
      const goal = Number(data.pointsGoal) > 0 ? Number(data.pointsGoal) : 10;
      resultPoints.textContent = `${data.points ?? 0} / ${goal}`;
      if (pointsCongrats) {
        pointsCongrats.textContent = buildPointsCongrats(Number(data.points ?? 0), goal);
      }

      if (data.returning) {
        welcomeBack.textContent =
          "Welcome back — same phone, your points are below.";
        welcomeBack.classList.remove("hidden");
      } else {
        welcomeBack.classList.add("hidden");
      }

      result.classList.remove("hidden");
      // Checkout should open the digital card immediately.
      const fallbackCardUrl = `/loyalty/card/${encodeURIComponent(
        data.id || ""
      )}?phone=${encodeURIComponent(data.phone || phone)}&name=${encodeURIComponent(
        data.name || name
      )}&points=${encodeURIComponent(String(data.points ?? 0))}`;
      window.location.replace(data.cardUrl || fallbackCardUrl);
    } catch (error) {
      alert(error.message);
    }
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
