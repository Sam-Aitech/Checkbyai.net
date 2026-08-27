# Pricing Consolidation & Checkout Defriction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the "Login to Subscribe" redirect from `/pricing` (replace with an inline email+OTP capture that never navigates away) and collapse the page's two parallel plan stacks (Annual vs Monthly) into one 2-card layout behind a billing-cadence toggle.

**Architecture:** Pure frontend change. A new self-contained `InlineEmailCheckout` widget wraps the existing `/api/auth/email/send-otp` and `/api/auth/email/verify-otp` endpoints (already used by `login.tsx`, unchanged here) and, on success, hands off to the *existing* `handleSelectAnnual`/`handleSelectNotification` checkout functions — which already work correctly once a session cookie exists, because the server's `isAuthenticated` middleware checks the real session, not any client-side flag. `PlanCard` grows a `capturing` sub-state that swaps its CTA button for the widget when a logged-out visitor clicks it. Pricing.tsx grows a cadence toggle (`'annual' | 'monthly'`) that switches which of the two already-existing plan grids renders; no third layout is invented.

**Tech Stack:** React + TypeScript, wouter, @tanstack/react-query, framer-motion, `@marsidev/react-turnstile` (already a dependency, already used by `login.tsx`), Playwright for E2E (`@playwright/test`, already configured — this repo has no client-side unit-test environment (no jsdom/RTL in `vitest.config.ts`, which is `environment: "node"` and only globs `server/**` and `tests/**`), so verification for this plan uses Playwright E2E throughout rather than introducing a new test stack for one feature).

**Spec:** [docs/superpowers/specs/2026-08-27-pricing-checkout-defriction-design.md](../specs/2026-08-27-pricing-checkout-defriction-design.md)

## Global Constraints

- No backend changes. Every task in this plan touches only `client/src/**` and `tests/e2e/**`.
- Reuse `/api/auth/email/send-otp` and `/api/auth/email/verify-otp` exactly as they exist today (request/response shapes below) — do not modify `server/auth.ts` or `server/validation/auth.ts`.
- If `VITE_TURNSTILE_SITE_KEY` is set, `send-otp` requires a `turnstileToken` or the server returns `400 { message: "CAPTCHA verification required" }`. The new widget MUST render the same conditional Turnstile challenge `login.tsx` does — this is not optional, production has this key set.
- `send-otp` request: `{ email: string, turnstileToken?: string }` → success `{ message: string }`, error `{ message: string }`.
- `verify-otp` request: `{ email: string, code: string (exactly 6 chars) }` → success `{ message: string, user: {...} }`, error `{ message: string }`.
- After a successful `verify-otp`, the client MUST call `await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] })` (same pattern as `login.tsx:200`) so the rest of the app picks up the new session.
- The existing `handleSelectAnnual`/`handleSelectNotification` functions must gain a `skipLoginCheck` escape hatch rather than being bypassed externally — the widget calls straight back into the same functions everything else already uses, it doesn't duplicate checkout logic.
- Keep both Stripe products (`alert_annual`/`alert_annual_pro` and `notification_starter`/`notification_pro`) exactly as-is — the toggle only changes which existing array renders, it does not touch `usePackagePrices`, `tierConfig.ts`, or Stripe.

---

## Task 1: Widen checkout handlers to accept a login-check bypass

