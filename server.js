require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const QRCode = require("qrcode");
const { PKPass } = require("passkit-generator");

const app = express();
const START_PORT = Number(process.env.PORT || 3000);
let CURRENT_PORT = START_PORT;

function getBaseUrl() {
  return process.env.BASE_URL || `http://localhost:${CURRENT_PORT}`;
}

function resolveBaseUrl(req) {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL.replace(/\/$/, "");
  }
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${protocol}://${host}`;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const dbPath = process.env.VERCEL
  ? path.join("/tmp", "passes.db")
  : path.join(__dirname, "passes.db");
const db = new sqlite3.Database(dbPath);

const APPLE_WALLET_CONFIG = {
  passTypeIdentifier: process.env.APPLE_PASS_TYPE_IDENTIFIER,
  teamIdentifier: process.env.APPLE_TEAM_IDENTIFIER,
  organizationName: process.env.APPLE_ORGANIZATION_NAME || "Digital Pass Wallet",
  wwdrPath: process.env.APPLE_WWDR_PATH,
  signerCertPath: process.env.APPLE_SIGNER_CERT_PATH,
  signerKeyPath: process.env.APPLE_SIGNER_KEY_PATH,
  signerKeyPassphrase: process.env.APPLE_SIGNER_KEY_PASSPHRASE || ""
};

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      memberId TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS loyalty_members (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      last_checkin_date TEXT,
      createdAt TEXT NOT NULL
    )
  `);
});

function generateUniqueId() {
  return `pass_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateLoyaltyId() {
  return `loy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePhone(input) {
  let digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits;
}

function formatPhoneDisplay(digits) {
  if (digits && digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits || "";
}

function localCalendarDate() {
  return new Date().toLocaleDateString("en-CA");
}

const _pts = Number.parseInt(process.env.LOYALTY_POINTS_PER_CHECKIN || "1", 10);
const POINTS_PER_CHECKIN =
  Number.isFinite(_pts) && _pts > 0 ? _pts : 1;

const _goal = Number.parseInt(process.env.LOYALTY_POINTS_GOAL || "10", 10);
const LOYALTY_POINTS_GOAL =
  Number.isFinite(_goal) && _goal > 0 ? _goal : 10;

const LOYALTY_RULE_TEXT =
  process.env.LOYALTY_RULE_TEXT || "Earn 1 point for every £3 spent";
const LOYALTY_REWARD_TEXT =
  process.env.LOYALTY_REWARD_TEXT ||
  `Get £5 off when you reach ${LOYALTY_POINTS_GOAL} points`;

function isAppleWalletConfigured() {
  return Boolean(
    APPLE_WALLET_CONFIG.passTypeIdentifier &&
      APPLE_WALLET_CONFIG.teamIdentifier &&
      APPLE_WALLET_CONFIG.wwdrPath &&
      APPLE_WALLET_CONFIG.signerCertPath &&
      APPLE_WALLET_CONFIG.signerKeyPath
  );
}

function getCertificates() {
  return {
    wwdr: fs.readFileSync(APPLE_WALLET_CONFIG.wwdrPath),
    signerCert: fs.readFileSync(APPLE_WALLET_CONFIG.signerCertPath),
    signerKey: fs.readFileSync(APPLE_WALLET_CONFIG.signerKeyPath),
    signerKeyPassphrase: APPLE_WALLET_CONFIG.signerKeyPassphrase
  };
}

function makePngFromBase64(base64) {
  return Buffer.from(base64, "base64");
}

const iconPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAACkAAAApCAYAAACoYAD2AAAAKUlEQVR4nO3NAQ0AAAgDIN8/9K3hHFQgCjJpaoFAIBAIBAKBQCAQCAT+QwE+3QHf7N8h8QAAAABJRU5ErkJggg==";

async function buildPkPass(user, baseUrl) {
  const pass = await PKPass.from(
    {
      model: {
        "pass.json": Buffer.from(
          JSON.stringify({
            formatVersion: 1,
            passTypeIdentifier: APPLE_WALLET_CONFIG.passTypeIdentifier,
            serialNumber: user.id,
            teamIdentifier: APPLE_WALLET_CONFIG.teamIdentifier,
            organizationName: APPLE_WALLET_CONFIG.organizationName,
            description: "Digital membership pass",
            logoText: "Digital Pass",
            foregroundColor: "rgb(255,255,255)",
            backgroundColor: "rgb(17,24,39)",
            labelColor: "rgb(209,213,219)",
            generic: {
              primaryFields: [
                {
                  key: "memberName",
                  label: "Member",
                  value: user.name
                }
              ],
              secondaryFields: [
                {
                  key: "memberId",
                  label: "ID",
                  value: user.memberId
                }
              ]
            }
          })
        ),
        "icon.png": makePngFromBase64(iconPngBase64),
        "icon@2x.png": makePngFromBase64(iconPngBase64),
        "logo.png": makePngFromBase64(iconPngBase64),
        "logo@2x.png": makePngFromBase64(iconPngBase64)
      },
      certificates: getCertificates()
    },
    {
      serialNumber: user.id,
      authenticationToken: `token-${user.id}`,
      webServiceURL: `${baseUrl}/api/wallet`,
      description: "Digital membership pass"
    }
  );

  pass.setBarcodes({
    message: `${baseUrl}/pass/${user.id}`,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1",
    altText: user.memberId
  });

  return pass.getAsBuffer();
}

async function buildLoyaltyPkPass(member, baseUrl) {
  const cardUrl = `${baseUrl}/loyalty/card/${member.id}`;
  const orgName =
    process.env.APPLE_ORGANIZATION_NAME || "Smoke n Bubbles";

  const pass = await PKPass.from(
    {
      model: {
        "pass.json": Buffer.from(
          JSON.stringify({
            formatVersion: 1,
            passTypeIdentifier: APPLE_WALLET_CONFIG.passTypeIdentifier,
            serialNumber: member.id,
            teamIdentifier: APPLE_WALLET_CONFIG.teamIdentifier,
            organizationName: orgName,
            description: "Smoke n Bubbles Loyalty",
            logoText: "Smoke n Bubbles",
            foregroundColor: "rgb(255,255,255)",
            backgroundColor: "rgb(0,0,0)",
            labelColor: "rgb(94, 234, 212)",
            storeCard: {
              headerFields: [],
              primaryFields: [
                {
                  key: "points",
                  label: "Points",
                  value: `${member.points} / ${LOYALTY_POINTS_GOAL}`
                }
              ],
              secondaryFields: [
                {
                  key: "name",
                  label: "Member",
                  value: member.name
                }
              ],
              auxiliaryFields: [
                {
                  key: "phone",
                  label: "Phone",
                  value: formatPhoneDisplay(member.phone)
                }
              ],
              backFields: [
                {
                  key: "rule",
                  label: "How it works",
                  value: LOYALTY_RULE_TEXT
                },
                {
                  key: "reward",
                  label: "Reward",
                  value: LOYALTY_REWARD_TEXT
                }
              ]
            }
          })
        ),
        "icon.png": makePngFromBase64(iconPngBase64),
        "icon@2x.png": makePngFromBase64(iconPngBase64),
        "logo.png": makePngFromBase64(iconPngBase64),
        "logo@2x.png": makePngFromBase64(iconPngBase64)
      },
      certificates: getCertificates()
    },
    {
      serialNumber: member.id,
      authenticationToken: `loy-${member.id}`,
      webServiceURL: `${baseUrl}/api/wallet`,
      description: "Smoke n Bubbles Loyalty"
    }
  );

  pass.setBarcodes({
    message: cardUrl,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1",
    altText: String(member.points)
  });

  return pass.getAsBuffer();
}

function loyaltyMetaPayload() {
  return {
    pointsGoal: LOYALTY_POINTS_GOAL,
    pointsRuleText: LOYALTY_RULE_TEXT,
    rewardText: LOYALTY_REWARD_TEXT
  };
}

app.post("/api/users", async (req, res) => {
  try {
    const { name, memberId } = req.body;

    if (!name || !memberId) {
      return res.status(400).json({ error: "Name and ID are required." });
    }

    const id = generateUniqueId();
    const createdAt = new Date().toISOString();
    const baseUrl = resolveBaseUrl(req);
    const passUrl = `${baseUrl}/pass/${id}`;

    db.run(
      "INSERT INTO users (id, name, memberId, createdAt) VALUES (?, ?, ?, ?)",
      [id, name.trim(), memberId.trim(), createdAt],
      async (err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to create pass." });
        }

        const qrDataUrl = await QRCode.toDataURL(passUrl, {
          width: 320,
          margin: 2
        });

        res.status(201).json({
          id,
          name: name.trim(),
          memberId: memberId.trim(),
          passUrl,
          qrDataUrl,
          appleWalletUrl: `${baseUrl}/api/passkit/${id}`
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: "Unexpected server error." });
  }
});

app.get("/api/users/:id", async (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM users WHERE id = ?", [id], async (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error." });
    }

    if (!row) {
      return res.status(404).json({ error: "Pass not found." });
    }

    const baseUrl = resolveBaseUrl(req);
    const passUrl = `${baseUrl}/pass/${row.id}`;
    const qrDataUrl = await QRCode.toDataURL(passUrl, { width: 280, margin: 2 });

    res.json({
      id: row.id,
      name: row.name,
      memberId: row.memberId,
      createdAt: row.createdAt,
      passUrl,
      qrDataUrl,
      appleWalletUrl: `${baseUrl}/api/passkit/${row.id}`
    });
  });
});

app.get("/api/passkit/:id", async (req, res) => {
  if (!isAppleWalletConfigured()) {
    return res.status(503).json({
      error:
        "Apple Wallet is not configured. Set APPLE_PASS_TYPE_IDENTIFIER, APPLE_TEAM_IDENTIFIER, APPLE_WWDR_PATH, APPLE_SIGNER_CERT_PATH, and APPLE_SIGNER_KEY_PATH."
    });
  }

  const { id } = req.params;

  db.get("SELECT * FROM users WHERE id = ?", [id], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: "Database error." });
    }

    if (!user) {
      return res.status(404).json({ error: "Pass not found." });
    }

    try {
      const baseUrl = resolveBaseUrl(req);
      const passBuffer = await buildPkPass(user, baseUrl);
      res.setHeader("Content-Type", "application/vnd.apple.pkpass");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${user.id}.pkpass"`
      );
      res.send(passBuffer);
    } catch (error) {
      res.status(500).json({
        error:
          "Could not generate Apple Wallet pass. Check cert files and pass identifiers."
      });
    }
  });
});

