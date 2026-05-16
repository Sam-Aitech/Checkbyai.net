<!-- CheckByAI Pull Request Template
     Commit format: <type>(<scope>): <subject>  (Conventional Commits)
     Types: feat | fix | refactor | chore | docs | test | security | perf
     Example: feat(backend): add sponsor licence expiry webhook
-->

## Summary
<!-- One sentence: what does this PR do and why? -->


## Type of Change
<!-- Check all that apply -->
- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `refactor` — code change (no behaviour change)
- [ ] `chore` — build, deps, config
- [ ] `docs` — documentation only
- [ ] `test` — adding or fixing tests
- [ ] `security` — security fix or hardening
- [ ] `perf` — performance improvement

## Linked Issues
<!-- Closes #<issue-number> -->
Closes #

## Changes Made
<!-- Bullet-point list of concrete changes. Be specific. -->
- 

## Security & IP Checklist
<!-- MANDATORY for every PR touching server/, shared/, or backend/ (Python sidecar) -->
- [ ] No proprietary algorithm logic, ML model weights, or scoring thresholds are exposed
- [ ] No personal machine paths, usernames, or local env details in the diff
- [ ] No API keys, tokens, or secrets added (use `.env.example` for new vars)
- [ ] Sensitive `.env` values are documented in `.env.example` (value redacted)
- [ ] `backend/cos_verifier.py` changes do not expose proprietary logic, secrets, or private implementation details

## Testing
- [ ] Unit tests added / updated
- [ ] Manually tested locally
- [ ] No regressions in existing test suite

## Screenshots / Logs
<!-- If UI change: before/after screenshot. If API change: curl example. -->


## Commit Hygiene
<!-- Confirm before requesting review -->
- [ ] All commits follow `<type>(<scope>): <subject>` Conventional Commits format
- [ ] No `Update`, `fix`, `WIP`, or `Published your App` commit messages
- [ ] Branch is up-to-date with `main`
- [ ] PR title matches the squash-merge commit message format

---
> **Reviewer note:** Do not approve if any Security & IP box is unchecked.
