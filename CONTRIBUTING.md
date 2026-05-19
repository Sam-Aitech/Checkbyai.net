# Contributing to CheckByAI

First off, thank you for considering a contribution to CheckByAI! We welcome all kinds of contributions: bug reports, feature requests, documentation improvements, and code patches.

## 🤝 Our Community

Please read our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before participating. We are committed to providing a welcoming and inclusive environment for everyone.

---

## 🐛 Reporting Issues

### Security Vulnerabilities
**Do not open public issues for security vulnerabilities.** Email **security@checkbyai.net** with:
- Vulnerability description
- Affected component(s)
- Proof of concept (if safe to share)
- Potential impact

We'll acknowledge within 24 hours and work with you on a fix and disclosure timeline.

### Bugs
Open an issue with:
1. **Title:** Clear, concise description
2. **Steps to reproduce:** Exact sequence to trigger the bug
3. **Expected behavior:** What should happen
4. **Actual behavior:** What happens instead
5. **Environment:** Node version, OS, browser (if applicable)
6. **Logs/screenshots:** Any error messages or visual evidence

Example:
```
Title: Authentication fails when OTP expires during form submission

Steps:
1. Navigate to login page
2. Enter email, wait for OTP
3. Wait 10+ minutes until OTP expires
4. Submit OTP form

Expected: Clear error message "OTP expired, request new one"
Actual: Silent failure, page stays on OTP form, no error shown

Environment: Node 20.19.25, PostgreSQL 14, Chrome 124
```

### Feature Requests
Open an issue with:
1. **Use case:** Why you need this feature
2. **Proposed solution:** How it should work
3. **Alternatives:** Other approaches you've considered
4. **Examples:** Screenshots, mockups, or links to similar features

---

## 💻 Development Workflow

### 1. Fork & Clone
```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/Checkbyai.net.git
cd Checkbyai.net
git remote add upstream https://github.com/Sam-Aitech/Checkbyai.net.git
```

### 2. Create a Branch
Use descriptive branch names tied to issues:
```bash
git checkout -b fix/authentication-otp-expiry
git checkout -b feature/sponsor-webhooks
git checkout -b docs/deployment-guide
```

**Branch naming convention:**
- `fix/*` — Bug fixes
- `feature/*` — New features
- `refactor/*` — Code refactoring (no behavior change)
- `docs/*` — Documentation only
- `test/*` — Test improvements
- `perf/*` — Performance improvements

### 3. Make Changes
See [DEVELOPMENT.md](DEVELOPMENT.md) for local setup.

**Required GitHub repository secrets for CI-enabled forks:**
- `SONAR_TOKEN` — required for `.github/workflows/sonarcloud.yml` so SonarCloud can analyze pull requests and publish the Quality Gate status
- `TEST_BASE_URL` — required if you want pull-request E2E workflows to run against a deployed environment

**Code style:**
- **Formatting:** Prettier (run `npm run format` or enable in your editor)
- **Linting:** ESLint (run `npm run lint`)
- **Types:** TypeScript strict mode (run `npm run check`)

Recommendations:
- Install the [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) and [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) VSCode extensions for real-time feedback

### 4. Commit Messages

Use clear, descriptive messages following this format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type:** `fix`, `feat`, `docs`, `test`, `refactor`, `perf`, `ci`

**Scope:** Component or area (e.g., `auth`, `sponsor-monitor`, `cos-check`)

**Subject:**
- Imperative mood ("add" not "added")
- Lowercase, no period
- Max 50 characters

**Body:** (optional for small changes, required for features)
- Explain *why*, not *what*
- Wrap at 72 characters
- Separate from subject with blank line

**Footer:** (optional)
- Reference issues: `Closes #123`, `Fixes #456`
- Breaking changes: `BREAKING CHANGE: description`

**Examples:**
```
fix(auth): prevent OTP brute-force with rate limiting

Add rate limiter to POST /api/auth/email/send-otp:
- Max 5 OTP requests per 15 minutes per IP
- Return 429 Too Many Requests when exceeded

Closes #88
```

