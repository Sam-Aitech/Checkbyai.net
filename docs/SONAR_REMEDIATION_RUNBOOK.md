# SonarCloud Remediation Runbook

This runbook implements the repository's step-by-step SonarCloud stabilization and debt reduction process.

## 1) Confirm the failing New Code gate condition

For each failed analysis (example: `b0490b13`):
- Open SonarCloud project summary.
- Open **Quality Gate** details.
- Record the exact failed New Code metric in the tracking issue.

## 2) Verify coverage ingestion end-to-end

CI now enforces coverage generation before scan:
- `.github/workflows/sonarcloud.yml` runs Vitest with LCOV output.
- The workflow fails if `coverage/lcov.info` is missing or empty.
- The LCOV file is uploaded as `sonar-lcov` artifact for debugging.
- Sonar scanner receives:
  - `sonar.javascript.lcov.reportPaths=coverage/lcov.info`
  - `sonar.typescript.lcov.reportPaths=coverage/lcov.info`

## 3) Stabilize New Code gate first

Before large backlog cleanup:
- Triage and fix the specific rule/metric failing New Code.
- Keep PR focus on getting **SonarCloud Scan** green.

## 4) Use realistic temporary gate thresholds

In SonarCloud Quality Gate configuration:
- Keep strict blocking on new blocker/critical/security findings.
- Use an achievable temporary New Code coverage threshold.
- Raise the threshold incrementally after each successful cycle.

## 5) Security-first remediation wave

- Triage Security issues and Security Hotspots first.
- Classify each as:
  - `fix-now`
  - `accepted-risk` (maintainer-approved with rationale)
  - `false-positive` (maintainer-approved with rationale)

## 6) Reliability remediation wave

- Prioritize by severity and production impact.
- Address high-impact reliability findings before low-impact cleanup.

## 7) Maintainability debt in rule-based batches

- Resolve maintainability findings by rule family (batch mode), not random file-by-file edits.
- Track each batch in a dedicated issue for reviewability.

## 8) Duplication control

- Set a duplication target in SonarCloud.
- Enforce "no duplication increase on New Code" in PR review.

## 9) Governance and tracking

Create remediation issues using the `Sonar Remediation` issue template with one category per issue:
- Security
- Reliability
- Maintainability
- Coverage

Track each issue with:
- owner
- due date / SLA
- weekly progress update

## 10) Branch workflow enforcement

- Keep `SonarCloud Scan` required for PRs to `main`.
- Reject merges when Quality Gate fails unless there is explicit maintainer-approved risk disposition.

