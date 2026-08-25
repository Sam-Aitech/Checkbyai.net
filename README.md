# CheckByAI

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live-Demo-green?style=flat-square)](https://checkbyai.net)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue)](https://www.postgresql.org/)
[![GitHub Issues](https://img.shields.io/github/issues/Sam-Aitech/Checkbyai.net)](https://github.com/Sam-Aitech/Checkbyai.net/issues)
[![GitHub Stars](https://img.shields.io/github/stars/Sam-Aitech/Checkbyai.net)](https://github.com/Sam-Aitech/Checkbyai.net/stargazers)

</div>

<div align="center">

## Your sponsor was revoked last night. Nobody told you.

**CheckByAI** is an AI-powered UK immigration compliance monitoring and document verification platform. Built in London.

[🌐 Visit checkbyai.net →](https://checkbyai.net)

</div>

---

## 👤 Who Is This For?

| Persona | Problem | How CheckByAI Helps |
|---|---|---|
| 🧑‍💼 **Visa Holders** | Sponsor revoked without warning - you lose your visa | Real-time alerts before it's too late |
| 🏢 **HR Teams** | Accidentally hiring from revoked sponsors = illegal | Instant licence status verification |
| 📋 **Immigration Advisers** | Manual checks are slow and unreliable | Automated daily monitoring + forensic CoS checks |
| 🤝 **Recruiters** | Placing candidates at non-compliant employers | Pre-screen sponsors before any placement |

---

## 🎯 What You Get in 30 Seconds

| Feature | What It Does |
|---|---|
| 🔍 **Sponsor Licence Monitor** | Daily scans of the UK Home Office Register of Licensed Sponsors. Alerts on removals, downgrades, new routes, and status changes. |
| 🔎 **CoS Check — PDF Forensics** | Forensic analysis of Certificate of Sponsorship PDFs to detect tampering, fabricated metadata, suspicious modification dates, and invalid certificate generation. |
| ⚡ **Real-Time Alerts** | Email, WhatsApp, and SMS notifications when licences are revoked or suspended. |
| 📊 **124,000+ Sponsors Tracked** | Full coverage of the UK Home Office Register of Licensed Sponsors. |

---

## 🖥️ How It Works

```
1. Upload a CoS PDF  →  2. AI scans 6 data points  →  3. Get a risk score in seconds


1. Enter a sponsor name  →  2. CheckByAI scans the register  →  3. Get instant status + alerts
```

---

## 💰 Pricing

| Feature | Free | Starter | Pro | Unlimited | Enterprise |
|---|:---:|:---:|:---:|:---:|:---:|
| **Sponsor Watches** | 1 | 2 | 5 | Unlimited | Unlimited |
| **Notifications** | Daily digest | Email + WhatsApp | All + Immediate | All + Immediate | All + Webhooks |
| **CoS Check MIS** | — | — | ✅ | ✅ | ✅ |
| **API Access** ¹ | — | — | — | Planned | Planned |

¹ No public or partner API is available yet — see the roadmap. Listed here as planned scope
for these tiers, not a shipped feature.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- Redis (optional — BullMQ job queue)
- Firecrawl API Key (optional)
- A POSIX shell (macOS/Linux, WSL, or Git Bash on Windows) — see [Windows](#windows) below

### Local Development
```bash
git clone https://github.com/Sam-Aitech/Checkbyai.net.git
cd Checkbyai.net
npm install
cp .env.example .env
# Fill in .env — DATABASE_URL, SESSION_SECRET, PHONE_ENCRYPTION_KEY, IP_HASH_SALT,
# CHECKOUT_HMAC_SECRET and DIGEST_SIGNING_KEY are all required or the server exits on boot.

npm run setup:binaries   # installs qsv + csvdiff into ./bin (required — see below)
npm run db:push
npm run db:migrate
npm run dev
```

App serves frontend and API together on **http://localhost:5000**.

> **`setup:binaries` is not optional.** The sponsor monitor pipeline shells out to `csvdiff`
> (Go) and `qsv` (Rust). Without `csvdiff` the nightly job aborts at Phase 2; without `qsv`
> it runs but skips CSV row-count validation. Verify with `npm run check:binaries`.

### Windows

`npm run setup:binaries` invokes `bash`, and the `dev`/`start` scripts use POSIX inline env
syntax (`NODE_ENV=development tsx ...`), which native `cmd.exe` and PowerShell do not
support. Run the commands above from **Git Bash or WSL**.

A PowerShell equivalent of the binary installer is available if you prefer it:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-binaries.ps1
```

You will still need Git Bash or WSL for `npm run dev` / `npm run start`, or set `NODE_ENV`
in your shell beforehand and invoke `tsx server/index.ts` directly.

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18, TypeScript, TailwindCSS, Radix UI, Three.js | Modern reactive UI |
| **Backend** | Node.js, Express, Drizzle ORM, PostgreSQL (Neon) | REST API + ORM |
| **Queue** | BullMQ, Redis | Background job processing |
| **Auth** | Passport.js | Secure authentication |
| **Payments** | Stripe | Subscription billing |
| **Infrastructure** | Cloudflare (Turnstile/CDN) | Security + CDN |
| **Email** | Resend (primary) / SendGrid (fallback) | Transactional emails |
| **SMS** | Brevo | SMS notifications |
| **WhatsApp** | Twilio | WhatsApp messaging |

---

## 📁 Project Structure

```
Checkbyai.net/
├── backend/          # Python FastAPI sidecar (CoS verification, enrichment, scraping)
├── client/           # React frontend
├── server/           # Node.js/Express API server (main application)
├── shared/           # Shared types and utilities
├── migrations/       # Database migrations
├── scripts/          # Utility scripts
├── tests/            # Playwright E2E + unit tests
├── docs/             # Documentation
├── data/             # Seed data and archives
└── .github/          # CI/CD workflows
```

---

## 📄 Documentation

| Doc | Description |
|---|---|
| **DEVELOPMENT.md** | Local setup, architecture, running tests |
| **DEPLOYMENT.md** | Production deployment and scaling guide |
| **API_REFERENCE.md** | API endpoints, schemas, and examples |
| **SYSTEM_DESIGN.md** | Architecture and component design |

---

## 🛡️ Security

- AES-256-GCM encryption for phone numbers
- Email OTP authentication
- SQL injection prevention via Drizzle ORM
- File upload isolation with immediate deletion

---

## 📅 Roadmap

| Quarter | Milestone | Status |
|---|---|---|
| Q3 2026 | CoS PDF forensic engine v2 | ✅ Done |
| Q3 2026 | WhatsApp + SMS alert system | ✅ Done |
| Q4 2026 | API for enterprise partners | 🔄 In Progress |
| Q4 2026 | Mobile app (iOS/Android) | 📋 Planned |
| Q4 2026 | Multi-language support | 📋 Planned |

---

## 🐛 Reporting Issues

- **Security:** Email `security@checkbyai.net` with description, reproduction steps, and impact.
- **Bugs:** Open a [GitHub Issue](https://github.com/Sam-Aitech/Checkbyai.net/issues) with expected vs. actual behaviour and logs/screenshots.

---

<div align="center">

**Built in London 🇬🇧**

Made with ❤️ by [Sam-Aitech](https://github.com/Sam-Aitech)

If CheckByAI has helped you - please ⭐ star this repo to help others find it.

</div>
