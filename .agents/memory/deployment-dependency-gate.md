---
name: Deployment dependency gate
description: Replit publishing can block a successful application build when a critical vulnerability remains in the resolved Python dependency lock.
---

Replit publishing evaluates the full resolved Python dependency graph, not only direct dependencies. When a transitive package is blocked, resolve a safe version in `pyproject.toml` using the package manager's supported override mechanism and regenerate `uv.lock`.

**Why:** A publish can compile and bundle successfully but still fail before promotion because the security gate rejects a vulnerable transitive package.

**How to apply:** When a publish fails with a dependency-vulnerability message, identify the exact locked package and advisory from the build log, update the lock resolution, run the exact configured build locally, and tell the user to publish again.