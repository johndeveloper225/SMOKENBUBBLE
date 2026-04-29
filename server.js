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
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const ADMIN_CARD_PASSWORD = (process.env.ADMIN_CARD_PASSWORD || "").trim();

const APPLE_WALLET_CONFIG = {
  passTypeIdentifier: process.env.APPLE_PASS_TYPE_IDENTIFIER,
  teamIdentifier: process.env.APPLE_TEAM_IDENTIFIER,
  organizationName: process.env.APPLE_ORGANIZATION_NAME || "Digital Pass Wallet",
  wwdrPath: process.env.APPLE_WWDR_PATH,
  signerCertPath: process.env.APPLE_SIGNER_CERT_PATH,
  signerKeyPath: process.env.APPLE_SIGNER_KEY_PATH,
  signerKeyPassphrase: process.env.APPLE_SIGNER_KEY_PASSPHRASE || ""
};

function hasInlineAppleCerts() {
  return Boolean(
    process.env.APPLE_WWDR_PEM ||
      process.env.APPLE_WWDR_BASE64 ||
      process.env.APPLE_SIGNER_CERT_PEM ||
      process.env.APPLE_SIGNER_CERT_BASE64 ||
      process.env.APPLE_SIGNER_KEY_PEM ||
      process.env.APPLE_SIGNER_KEY_BASE64
  );
}

function readPemOrBase64(pemValue, b64Value) {
  if (pemValue && pemValue.trim()) {
    return Buffer.from(pemValue, "utf8");
  }
  if (b64Value && b64Value.trim()) {
    return Buffer.from(b64Value, "base64");
  }
  return null;
}

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
  // Normalize common country-code inputs to a stable local key.
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
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
  const hasFilePaths = Boolean(
    APPLE_WALLET_CONFIG.wwdrPath &&
      APPLE_WALLET_CONFIG.signerCertPath &&
      APPLE_WALLET_CONFIG.signerKeyPath
  );
  return Boolean(
    APPLE_WALLET_CONFIG.passTypeIdentifier &&
      APPLE_WALLET_CONFIG.teamIdentifier &&
      (hasFilePaths || hasInlineAppleCerts())
  );
}

function getCertificates() {
  const wwdrInline = readPemOrBase64(
    process.env.APPLE_WWDR_PEM,
    process.env.APPLE_WWDR_BASE64
  );
  const signerCertInline = readPemOrBase64(
    process.env.APPLE_SIGNER_CERT_PEM,
    process.env.APPLE_SIGNER_CERT_BASE64
  );
  const signerKeyInline = readPemOrBase64(
    process.env.APPLE_SIGNER_KEY_PEM,
    process.env.APPLE_SIGNER_KEY_BASE64
  );

  const wwdr =
    wwdrInline ||
    (APPLE_WALLET_CONFIG.wwdrPath
      ? fs.readFileSync(APPLE_WALLET_CONFIG.wwdrPath)
      : null);
  const signerCert =
    signerCertInline ||
    (APPLE_WALLET_CONFIG.signerCertPath
      ? fs.readFileSync(APPLE_WALLET_CONFIG.signerCertPath)
      : null);
  const signerKey =
    signerKeyInline ||
    (APPLE_WALLET_CONFIG.signerKeyPath
      ? fs.readFileSync(APPLE_WALLET_CONFIG.signerKeyPath)
      : null);

  if (!wwdr || !signerCert || !signerKey) {
    throw new Error("Apple Wallet certificates are incomplete.");
  }

  const wwdrText = Buffer.from(wwdr).toString("utf8");
  const signerCertText = Buffer.from(signerCert).toString("utf8");
  const signerKeyText = Buffer.from(signerKey).toString("utf8");

  if (!wwdrText.includes("BEGIN CERTIFICATE")) {
    throw new Error(
      "APPLE_WWDR_PEM/BASE64 is invalid. Expected a PEM certificate."
    );
  }
  if (!signerCertText.includes("BEGIN CERTIFICATE")) {
    throw new Error(
      "APPLE_SIGNER_CERT_PEM/BASE64 is invalid. Expected a PEM certificate."
    );
  }
  if (!signerKeyText.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "APPLE_SIGNER_KEY_PEM/BASE64 is invalid. Expected a PEM private key."
    );
  }

  return {
    wwdr,
    signerCert,
    signerKey,
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

function isAdminPasswordValid(password) {
  return Boolean(
    ADMIN_CARD_PASSWORD &&
      typeof password === "string" &&
      password.trim() === ADMIN_CARD_PASSWORD
  );
}

function readAdminPassword(req) {
  const headerValue = req.headers["x-admin-password"];
  if (typeof headerValue === "string" && headerValue.trim()) {
    return headerValue.trim();
  }
  const bodyValue = req.body?.password;
  if (typeof bodyValue === "string" && bodyValue.trim()) {
    return bodyValue.trim();
  }
  return "";
}

async function supabaseRequest(method, endpoint, { body, prefer } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const err = new Error(payload?.message || "Supabase request failed.");
    err.payload = payload;
    err.status = response.status;
    throw err;
  }
  return payload;
}

