# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (`main`) | ✅ Actively supported |
| Previous minor | ✅ Security patches only |
| Older versions | ❌ Not supported |

We strongly recommend always running the latest version.

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

We take security seriously at CheckByAI. If you've discovered a security vulnerability, we appreciate your help in responsibly disclosing it.

### How to Report

**Email:** security@checkbyai.net

Include as much of the following as possible:

- **Type of vulnerability** (e.g., XSS, SQL injection, authentication bypass, IDOR)
- **Component affected** (e.g., authentication, file upload, payment, admin panel)
- **Steps to reproduce** — exact steps to trigger the vulnerability
- **Proof of concept** — code, screenshots, or screen recording (if safe to share)
- **Potential impact** — what an attacker could achieve by exploiting this
- **Suggested fix** (optional, but appreciated)

### What to Expect

| Timeline | Action |
|----------|--------|
| **24 hours** | Acknowledgment of your report |
| **72 hours** | Initial assessment and severity classification |
| **7 days** | Status update and estimated fix timeline |
| **30–90 days** | Fix development, testing, and deployment |
| **After fix** | Public disclosure (coordinated with reporter) |

We will keep you informed throughout the process. We do not currently offer a bounty program, but we will acknowledge your contribution in the security advisory (unless you prefer to remain anonymous).

---

## Scope

### In Scope

The following are within scope for vulnerability reports:

- **Authentication & session management** — OTP flow, Google OAuth, session cookies
- **Authorization bypass** — accessing data/features without proper permissions
- **Injection attacks** — SQL, command, or template injection
- **File upload vulnerabilities** — malicious file execution, path traversal
- **Payment security** — Stripe webhook bypasses, credit fraud
- **Data exposure** — leaking PII, immigration documents, phone numbers
- **Admin panel access** — unauthorized access to admin routes
- **API rate limit bypasses** — circumventing OTP or search rate limits

### Out of Scope

The following are **not** in scope:

- Denial of Service (DoS/DDoS) attacks
- Social engineering or phishing attacks targeting CheckByAI staff
- Physical security attacks
- Vulnerabilities in third-party services we integrate with (report directly to them)
- Spam, clickjacking, or self-XSS without a realistic attack scenario
- Issues requiring physical access to a victim's device
- Outdated browser or OS versions not supported by current standards
- Reports from automated scanning tools without demonstrated impact

### Safe Harbour

We will not take legal action against researchers who:

- Report vulnerabilities in good faith and through proper channels
- Do not exploit the vulnerability beyond what is necessary to demonstrate impact
- Do not access, modify, or delete data that does not belong to them
- Do not disrupt our services or degrade user experience
- Do not violate any applicable laws

---

## Our Security Practices

### Authentication

- **Email OTP** — 6-digit codes with 10-minute expiry, cleared on use
- **Google OAuth** — CSRF-protected with `state` parameter validation
- **Admin access** — OTP-only (no passwords), email-verified admin identity
- **Session cookies** — `httpOnly`, `secure`, `sameSite: lax`, 7-day expiry
- **CAPTCHA** — Cloudflare Turnstile on authentication endpoints

### Data Protection

- **Phone numbers** — AES-256-GCM encrypted at application layer before storage
- **Immigration documents (COS)** — never stored; permanently deleted immediately after forensic analysis; only SHA-256 hash retained
- **Passwords** — we do not store passwords; authentication is OTP-only
- **Database connections** — TLS enforced via Neon PostgreSQL

### Network & Application Security

- **Rate limiting** — per-IP limits on OTP, search, and file upload endpoints
- **Input validation** — Zod schema validation on all mutation endpoints
- **SQL injection** — Drizzle ORM with parameterized queries only
- **XSS prevention** — React JSX auto-escaping + Content-Security-Policy headers
- **Prototype pollution** — `express.urlencoded({ extended: false })`
- **File uploads** — MIME type enforcement (PDF only), 10MB size limit, temp-dir isolation
- **CSRF protection** — SameSite cookies + OAuth state parameter

### Dependency Management

- Dependencies are audited regularly with `npm audit`
- High/critical CVEs are patched within 48 hours of disclosure
- Security-related updates are applied independently of feature releases

---

## Known Security Limitations & Accepted Risks

| Item | Risk | Mitigation |
|------|------|------------|
| No PostgreSQL Row Level Security | Application-layer access control only | All routes enforce `isAuthenticated`/`isAdmin` middleware |
| Session in PostgreSQL | Session fixation if DB is compromised | Session IDs are opaque nanoids; regenerated on auth |
| Phone OTP verification | SIM swap attacks | Out-of-scope for current threat model; low-risk channel |

These are documented to be transparent — not to invite exploitation.

---

## Security Contacts

| Role | Contact |
|------|---------|
| Security reports | security@checkbyai.net |
| General enquiries | hello@checkbyai.net |
| Code of Conduct violations | conduct@checkbyai.net |

For encrypted communication, please request our PGP key by emailing security@checkbyai.net.

---

## Security Advisories

Past security advisories will be published at [GitHub Security Advisories](https://github.com/Sam-Aitech/Checkbyai.net/security/advisories) once a fix is released and the disclosure period has passed.
