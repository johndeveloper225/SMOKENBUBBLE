async function loadPass() {
  const statusMessage = document.getElementById("statusMessage");
  const passName = document.getElementById("passName");
  const passMemberId = document.getElementById("passMemberId");
  const passQr = document.getElementById("passQr");
  const appleWalletBtn = document.getElementById("appleWalletBtn");

  const parts = window.location.pathname.split("/");
  const id = parts[parts.length - 1];

  if (!id) {
    statusMessage.textContent = "Invalid pass ID.";
    return;
  }

  try {
    const response = await fetch(`/api/users/${id}`);

    if (!response.ok) {
      throw new Error("Pass not found.");
    }

    const data = await response.json();
    passName.textContent = data.name;
    passMemberId.textContent = data.memberId;
    passQr.src = data.qrDataUrl;
    appleWalletBtn.href = data.appleWalletUrl;
    appleWalletBtn.classList.remove("hidden");
    statusMessage.textContent = "";
  } catch (error) {
    passName.textContent = "Unavailable";
    passMemberId.textContent = "-";
    statusMessage.textContent = error.message;
    appleWalletBtn.classList.add("hidden");
  }
}

loadPass();
