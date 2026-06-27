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
| **API Access** | — | — | — | ✅ | ✅ |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- Redis (for BullMQ)
- Firecrawl API Key (optional)

### Local Development
```bash
git clone https://github.com/Sam-Aitech/Checkbyai.net.git
cd Checkbyai.net
npm install
cp .env.example .env
npm run db:push
npm run db:migrate
npm run dev
```

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
| **Email** | Resend / Brevo | Transactional emails |
| **SMS** | Twilio | SMS notifications |

---

## 📁 Project Structure

```
Checkbyai.net/
├── backend/          # Express API server
├── client/           # React frontend
├── server/           # Server entry point
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