```
feat(sponsor-monitor): add webhook delivery for premium tiers

Admins can configure POST endpoint to receive sponsor change events in real-time.

- New `webhooks` table for storing webhook URLs per user
- Automatic retry with exponential backoff
- Admin dashboard to test webhook

Closes #142
```

### 5. Testing

**Before pushing:**
```bash
# Type-check
npm run check

# Lint
npm run lint

# Format
npm run format

# Run all tests
npm run test:run

# (Optional) Run specific test file
npm run test -- sponsorMonitorJob.test.ts
```

**What tests should cover:**
- Happy path (normal usage)
- Error cases (invalid input, failures)
- Edge cases (empty data, boundary conditions)
- Security-critical paths (auth, payment, data access)

See [DEVELOPMENT.md](DEVELOPMENT.md) for testing guide.

### 6. Push & Create Pull Request

```bash
# Push to your fork
git push origin fix/authentication-otp-expiry

# Create PR on GitHub
# Title: follows commit message format
# Description: explain changes, link issues, include screenshots if applicable
```

**PR template** (auto-populated):
```markdown
## Description
Brief explanation of what changed and why.

Closes #<issue_number>

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing
How was this tested? Steps to verify the change works.

## Checklist
- [ ] Code follows style guidelines (run `npm run lint && npm run format`)
- [ ] Tests pass locally (`npm run test:run`)
- [ ] Type-check passes (`npm run check`)
- [ ] No new warnings generated
- [ ] Documentation updated (if applicable)
```

### 7. Code Review

Expect feedback on:
- **Correctness:** Does it work? Are there edge cases?
- **Security:** Does it introduce vulnerabilities? (especially payment, auth, file upload)
- **Performance:** Does it scale? Any N+1 queries?
- **Style:** Does it match the codebase conventions?
- **Tests:** Are tests sufficient and meaningful?

**Guidelines for reviewees:**
- Respond to comments within 24 hours
- Ask clarifying questions if feedback is unclear
- Don't take criticism personally — it's about the code!

**Guidelines for reviewers:**
- Be respectful and constructive
- Suggest improvements, don't demand
- Acknowledge good work

Once approved by maintainers, your PR will be merged to `main`.

---

## 📝 Documentation Changes

### README.md
- Update if you change user-facing features
- Keep quick-start instructions accurate

### docs/*.md
- Update relevant docs when changing behavior
- Add new docs for new features
- Keep examples and code snippets current

### API_REFERENCE.md
- Update when adding/changing API endpoints
- Include request/response examples
- Document rate limits and auth requirements

### DEVELOPMENT.md
- Update setup instructions if dependencies change
- Add debugging tips for complex features

---

## 🏗️ Architecture Decisions

If your change affects system architecture, consider documenting it in `docs/ARCHITECTURE_DECISIONS.md` as an ADR (Architecture Decision Record).

Template:
```markdown
## ADR-###: [Decision Title]

**Status:** Proposed / Accepted / Deprecated

**Context:**
Why did we face this decision?

**Decision:**
What did we decide?

**Consequences:**
What are the tradeoffs?
```

---

## 🚀 Release Process

Only maintainers publish releases, but understanding the process helps:

1. Increment version in `package.json` (semver: major.minor.patch)
2. Update `CHANGELOG.md` with all changes
3. Create git tag: `git tag v1.2.3`
4. Push tag: `git push origin v1.2.3`
5. GitHub Actions builds and publishes

**Version bumping:**
- **Patch** (1.2.3 → 1.2.4): Bug fixes, security patches
- **Minor** (1.2.3 → 1.3.0): New features, backward-compatible
- **Major** (1.2.3 → 2.0.0): Breaking changes

---

## ❓ Questions?

- **Documentation:** Read [README.md](README.md), [DEVELOPMENT.md](DEVELOPMENT.md), and [docs/](docs/)
- **Discussion:** [Open a GitHub Discussion](https://github.com/Sam-Aitech/Checkbyai.net/discussions)
- **Issues:** [GitHub Issues](https://github.com/Sam-Aitech/Checkbyai.net/issues)
- **Email:** support@checkbyai.net

---

## 👏 Thank You!

Every contribution — no matter how small — makes CheckByAI better. We appreciate your time and effort!

**Happy coding!** 🎉
