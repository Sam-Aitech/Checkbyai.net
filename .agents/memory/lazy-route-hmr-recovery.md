---
name: Lazy route HMR recovery
description: Why lazy route imports need recovery during rapid Vite development updates
---

Development Preview can briefly fail to fetch a lazy route module while Vite is invalidating several modules during rapid HMR updates. The server may remain healthy and the same module may load successfully moments later.

**Why:** A failed dynamic import is caught by the route error boundary and otherwise leaves the visible route crashed even though the failure is transient.

**How to apply:** Keep lazy route loading behind a one-time, session-scoped reload guard. If the retry also fails, rethrow so persistent module errors remain visible instead of creating an infinite reload loop.