app.post("/api/loyalty/register", async (req, res) => {
  try {
    const { phone, name } = req.body;
    const normalized = normalizePhone(phone);
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Name is required." });
    }
    if (normalized.length < 10) {
      return res.status(400).json({
        error: "Enter a valid phone number (at least 10 digits)."
      });
    }

    const baseUrl = resolveBaseUrl(req);

    db.get(
      "SELECT * FROM loyalty_members WHERE phone = ?",
      [normalized],
      async (err, row) => {
        if (err) {
          return res.status(500).json({ error: "Database error." });
        }

        if (row) {
          const cardUrl = `${baseUrl}/loyalty/card/${row.id}`;
          const qrDataUrl = await QRCode.toDataURL(cardUrl, {
            width: 320,
            margin: 2
          });
          return res.json({
            id: row.id,
            phone: row.phone,
            phoneDisplay: formatPhoneDisplay(row.phone),
            name: row.name,
            points: row.points,
            lastCheckinDate: row.last_checkin_date,
            cardUrl,
            qrDataUrl,
            returning: true,
            appleWalletLoyaltyUrl: `${baseUrl}/api/passkit/loyalty/${row.id}`,
            ...loyaltyMetaPayload()
          });
        }

        const id = generateLoyaltyId();
        const createdAt = new Date().toISOString();

        db.run(
          "INSERT INTO loyalty_members (id, phone, name, points, last_checkin_date, createdAt) VALUES (?, ?, ?, 0, NULL, ?)",
          [id, normalized, String(name).trim(), createdAt],
          async (insertErr) => {
            if (insertErr) {
              return res.status(500).json({ error: "Could not register member." });
            }

            const cardUrl = `${baseUrl}/loyalty/card/${id}`;
            const qrDataUrl = await QRCode.toDataURL(cardUrl, {
              width: 320,
              margin: 2
            });

            res.status(201).json({
              id,
              phone: normalized,
              phoneDisplay: formatPhoneDisplay(normalized),
              name: String(name).trim(),
              points: 0,
              lastCheckinDate: null,
              cardUrl,
              qrDataUrl,
              returning: false,
              appleWalletLoyaltyUrl: `${baseUrl}/api/passkit/loyalty/${id}`,
              ...loyaltyMetaPayload()
            });
          }
        );
      }
    );
  } catch (_e) {
    res.status(500).json({ error: "Unexpected server error." });
  }
});

