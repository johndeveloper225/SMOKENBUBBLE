# SMOKENBUBBLE

Simple full-stack app for loyalty cards, QR check-ins, and Apple Wallet pass generation.

## Tech Stack

- Backend: Node.js + Express
- Database: SQLite (`passes.db`)
- QR Generation: `qrcode`
- Apple Wallet: `passkit-generator` (signed `.pkpass`)
- Scanner: `html5-qrcode`
- Frontend: HTML/CSS/JS (mobile friendly)

## Features

- Loyalty member registration by phone + name
- Points tracking with daily check-in limit
- Wallet-style digital loyalty card page
- QR code on card for checkout scanning
- Staff scanner page for check-in processing
- Apple Wallet loyalty pass endpoint (`/api/passkit/loyalty/:id`)
- Save-to-home-screen instructions

## Run Locally

```bash
npm install
npm start
```

If port `3000` is busy, server auto-falls forward to next free port.

## Supabase Loyalty Persistence (Recommended on Vercel)

Use Supabase so points do not reset between deploys/cold starts.

1. In Supabase SQL Editor, run:

```sql
create table if not exists public.loyalty_members (
  id text primary key,
  phone text not null unique,
  name text not null,
  points integer not null default 0,
  last_checkin_date text,
  createdat text not null
);
```

2. Add environment variables (local `.env` and Vercel project settings):

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

3. Redeploy. Loyalty endpoints will automatically use Supabase when these vars exist.

## Private Admin QR View

Customers see a card without QR by default. Owners can open a password-protected QR page:

- URL: `/admin/card/:id`
- API: `POST /api/admin/loyalty/member/:id` (requires password)

Set this env var locally and in Vercel:

```env
ADMIN_CARD_PASSWORD=choose-a-strong-password
```

From the check-in scanner result, use **Open private QR view** to access the protected page.

## Apple Wallet Setup (Windows)

1. Create Apple Pass Type ID + certificate in Apple Developer portal.
2. Generate CSR/private key (script included):

```powershell
cd "C:\Users\HP\Desktop\smokenbubbles"
.\scripts\generate-apple-csr.ps1 -Email "you@example.com"
```

3. Put certificates in `certs/` and convert to PEM.
4. Configure `.env`:

```env
APPLE_PASS_TYPE_IDENTIFIER=pass.com.smokenbubbles.loya
APPLE_TEAM_IDENTIFIER=YOUR_TEAM_ID
APPLE_ORGANIZATION_NAME=Smoke n Bubbles
APPLE_WWDR_PATH=C:\Users\HP\Desktop\smokenbubbles\certs\AppleWWDRCAG4.pem
APPLE_SIGNER_CERT_PATH=C:\Users\HP\Desktop\smokenbubbles\certs\pass_certificate.pem
APPLE_SIGNER_KEY_PATH=C:\Users\HP\Desktop\smokenbubbles\certs\pass_private.key
APPLE_SIGNER_KEY_PASSPHRASE=
```

## Security Notes

- `.env`, private keys, `.cer/.csr`, database, and `certs/` are gitignored.
- Never commit signing keys.