function buildLoyaltyCardUrl(baseUrl, member) {
  const phone = encodeURIComponent(member.phone || "");
  const name = encodeURIComponent(member.name || "");
  const points = encodeURIComponent(String(member.points ?? 0));
  return `${baseUrl}/loyalty/card/${member.id}?phone=${phone}&name=${name}&points=${points}`;
}

function buildLoyaltyPasskitUrl(baseUrl, member) {
  const phone = encodeURIComponent(member.phone || "");
  const name = encodeURIComponent(member.name || "");
  return `${baseUrl}/api/passkit/loyalty/${member.id}?phone=${phone}&name=${name}`;
}

function getLoyaltyMemberById(memberId) {
  if (USE_SUPABASE) {
    return supabaseRequest(
      "GET",
      `loyalty_members?id=eq.${encodeURIComponent(memberId)}&select=*&limit=1`
    ).then((rows) => rows?.[0] || null);
  }
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM loyalty_members WHERE id = ?",
      [memberId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

function getLoyaltyMemberByPhone(phone) {
  if (USE_SUPABASE) {
    return supabaseRequest(
      "GET",
      `loyalty_members?phone=eq.${encodeURIComponent(phone)}&select=*&limit=1`
    ).then((rows) => rows?.[0] || null);
  }
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT * FROM loyalty_members WHERE phone = ?",
      [phone],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

function createLoyaltyMember(id, phone, name, createdAt) {
  if (USE_SUPABASE) {
    return supabaseRequest("POST", "loyalty_members", {
      body: {
        id,
        phone,
        name,
        points: 0,
        last_checkin_date: null,
        createdat: createdAt
      },
      prefer: "return=representation"
    }).then((rows) => rows?.[0] || null);
  }
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO loyalty_members (id, phone, name, points, last_checkin_date, createdAt) VALUES (?, ?, ?, 0, NULL, ?)",
      [id, phone, name, createdAt],
      (err) => {
        if (err) return reject(err);
        resolve({
          id,
          phone,
          name,
          points: 0,
          last_checkin_date: null,
          createdAt
        });
      }
    );
  });
}