app.get("/api/loyalty/member/:id", async (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM loyalty_members WHERE id = ?", [id], async (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error." });
    }
    if (!row) {
      return res.status(404).json({ error: "Member not found." });
    }

    const baseUrl = resolveBaseUrl(req);
    const cardUrl = `${baseUrl}/loyalty/card/${row.id}`;
    const qrDataUrl = await QRCode.toDataURL(cardUrl, { width: 280, margin: 2 });

    res.json({
      id: row.id,
      phone: row.phone,
      phoneDisplay: formatPhoneDisplay(row.phone),
      name: row.name,
      points: row.points,
      lastCheckinDate: row.last_checkin_date,
      cardUrl,
      qrDataUrl,
      appleWalletLoyaltyUrl: `${baseUrl}/api/passkit/loyalty/${row.id}`,
      ...loyaltyMetaPayload()
    });
  });
});

app.get("/api/passkit/loyalty/:id", async (req, res) => {
  if (!isAppleWalletConfigured()) {
    return res.status(503).json({
      error:
        "Apple Wallet is not configured. Set APPLE_PASS_TYPE_IDENTIFIER, APPLE_TEAM_IDENTIFIER, APPLE_WWDR_PATH, APPLE_SIGNER_CERT_PATH, and APPLE_SIGNER_KEY_PATH."
    });
  }

  const { id } = req.params;

  db.get(
    "SELECT * FROM loyalty_members WHERE id = ?",
    [id],
    async (err, member) => {
      if (err) {
        return res.status(500).json({ error: "Database error." });
      }
      if (!member) {
        return res.status(404).json({ error: "Loyalty member not found." });
      }

      try {
        const baseUrl = resolveBaseUrl(req);
        const passBuffer = await buildLoyaltyPkPass(member, baseUrl);
        res.setHeader("Content-Type", "application/vnd.apple.pkpass");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="smoke-n-bubbles-loyalty-${member.id}.pkpass"`
        );
        res.send(passBuffer);
      } catch (_e) {
        res.status(500).json({
          error:
            "Could not generate Apple Wallet pass. Check certificates and Pass Type ID."
        });
      }
    }
  );
});

app.post("/api/loyalty/checkin", (req, res) => {
  const { memberId } = req.body;
  if (!memberId || typeof memberId !== "string") {
    return res.status(400).json({ error: "memberId is required." });
  }

  const today = localCalendarDate();

  db.get(
    "SELECT * FROM loyalty_members WHERE id = ?",
    [memberId],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: "Database error." });
      }
      if (!row) {
        return res.status(404).json({ error: "Member not found." });
      }
      if (row.last_checkin_date === today) {
        return res.status(409).json({
          error: "Already checked in today.",
          name: row.name,
          points: row.points,
          lastCheckinDate: row.last_checkin_date
        });
      }

      db.run(
        "UPDATE loyalty_members SET points = points + ?, last_checkin_date = ? WHERE id = ? AND (last_checkin_date IS NULL OR last_checkin_date != ?)",
        [POINTS_PER_CHECKIN, today, memberId, today],
        function (updateErr) {
          if (updateErr) {
            return res.status(500).json({ error: "Could not update points." });
          }
          if (this.changes === 0) {
            return res.status(409).json({
              error: "Already checked in today.",
              name: row.name,
              points: row.points,
              lastCheckinDate: row.last_checkin_date
            });
          }

          db.get(
            "SELECT * FROM loyalty_members WHERE id = ?",
            [memberId],
            (readErr, updated) => {
              if (readErr || !updated) {
                return res.status(500).json({ error: "Could not read member." });
              }
              res.json({
                ok: true,
                name: updated.name,
                points: updated.points,
                lastCheckinDate: updated.last_checkin_date,
                message: `+${POINTS_PER_CHECKIN} point${POINTS_PER_CHECKIN === 1 ? "" : "s"}`
              });
            }
          );
        }
      );
    }
  );
});

app.get("/api/loyalty/wallet-preview/:id", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM loyalty_members WHERE id = ?", [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error." });
    }
    if (!row) {
      return res.status(404).json({ error: "Member not found." });
    }

    const baseUrl = resolveBaseUrl(req);
    res.json({
      integration: "apple-wallet-pass",
      status: "preview_only",
      note:
        "Use this payload when wiring a signed .pkpass (passkit-generator or Apple tools). Pass signing still requires Apple certificates.",
      passKind: "storeCard",
      serialNumber: row.id,
      member: {
        id: row.id,
        name: row.name,
        phone: row.phone,
        points: row.points
      },
      suggestedBarcode: {
        format: "PKBarcodeFormatQR",
        message: `${baseUrl}/loyalty/card/${row.id}`
      },
      suggestedPrimaryFields: [
        { key: "balance", label: "Points", value: String(row.points) }
      ],
      suggestedSecondaryFields: [
        { key: "name", label: "Member", value: row.name },
        {
          key: "phone",
          label: "Phone",
          value: formatPhoneDisplay(row.phone)
        }
      ],
      appleWalletPkpassUrl: `${baseUrl}/api/passkit/loyalty/${row.id}`
    });
  });
});

app.get("/loyalty/card/:id", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "loyalty-card.html"));
});

app.get("/pass/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "pass.html"));
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

function startServer(port) {
  CURRENT_PORT = port;
  const server = app
    .listen(port, () => {
      console.log(`Server running at ${getBaseUrl()}`);
    })
    .on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        const nextPort = port + 1;
        console.warn(`Port ${port} in use. Retrying on ${nextPort}...`);
        startServer(nextPort);
      } else {
        throw error;
      }
    });

  return server;
}

if (require.main === module) {
  startServer(START_PORT);
}

module.exports = app;
