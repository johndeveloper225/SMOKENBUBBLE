const form = document.getElementById("loyaltyForm");
const result = document.getElementById("result");
const qrImage = document.getElementById("qrImage");
const openCard = document.getElementById("openCard");
const resultPoints = document.getElementById("resultPoints");
const welcomeBack = document.getElementById("welcomeBack");

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

    qrImage.src = data.qrDataUrl;
    openCard.href = data.cardUrl;
    const goal = Number(data.pointsGoal) > 0 ? Number(data.pointsGoal) : 10;
    resultPoints.textContent = `${data.points ?? 0} / ${goal}`;

    if (data.returning) {
      welcomeBack.textContent = "Welcome back — same phone, your points are below.";
      welcomeBack.classList.remove("hidden");
    } else {
      welcomeBack.classList.add("hidden");
    }

    result.classList.remove("hidden");
  } catch (error) {
    alert(error.message);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