async function addDailyCheckinPoint(memberId, today) {
  if (USE_SUPABASE) {
    const member = await getLoyaltyMemberById(memberId);
    if (!member) return { status: "not_found" };
    if (member.last_checkin_date === today) {
      return { status: "already_checked_in", member };
    }

    const nextPoints = Number(member.points || 0) + POINTS_PER_CHECKIN;
    const endpoint =
      `loyalty_members?id=eq.${encodeURIComponent(memberId)}` +
      `&points=eq.${encodeURIComponent(String(member.points || 0))}` +
      `&or=(last_checkin_date.is.null,last_checkin_date.neq.${encodeURIComponent(today)})` +
      "&select=*";

    const rows = await supabaseRequest("PATCH", endpoint, {
      body: { points: nextPoints, last_checkin_date: today },
      prefer: "return=representation"
    });

    if (rows?.length) {
      return { status: "ok", member: rows[0] };
    }

    const latest = await getLoyaltyMemberById(memberId);
    if (latest?.last_checkin_date === today) {
      return { status: "already_checked_in", member: latest };
    }
    return { status: "not_updated" };
  }
  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE loyalty_members SET points = points + ?, last_checkin_date = ? WHERE id = ? AND (last_checkin_date IS NULL OR last_checkin_date != ?)",
      [POINTS_PER_CHECKIN, today, memberId, today],
      function (err) {
        if (err) return reject(err);
        if (this.changes === 0) {
          return resolve({ status: "already_checked_in" });
        }
        resolve({ status: "ok" });
      }
    );
  });
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

    const existing = await getLoyaltyMemberByPhone(normalized);
    if (existing) {
      const cardUrl = buildLoyaltyCardUrl(baseUrl, existing);
      const qrDataUrl = await QRCode.toDataURL(cardUrl, { width: 320, margin: 2 });
      return res.json({
        id: existing.id,
        phone: existing.phone,
        phoneDisplay: formatPhoneDisplay(existing.phone),
        name: existing.name,
        points: existing.points,
        lastCheckinDate: existing.last_checkin_date,
        cardUrl,
        qrDataUrl,
        returning: true,
        appleWalletLoyaltyUrl: buildLoyaltyPasskitUrl(baseUrl, existing),
        appleWalletEnabled: isAppleWalletConfigured(),
        ...loyaltyMetaPayload()
      });
    }

    const id = generateLoyaltyId();
    const createdAt = new Date().toISOString();
    let created;
    try {
      created = await createLoyaltyMember(
        id,
        normalized,
        String(name).trim(),
        createdAt
      );
    } catch (createErr) {
      // In case of concurrent requests, fall back to existing phone owner.
      const fallback = await getLoyaltyMemberByPhone(normalized);
      if (!fallback) throw createErr;
      created = fallback;
    }

    const cardUrl = buildLoyaltyCardUrl(baseUrl, created);
    const qrDataUrl = await QRCode.toDataURL(cardUrl, { width: 320, margin: 2 });

    res.status(201).json({
      id,
      phone: created.phone,
      phoneDisplay: formatPhoneDisplay(created.phone),
      name: created.name,
      points: created.points,
      lastCheckinDate: created.last_checkin_date,
      cardUrl,
      qrDataUrl,
      returning: false,
      appleWalletLoyaltyUrl: buildLoyaltyPasskitUrl(baseUrl, created),
      appleWalletEnabled: isAppleWalletConfigured(),
      ...loyaltyMetaPayload()
    });
  } catch (_e) {
    res.status(500).json({ error: "Unexpected server error." });
  }
});