**Files:**
- Modify: `client/src/pages/Pricing.tsx:121-216` (`PlanCard` component's `onSelect` prop type)
- Modify: `client/src/pages/Pricing.tsx:251-291` (`handleSelectNotification`)
- Modify: `client/src/pages/Pricing.tsx:293-318` (`handleSelectAnnual`)

**Interfaces:**
- Produces: `handleSelectAnnual(plan: AnnualPlan, skipLoginCheck?: boolean): Promise<void>` and `handleSelectNotification(plan: NotificationPlan, skipLoginCheck?: boolean): Promise<void>` — later tasks (3, 4) call these with `skipLoginCheck = true` from inside `InlineEmailCheckout`'s success callback.
- Produces: `PlanCard`'s `onSelect` prop type becomes `(plan: T, skipLoginCheck?: boolean) => void` — Task 4 uses this to pass the bypass flag through.

This task changes zero observable behavior (the new parameter defaults to `false` everywhere it's currently called) — it only prepares the seam Task 4 wires into. Verified by typecheck, not a runtime test, because there is nothing user-visible to assert yet.

- [ ] **Step 1: Widen the `PlanCard` `onSelect` prop type**

In `client/src/pages/Pricing.tsx`, find the `PlanCard` prop type (around line 121-129):

```tsx
function PlanCard<T extends PlanCardData>({ plan, index, isLoggedIn, loading, onSelect, highlighted, available = true }: Readonly<{
  plan: T;
  index: number;
  isLoggedIn: boolean;
  loading: string | null;
  onSelect: (plan: T) => void;
  highlighted?: boolean;
  available?: boolean;
}>) {
```

Change the `onSelect` line to:

```tsx
  onSelect: (plan: T, skipLoginCheck?: boolean) => void;
```

The button's existing `onClick={() => onSelect(plan)}` (around line 194) is unchanged — omitting the second argument is valid with the widened type.

- [ ] **Step 2: Add the bypass parameter to `handleSelectNotification`**

Find (around line 251):

```tsx
  const handleSelectNotification = async (plan: NotificationPlan) => {
    if (!isLoggedIn) {
      toast({
        title: 'Login Required',
        description: 'Please log in or create an account to subscribe.',
      });
      setLocation('/login');
      return;
    }
```

Change the signature and guard to:

```tsx
  const handleSelectNotification = async (plan: NotificationPlan, skipLoginCheck = false) => {
    if (!isLoggedIn && !skipLoginCheck) {
      toast({
        title: 'Login Required',
        description: 'Please log in or create an account to subscribe.',
      });
      setLocation('/login');
      return;
    }
```

- [ ] **Step 3: Add the bypass parameter to `handleSelectAnnual`**

Find (around line 293):

```tsx
  const handleSelectAnnual = async (plan: AnnualPlan) => {
    if (!isLoggedIn) {
      toast({ title: 'Login Required', description: 'Please log in or create an account to subscribe.' });
      setLocation('/login');
      return;
    }
```

Change to:

```tsx
  const handleSelectAnnual = async (plan: AnnualPlan, skipLoginCheck = false) => {
    if (!isLoggedIn && !skipLoginCheck) {
      toast({ title: 'Login Required', description: 'Please log in or create an account to subscribe.' });
      setLocation('/login');
      return;
    }
```

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no new type errors. (The existing render-site calls `onSelect={handleSelectAnnual}` and `onSelect={handleSelectNotification}` still satisfy the widened `PlanCard` prop type without changes.)

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Pricing.tsx
git commit -m "refactor: add skipLoginCheck escape hatch to pricing checkout handlers"
```

---

## Task 2: Write the E2E test for inline checkout (red)

**Files:**
- Create: `tests/e2e/pricing-inline-checkout.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (this test is written against the *target* UI, which doesn't exist yet — it must fail).
- Produces: this spec is the acceptance test Tasks 3-4 make pass. It asserts on `data-testid` attributes (`pricing-plan-cta`, `inline-checkout-email`, `inline-checkout-send`, `inline-checkout-code`, `inline-checkout-verify`) that Task 3/4 must add.

Route interception is used for `/api/auth/email/send-otp` and `/api/auth/email/verify-otp` so the test never depends on real email delivery — this is a standard Playwright pattern, not new test infrastructure.

- [ ] **Step 1: Write the failing E2E test**

```typescript
// tests/e2e/pricing-inline-checkout.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Pricing inline checkout (logged-out)", () => {
  test("clicking a plan CTA reveals inline email capture instead of navigating to /login", async ({ page }) => {
    await page.goto("/pricing");

    const cta = page.getByTestId("pricing-plan-cta").first();
    await expect(cta).toBeVisible();
    await cta.click();

    // Must NOT navigate away
    await expect(page).toHaveURL(/\/pricing/);

    // Inline email field appears in place of the button
    await expect(page.getByTestId("inline-checkout-email")).toBeVisible();
  });

  test("completes the email -> OTP -> checkout handoff without leaving the page", async ({ page }) => {
    let checkoutCalled = false;

    await page.route("**/api/auth/email/send-otp", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "sent" }) })
    );
    await page.route("**/api/auth/email/verify-otp", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "ok", user: { id: "test-user", email: "e2e@example.com" } }),
      })
    );
    await page.route("**/api/auth/user", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "test-user", email: "e2e@example.com" }),
      })
    );
    await page.route("**/api/checkout/credits", (route) => {
      checkoutCalled = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { url: "https://checkout.stripe.com/test-session" } }),
      });
    });

    await page.goto("/pricing");
    await page.getByTestId("pricing-plan-cta").first().click();

    await page.getByTestId("inline-checkout-email").fill("e2e@example.com");
    await page.getByTestId("inline-checkout-send").click();

    await expect(page.getByTestId("inline-checkout-code")).toBeVisible();
    await page.getByTestId("inline-checkout-code").fill("123456");
    await page.getByTestId("inline-checkout-verify").click();

    await expect.poll(() => checkoutCalled).toBe(true);
  });
});

test.describe("Pricing checkout (already logged in)", () => {
  test("logged-in visitors skip the inline capture entirely", async ({ page }) => {
    await page.route("**/api/auth/user", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "existing-user", email: "existing@example.com" }),
      })
    );
    let checkoutCalled = false;
    await page.route("**/api/checkout/credits", (route) => {
      checkoutCalled = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { url: "https://checkout.stripe.com/test-session" } }),
      });
    });

    await page.goto("/pricing");
    await page.getByTestId("pricing-plan-cta").first().click();

    // No inline email field should appear for an already-authenticated visitor
    await expect(page.getByTestId("inline-checkout-email")).not.toBeVisible();
    await expect.poll(() => checkoutCalled).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx playwright test tests/e2e/pricing-inline-checkout.spec.ts`
Expected: FAIL — `getByTestId("pricing-plan-cta")` finds nothing (current buttons have no `data-testid`), and the inline widget doesn't exist yet.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/pricing-inline-checkout.spec.ts
git commit -m "test: add failing E2E spec for inline pricing checkout"
```

---

## Task 3: Create the `InlineEmailCheckout` widget

**Files:**
- Create: `client/src/components/InlineEmailCheckout.tsx`

**Interfaces:**
- Consumes: `queryClient` from `@/lib/queryClient`, `useToast` from `@/hooks/use-toast`, `Turnstile` from `@marsidev/react-turnstile`, `Input`/`Button` from `@/components/ui/*` — all already used identically by `client/src/pages/login.tsx`.
- Produces: `export default function InlineEmailCheckout({ onVerified, onCancel }: { onVerified: () => void; onCancel: () => void })`. `onVerified` fires only after `verify-otp` succeeds AND the auth-user cache has been invalidated — Task 4 calls the plan's checkout handler from inside `onVerified`.

- [ ] **Step 1: Write the component**

```tsx
// client/src/components/InlineEmailCheckout.tsx
import { useRef, useState } from "react";
import { Loader2, Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Turnstile } from "@marsidev/react-turnstile";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface InlineEmailCheckoutProps {
  onVerified: () => void;
  onCancel: () => void;
}

export default function InlineEmailCheckout({ onVerified, onCancel }: InlineEmailCheckoutProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<any>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Please complete the CAPTCHA");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/email/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, ...(turnstileToken ? { turnstileToken } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        throw new Error(data.message || "Failed to send verification code");
      }
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Failed to send verification code");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!code || code.length !== 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/email/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Invalid verification code");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Verified", description: "Continuing to checkout..." });
      onVerified();
    } catch (err: any) {
      setError(err.message || "Invalid or expired code");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="inline-email-checkout">
      <AnimatePresence mode="wait">
        {step === "email" ? (
          <motion.form
            key="email-step"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            onSubmit={handleSendOtp}
            className="space-y-2.5"
          >
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 rounded-xl"
                autoFocus
                data-testid="inline-checkout-email"
              />
            </div>

            {TURNSTILE_SITE_KEY && (
              <div className="flex justify-center">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  onSuccess={setTurnstileToken}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => setTurnstileToken(null)}
                  options={{ theme: "auto", size: "compact" }}
                />
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2">
              <Button
                type="submit"
                className="flex-1 rounded-full font-semibold"
                disabled={isLoading || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
                data-testid="inline-checkout-send"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send code"}
              </Button>
              <Button type="button" variant="outline" className="rounded-full" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </motion.form>
        ) : (
          <motion.form
            key="otp-step"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            onSubmit={handleVerifyOtp}
            className="space-y-2.5"
          >
            <p className="text-xs text-muted-foreground">Code sent to <strong className="text-foreground">{email}</strong></p>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="rounded-xl text-center tracking-[0.3em] font-mono"
              autoFocus
              data-testid="inline-checkout-code"
            />

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2">
              <Button
                type="submit"
                className="flex-1 rounded-full font-semibold"
                disabled={isLoading || code.length !== 6}
                data-testid="inline-checkout-verify"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4 mr-1.5" />Verify</>}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => { setStep("email"); setCode(""); setError(null); }}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/InlineEmailCheckout.tsx
git commit -m "feat: add InlineEmailCheckout widget for frictionless pricing checkout"
```

---

## Task 4: Wire the widget into `PlanCard`

**Files:**
- Modify: `client/src/pages/Pricing.tsx:121-216` (`PlanCard` component)
- Modify: `client/src/pages/Pricing.tsx:1-13` (imports)

**Interfaces:**
- Consumes: `InlineEmailCheckout` from Task 3, `onSelect(plan, skipLoginCheck)` widened signature from Task 1.
- Produces: `PlanCard` now renders `InlineEmailCheckout` in place of its button for a logged-out visitor mid-capture; this is the last piece the E2E test from Task 2 needs to pass.

- [ ] **Step 1: Add the import**

At the top of `client/src/pages/Pricing.tsx`, add:

```tsx
import InlineEmailCheckout from '@/components/InlineEmailCheckout';
```

- [ ] **Step 2: Add capturing state and swap the CTA**

Replace the full `PlanCard` function body's closing button block. Current code (around lines 121-216):

```tsx
function PlanCard<T extends PlanCardData>({ plan, index, isLoggedIn, loading, onSelect, highlighted, available = true }: Readonly<{
  plan: T;
  index: number;
  isLoggedIn: boolean;
  loading: string | null;
  onSelect: (plan: T, skipLoginCheck?: boolean) => void;
  highlighted?: boolean;
  available?: boolean;
}>) {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.15 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      transition={{ ...spring, delay: index * 0.1 }}
      whileHover={{ y: -4, transition: { type: "spring", stiffness: 300, damping: 20 } }}
      className={`relative overflow-hidden flex flex-col theme-card bg-card ${
        highlighted ? 'ring-2 ring-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/20' :
        plan.popular ? 'border-primary lg:scale-105 z-10' : ''
      }`}
    >
      {/* ...unchanged badge/header/features blocks... */}

      <div className="p-6 pt-0 mt-auto">
        <motion.button
          {...tapScale}
          className="w-full py-3 px-4 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-full transition-colors disabled:opacity-50"
          onClick={() => onSelect(plan)}
          disabled={loading !== null}
        >
          {loading === plan.packageType ? (
            <span className="flex items-center justify-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-background"></div>
              Processing...
            </span>
          ) : !isLoggedIn ? (
            <span className="flex items-center justify-center gap-2">
              <LogIn className="w-4 h-4" />
              Login to Subscribe
            </span>
          ) : !available ? (
            'Coming soon'
          ) : (
            `Get ${plan.name}`
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
```

Replace the `p-6 pt-0 mt-auto` footer block with:

```tsx
      <div className="p-6 pt-0 mt-auto">
        {!isLoggedIn && capturing ? (
          <InlineEmailCheckout
            onVerified={() => { setCapturing(false); onSelect(plan, true); }}
            onCancel={() => setCapturing(false)}
          />
        ) : (
          <motion.button
            {...tapScale}
            className="w-full py-3 px-4 font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-full transition-colors disabled:opacity-50"
            onClick={() => (isLoggedIn ? onSelect(plan) : setCapturing(true))}
            disabled={loading !== null}
            data-testid="pricing-plan-cta"
          >
            {loading === plan.packageType ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-background"></div>
                Processing...
              </span>
            ) : !isLoggedIn ? (
              `Get ${plan.name}`
            ) : !available ? (
              'Coming soon'
            ) : (
              `Get ${plan.name}`
            )}
          </motion.button>
        )}
      </div>
```

And add the state hook right after the existing `useInView` line at the top of the function body:

```tsx
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.15 });
  const [capturing, setCapturing] = useState(false);
```

(`useState` is already imported in this file via `import { useState, ... } from 'react'` at the top — no new import needed for that.)

Note the CTA copy no longer says "Login to Subscribe" for logged-out visitors — it now reads "Get {plan.name}" identically to the logged-in state, since clicking it opens inline capture rather than announcing a login requirement. The `LogIn` icon import becomes unused after this change; leave the import alone only if it's still used elsewhere in the file (check with a grep in Step 3 below) — remove it if not, to avoid an unused-import lint warning.

- [ ] **Step 3: Check for now-unused `LogIn` import**

Run: `grep -n "LogIn" client/src/pages/Pricing.tsx`

If the only remaining match is the `import { ... LogIn, ... } from 'lucide-react'` line itself, remove `LogIn` from that import list. If it's still referenced elsewhere (e.g. the "Logged in as" banner further down the file), leave it.

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: no type errors.

- [ ] **Step 5: Run the Task 2 E2E spec to confirm it now passes**

Run: `npx playwright test tests/e2e/pricing-inline-checkout.spec.ts`
Expected: PASS — all three tests green.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Pricing.tsx
git commit -m "feat: wire InlineEmailCheckout into pricing plan cards, drop login redirect"
```

---

## Task 5: Consolidate the pricing layout behind an Annual/Monthly toggle

**Files:**
- Modify: `client/src/pages/Pricing.tsx:441-472` (the two stacked plan grids)
- Create: `tests/e2e/pricing-toggle.spec.ts`

**Interfaces:**
- Consumes: existing `annualPlans`, `notificationPlans` arrays, existing `handleSelectAnnual`/`handleSelectNotification`, existing `getPriceId` from `usePackagePrices` — nothing new.
- Produces: a `cadence` state (`'annual' | 'monthly'`) that this task alone owns; no other task depends on it.

- [ ] **Step 1: Write the failing E2E test**

```typescript
// tests/e2e/pricing-toggle.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Pricing billing cadence toggle", () => {
  test("defaults to annual pricing and hides the monthly grid", async ({ page }) => {
    await page.goto("/pricing");

    await expect(page.getByTestId("cadence-toggle-annual")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("£9.99")).toBeVisible();
    await expect(page.getByText("£24.99")).not.toBeVisible();
  });

  test("switching to monthly shows the monthly plans and hides annual", async ({ page }) => {
    await page.goto("/pricing");

    await page.getByTestId("cadence-toggle-monthly").click();

    await expect(page.getByTestId("cadence-toggle-monthly")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("£24.99")).toBeVisible();
    await expect(page.getByText("£9.99")).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx playwright test tests/e2e/pricing-toggle.spec.ts`
Expected: FAIL — both plan grids currently render simultaneously, so `£24.99` is already visible on load (violating the first test), and no `cadence-toggle-*` elements exist yet.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/e2e/pricing-toggle.spec.ts
git commit -m "test: add failing E2E spec for pricing cadence toggle"
```

- [ ] **Step 4: Replace the two stacked grids with a toggle-driven single section**

Current code (around lines 441-472):

```tsx
          <div className="max-w-3xl mx-auto mb-8">
            <div ref={planCardsRef} className="grid md:grid-cols-2 gap-6">
              {annualPlans.map((plan, index) => (
                <PlanCard
                  key={plan.packageType}
                  plan={plan}
                  index={index}
                  isLoggedIn={isLoggedIn}
                  loading={loading}
                  onSelect={handleSelectAnnual}
                  available={!!getPriceId(plan.packageType)}
                />
              ))}
            </div>
          </div>

          <div className="max-w-3xl mx-auto mb-16">
            <p className="text-center text-sm text-muted-foreground mb-4">Prefer to pay monthly instead?</p>
            <div className="grid md:grid-cols-2 gap-6">
              {notificationPlans.map((plan, index) => (
                <PlanCard
                  key={plan.packageType}
                  plan={plan}
                  index={index}
                  isLoggedIn={isLoggedIn}
                  loading={loading}
                  onSelect={handleSelectNotification}
                  highlighted={!!planParam && plan.packageType === `notification_${planParam}`}
                />
              ))}
            </div>
          </div>
```

Replace with:

```tsx
          <div className="max-w-3xl mx-auto mb-8">
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-1 bg-muted rounded-full p-1">
                <button
                  type="button"
                  onClick={() => setCadence('annual')}
                  aria-pressed={cadence === 'annual'}
                  data-testid="cadence-toggle-annual"
                  className={`px-5 py-2 text-sm font-semibold rounded-full transition-colors ${
                    cadence === 'annual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Annual
                </button>
                <button
                  type="button"
                  onClick={() => setCadence('monthly')}
                  aria-pressed={cadence === 'monthly'}
                  data-testid="cadence-toggle-monthly"
                  className={`px-5 py-2 text-sm font-semibold rounded-full transition-colors ${
                    cadence === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>

            {cadence === 'annual' ? (
              <div ref={planCardsRef} className="grid md:grid-cols-2 gap-6">
                {annualPlans.map((plan, index) => (
                  <PlanCard
                    key={plan.packageType}
                    plan={plan}
                    index={index}
                    isLoggedIn={isLoggedIn}
                    loading={loading}
                    onSelect={handleSelectAnnual}
                    available={!!getPriceId(plan.packageType)}
                  />
                ))}
              </div>
            ) : (
              <div ref={planCardsRef} className="grid md:grid-cols-2 gap-6">
                {notificationPlans.map((plan, index) => (
                  <PlanCard
                    key={plan.packageType}
                    plan={plan}
                    index={index}
                    isLoggedIn={isLoggedIn}
                    loading={loading}
                    onSelect={handleSelectNotification}
                    highlighted={!!planParam && plan.packageType === `notification_${planParam}`}
                  />
                ))}
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground mt-4">
              {cadence === 'annual'
                ? 'Annual plans monitor fewer companies per tier in exchange for a lower yearly price. Switch to Monthly for higher company limits.'
                : 'Monthly plans cost more per year but monitor more companies per tier. Switch to Annual for the lowest entry price.'}
            </p>
          </div>
```

- [ ] **Step 5: Add the `cadence` state**

Near the other `useState` calls at the top of the `Pricing` component (around line 225), add:

```tsx
  const [cadence, setCadence] = useState<'annual' | 'monthly'>('annual');
```

If `?plan=` is present in the URL (existing `planParam`), default to monthly instead, since that query param only ever targets `notification_starter`/`notification_pro`:

```tsx
  const [cadence, setCadence] = useState<'annual' | 'monthly'>(planParam ? 'monthly' : 'annual');
```

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: no type errors.

- [ ] **Step 7: Run the Task 5 E2E spec to confirm it now passes**

Run: `npx playwright test tests/e2e/pricing-toggle.spec.ts`
Expected: PASS.

- [ ] **Step 8: Re-run the Task 2 spec to confirm no regression**

Run: `npx playwright test tests/e2e/pricing-inline-checkout.spec.ts`
Expected: PASS (the `pricing-plan-cta` testid is on both grids' `PlanCard` instances, so this still finds a button regardless of which cadence is active).

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/Pricing.tsx
git commit -m "feat: consolidate pricing into a single Annual/Monthly toggle layout"
```

---

## Task 6: Full regression pass and visual check

**Files:** none (verification-only task)

- [ ] **Step 1: Run the full E2E suite**

Run: `npx playwright test`
Expected: all specs pass, including the pre-existing `journey1`/`journey2`/`journey3` suites (unaffected by this change) and the two new specs from Tasks 2 and 5.

- [ ] **Step 2: Run the full typecheck and unit suite**

Run: `npm run check && npm run test:run`
Expected: no errors; existing 395+ server-side tests still pass (this plan touched no server code).

- [ ] **Step 3: Manual visual check at responsive breakpoints**

Start the dev server (`npm run dev`) and, in a browser, load `/pricing` at 320px, 768px, 1024px, and 1440px widths. Confirm:
- The Annual/Monthly toggle is centered and doesn't wrap awkwardly at 320px.
- Only one plan grid is visible at a time.
- Clicking a CTA while logged out expands the inline email field without any layout jump that pushes the toggle off-screen.

This is a manual check, not an automated visual-regression suite — this repo has no visual-regression tooling (Percy/Chromatic) configured, and adding one is out of scope for this plan.

- [ ] **Step 4: Final commit (if Step 3 surfaced fixes)**

If Step 3 required any CSS/layout adjustments, commit them:

```bash
git add client/src/pages/Pricing.tsx client/src/components/InlineEmailCheckout.tsx
git commit -m "fix: responsive polish for pricing toggle and inline checkout"
```

If no fixes were needed, skip this step — nothing to commit.