app.post("/api/loyalty/auto-checkin", async (req, res) => {
  try {
    const { phone, name } = req.body;
    const normalized = normalizePhone(phone);
    const cleanName = String(name || "").trim();
    if (!cleanName) {
      return res.status(400).json({ error: "Name is required." });
    }
    if (normalized.length < 10) {
      return res.status(400).json({
        error: "Enter a valid phone number (at least 10 digits)."
      });
    }

    const baseUrl = resolveBaseUrl(req);
    let member = await getLoyaltyMemberByPhone(normalized);
    if (!member) {
      const id = generateLoyaltyId();
      member = await createLoyaltyMember(
        id,
        normalized,
        cleanName,
        new Date().toISOString()
      );
    }

    const today = localCalendarDate();
    if (member.last_checkin_date !== today) {
      const checkin = await addDailyCheckinPoint(member.id, today);
      if (checkin.status === "ok" && checkin.member) {
        member = checkin.member;
      } else {
        const updated = await getLoyaltyMemberById(member.id);
        if (updated) member = updated;
      }
    }

    const cardUrl = buildLoyaltyCardUrl(baseUrl, member);
    const qrDataUrl = await QRCode.toDataURL(cardUrl, { width: 320, margin: 2 });
    return res.json({
      id: member.id,
      phone: member.phone,
      phoneDisplay: formatPhoneDisplay(member.phone),
      name: member.name,
      points: member.points,
      lastCheckinDate: member.last_checkin_date,
      cardUrl,
      qrDataUrl,
      returning: true,
      autoCheckedIn: true,
      appleWalletLoyaltyUrl: buildLoyaltyPasskitUrl(baseUrl, member),
      appleWalletEnabled: isAppleWalletConfigured(),
      ...loyaltyMetaPayload()
    });
  } catch (_e) {
    return res.status(500).json({ error: "Unexpected server error." });
  }
});

app.get("/api/loyalty/member/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const row = await getLoyaltyMemberById(id);
    if (!row) {
      return res.status(404).json({ error: "Member not found." });
    }
    const baseUrl = resolveBaseUrl(req);
    const cardUrl = buildLoyaltyCardUrl(baseUrl, row);
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
      appleWalletLoyaltyUrl: buildLoyaltyPasskitUrl(baseUrl, row),
      appleWalletEnabled: isAppleWalletConfigured(),
      ...loyaltyMetaPayload()
    });
  } catch (_err) {
    res.status(500).json({ error: "Database error." });
  }
});

app.get("/api/public/join-qr", async (req, res) => {
  try {
    const baseUrl = resolveBaseUrl(req);
    const joinUrl = `${baseUrl}/join.html`;
    const qrDataUrl = await QRCode.toDataURL(joinUrl, { width: 320, margin: 2 });
    res.json({ joinUrl, qrDataUrl });
  } catch (_err) {
    res.status(500).json({ error: "Could not generate join QR." });
  }
});

app.post("/api/admin/loyalty/member/:id", async (req, res) => {
  if (!ADMIN_CARD_PASSWORD) {
    return res.status(503).json({
      error: "Admin card password is not configured."
    });
  }

  if (!isAdminPasswordValid(readAdminPassword(req))) {
    return res.status(401).json({ error: "Invalid admin password." });
  }

  const { id } = req.params;
  try {
    const row = await getLoyaltyMemberById(id);
    if (!row) {
      return res.status(404).json({ error: "Member not found." });
    }
    const baseUrl = resolveBaseUrl(req);
    const cardUrl = buildLoyaltyCardUrl(baseUrl, row);
    const qrDataUrl = await QRCode.toDataURL(cardUrl, { width: 280, margin: 2 });
    return res.json({
      id: row.id,
      phone: row.phone,
      phoneDisplay: formatPhoneDisplay(row.phone),
      name: row.name,
      points: row.points,
      lastCheckinDate: row.last_checkin_date,
      cardUrl,
      qrDataUrl,
      ...loyaltyMetaPayload()
    });
  } catch (_err) {
    return res.status(500).json({ error: "Database error." });
  }
});

app.get("/api/passkit/loyalty/:id", async (req, res) => {
  if (!isAppleWalletConfigured()) {
    return res.status(503).json({
      error:
        "Apple Wallet is not configured. Set APPLE_PASS_TYPE_IDENTIFIER and APPLE_TEAM_IDENTIFIER plus certs via file paths (APPLE_WWDR_PATH / APPLE_SIGNER_CERT_PATH / APPLE_SIGNER_KEY_PATH) or inline envs (APPLE_WWDR_PEM|BASE64, APPLE_SIGNER_CERT_PEM|BASE64, APPLE_SIGNER_KEY_PEM|BASE64)."
    });
  }

  const { id } = req.params;
  const queryPhone = normalizePhone(req.query.phone);
  const queryName = String(req.query.name || "Member").trim() || "Member";

  try {
    let member = await getLoyaltyMemberById(id);

    // In serverless mode, volatile stores can lose member records.
    // If QR carries phone fallback info, recover or recreate member.
    if (!member && queryPhone.length >= 10) {
      member = await getLoyaltyMemberByPhone(queryPhone);
      if (!member) {
        member = await createLoyaltyMember(
          id,
          queryPhone,
          queryName,
          new Date().toISOString()
        );
      }
    }

    if (!member) {
      return res.status(404).json({ error: "Loyalty member not found." });
    }
    const baseUrl = resolveBaseUrl(req);
    const passBuffer = await buildLoyaltyPkPass(member, baseUrl);
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="smoke-n-bubbles-loyalty-${member.id}.pkpass"`
    );
    res.send(passBuffer);
  } catch (e) {
    const reason = e && e.message ? String(e.message) : "Unknown signing error.";
    console.error("Apple Wallet loyalty pass error:", reason);
    res.status(500).json({
      error:
        "Could not generate Apple Wallet pass. Check certificates and Pass Type ID.",
      reason
    });
  }
});

app.post("/api/loyalty/checkin", (req, res) => {
  if (!ADMIN_CARD_PASSWORD) {
    return res.status(503).json({
      error: "Admin card password is not configured."
    });
  }
  if (!isAdminPasswordValid(readAdminPassword(req))) {
    return res.status(401).json({ error: "Invalid admin password." });
  }

  const rawMemberId = req.body?.memberId;
  const memberIdInput =
    typeof rawMemberId === "string" && rawMemberId.trim()
      ? rawMemberId.trim()
      : "";
  const normalizedPhone = normalizePhone(req.body?.phone || "");
  const inputName =
    String(req.body?.name || "Member").trim() || "Member";

  if (!memberIdInput && normalizedPhone.length < 10) {
    return res.status(400).json({
      error: "memberId or a valid phone number is required."
    });
  }

  const today = localCalendarDate();

  (async () => {
    try {
      let row = null;
      let resolvedMemberId = memberIdInput;

      if (resolvedMemberId) {
        row = await getLoyaltyMemberById(resolvedMemberId);
      }

      // Recover member by phone if id is stale/missing (serverless cold starts).
      if (!row && normalizedPhone.length >= 10) {
        row = await getLoyaltyMemberByPhone(normalizedPhone);
        if (!row) {
          const newId = resolvedMemberId || generateLoyaltyId();
          row = await createLoyaltyMember(
            newId,
            normalizedPhone,
            inputName,
            new Date().toISOString()
          );
        }
        resolvedMemberId = row.id;
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

      const checkin = await addDailyCheckinPoint(resolvedMemberId, today);
      if (checkin.status === "already_checked_in") {
        return res.status(409).json({
          error: "Already checked in today.",
          name: row.name,
          points: row.points,
          lastCheckinDate: row.last_checkin_date
        });
      }
      if (checkin.status !== "ok") {
        return res.status(500).json({ error: "Could not update points." });
      }

      const updated =
        checkin.member || (await getLoyaltyMemberById(resolvedMemberId));
      if (!updated) {
        return res.status(500).json({ error: "Could not read member." });
      }
      res.json({
        ok: true,
        name: updated.name,
        points: updated.points,
        lastCheckinDate: updated.last_checkin_date,
        message: `+${POINTS_PER_CHECKIN} point${POINTS_PER_CHECKIN === 1 ? "" : "s"}`
      });
    } catch (_err) {
      res.status(500).json({ error: "Database error." });
    }
  })();
});

app.get("/api/loyalty/wallet-preview/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const row = await getLoyaltyMemberById(id);
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
  } catch (_err) {
    res.status(500).json({ error: "Database error." });
  }
});

app.get("/loyalty/card/:id", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "loyalty-card.html"));
});

app.get("/admin/card/:id", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-card.html"));
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
