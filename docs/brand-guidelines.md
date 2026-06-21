# Brand Guidelines v1.0 — Checkbyai

> Last updated: 2026-06-21
> Status: Published

## Quick Reference

| Element | Value |
|---------|-------|
| Primary Color | #3434B2 (indigo) |
| Secondary Color | #E9E9F2 (gray) |
| Primary Font | system-ui, -apple-system, sans-serif |
| Voice | Professional, Authoritative, Clear |

---

## 1. Color Palette

### Primary Colors

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| **Primary Indigo** | #3434B2 | hsl(240, 55%, 45%) | CTAs, headers, links, active states |
| **Primary Light** | #EAEAF6 | hsl(240, 40%, 94%) | Accent backgrounds |
| **Primary Dark** | #171A36 | hsl(235, 40%, 15%) | Deep navy, headings |

### Secondary Colors

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| **Secondary Gray** | #E9E9F2 | hsl(235, 25%, 93%) | Secondary buttons, subtle surfaces |
| **Secondary Light** | #EDEDF3 | hsl(235, 20%, 94%) | Muted backgrounds |
| **Secondary Dark** | #67697E | hsl(235, 10%, 45%) | Muted text, captions |

### Accent Colors

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| **Accent Lavender** | #C6C6EC | hsl(240, 50%, 85%) | Gradient endpoints, decorative |
| **Accent Light** | #EDEDF7 | hsl(240, 40%, 95%) | Soft gradient variant |
| **Accent Mid** | #313181 | hsl(240, 45%, 35%) | Gradient midpoint |

### Neutral Palette (Light)

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| Background | #F9F9FB | hsl(240, 20%, 98%) | Page backgrounds |
| Foreground | #171A36 | hsl(235, 40%, 15%) | Headings, body text |
| Muted | #EDEDF3 | hsl(235, 20%, 94%) | Subtle backgrounds |
| Muted Foreground | #67697E | hsl(235, 10%, 45%) | Captions, muted text |
| Card | #FFFFFF | hsl(0, 0%, 100%) | Cards, sections |
| Border | #E0E1EB | hsl(235, 20%, 90%) | Dividers, borders |
| Input | #E0E1EB | hsl(235, 20%, 90%) | Form inputs |

### Neutral Palette (Dark)

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| Background | #0D0E17 | hsl(235, 25%, 7%) | Page backgrounds |
| Foreground | #EDEDF2 | hsl(240, 20%, 95%) | Headings, body text |
| Muted | #191B24 | hsl(235, 18%, 13%) | Subtle backgrounds |
| Card | #14151F | hsl(235, 20%, 10%) | Cards, sections |
| Border | #242630 | hsl(235, 15%, 18%) | Dividers, borders |

### Brand Gradient

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| Gradient Start | #171A36 | hsl(235, 40%, 15%) | Hero backgrounds, premium sections |
| Gradient Mid | #313181 | hsl(240, 45%, 35%) | Gradient midpoint |
| Gradient End | #C6C6EC | hsl(240, 50%, 85%) | Gradient endpoint |
| Gradient Light | #EDEDF7 | hsl(240, 40%, 95%) | Soft gradient variant |

### Semantic Colors

| State | Hex | Usage |
|-------|-----|-------|
| Destructive | #EF4343 | Errors, destructive actions |
| Success | #10B981 | Positive actions, confirmations |
| Warning | #F59E0B | Cautions, pending states |
| Info | #6366F1 | Informational messages |

### Accessibility

- Primary on background: meets WCAG 2.1 AA
- Text on white background: meets AA/AAA
- All interactive elements maintain minimum 3:1 contrast against adjacent colors
- Focus ring uses primary color at full opacity

---

## 2. Typography

### Font Stack

```css
--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
```

### Type Scale

| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| Editorial Heading | 48px | 700 | 1.05 |
| Editorial Subheading | 28px | 600 | 1.15 |
| H1 | 36px | 700 | 1.2 |
| H2 | 28px | 600 | 1.25 |
| H3 | 24px | 600 | 1.3 |
| Body | 16px | 400 | 1.65 |
| Small | 14px | 400 | 1.5 |
| Caption (editorial) | 11px | 600 | 1.4 |

### Editorial Utilities

| Class | Usage |
|-------|-------|
| `.editorial-heading` | Letter-spacing -0.03em, bold, tight leading |
| `.editorial-subheading` | Letter-spacing -0.015em, semi-bold |
| `.editorial-body` | Letter-spacing 0.005em, relaxed leading 1.65 |
| `.editorial-caption` | Uppercase, letter-spacing 0.06em, semi-bold |

### Font Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
```

System font stack used; no external font dependencies required.

---

## 3. Logo Usage

### Primary Logo

| Usage | File | Location |
|-------|------|----------|
| Site header, footer, hero, login, dashboard | `logo_material.png` | `attached_assets/logo_material.png` |
| SEO / JSON-LD structured data | `checkbyai-logo.png` | `client/public/checkbyai-logo.png` |
| Open Graph / Social preview | `og-image.png` | `client/public/og-image.png` |
| Favicon (32x32) | `favicon-32x32.png` | `client/public/favicon-32x32.png` |
| Favicon (16x16) | `favicon-16x16.png` | `client/public/favicon-16x16.png` |
| Apple touch icon | `apple-touch-icon.png` | `client/public/apple-touch-icon.png` |
| PWA icon (192x192) | `icon-192x192.png` | `client/public/icon-192x192.png` |
| PWA icon (512x512) | `icon-512x512.png` | `client/public/icon-512x512.png` |

### Logo Path (Component)

```typescript
import logo from "@assets/logo_material.png";
```

### Don'ts

- Don't rotate or skew the logo
- Don't change colors outside approved palette
- Don't add shadows or effects
- Don't crop or modify proportions
- Don't place on busy backgrounds without sufficient contrast

---

## 4. Voice & Tone

### Brand Personality

| Trait | Description |
|-------|-------------|
| **Professional** | Expert knowledge in immigration compliance, authoritative yet accessible |
| **Authoritative** | Data-backed, regulatory confidence, trustworthy source |
| **Clear** | Direct communication, plain English for complex visa rules |
| **Confident** | Assured without being arrogant; precise without being pedantic |

### Voice Chart

| Trait | We Are | We Are Not |
|-------|--------|------------|
| Professional | Knowledgeable, regulatory-aware | Stuffy, opaque |
| Authoritative | Data-driven, trustworthy | Arrogant, fear-mongering |
| Clear | Direct, concise, plain English | Jargon-heavy, vague |
| Confident | Assured, transparent | Over-promising, pushy |

### Tone by Context

| Context | Tone | Example |
|---------|------|---------|
| Marketing | Benefit-focused, authoritative | "Real-time sponsor licence monitoring for UK employers." |
| Search results | Informative, precise | "Check if a UK employer holds a valid sponsor licence." |
| Dashboard | Clear, data-presenting | "5 changes detected in today's Home Office register update." |
| Notifications | Urgent, actionable | "Sponsor licence status changed — review required." |
| Errors | Calm, solution-focused | "Unable to load register data. Retrying automatically." |

### Domain-Specific Language

- Use **"sponsor licence"** (UK Home Office terminology)
- Use **"Certificate of Sponsorship (CoS)"** on first mention, then "CoS"
- Refer to **"Home Office register of licensed sponsors"** as the data source
- Avoid: "visa sponsor" (imprecise), "green card" (US term)

### Prohibited Terms

| Avoid | Use Instead |
|-------|-------------|
| Revolutionary | — |
| Best-in-class | Home Office-registered, verified |
| Seamless | Automatic, real-time |
| Guaranteed | Checked, verified (we don't guarantee outcomes) |

---

## 5. Imagery & Design

### Card System

| Class | Usage |
|-------|-------|
| `.theme-card` | Standard card with border + subtle shadow |
| `.theme-card:hover` | Elevated card with primary border on hover |
| `.glass-card` | Glassmorphism variant for premium sections |
| `.brutalist-border` | Simple bordered container |
| `.brutalist-border-strong` | Primary-colored bordered container |

### Gradient Classes

| Class | Direction |
|-------|-----------|
| `.theme-gradient` | 180° (top to bottom) |
| `.theme-gradient-soft` | 180° light variant |
| `.theme-gradient-reverse` | 0° (bottom to top) |
| `.theme-gradient-horizontal` | 90° (left to right) |

### Glow Variants

| Variant | Color |
|---------|-------|
| `.glow-red` | rgba(239, 68, 68, 0.15) |
| `.glow-amber` | rgba(245, 158, 11, 0.15) |
| `.glow-teal` | rgba(20, 184, 166, 0.15) |
| `.glow-indigo` | rgba(99, 102, 241, 0.15) |

### Animations

| Name | Duration | Usage |
|------|----------|-------|
| `float` | 4s | Decorative elements |
| `spin-slow` | 8s | Loading indicators |
| `shimmer` | 3s | Loading skeletons |
| `pulse-glow` | 2s | Interactive elements |
| `scan-line` | 2.5s | Document scanning effect |
| `slide-up-fade` | 0.3s | Content entrance |

### Accessibility

- Respect `prefers-reduced-motion`: all decorative animations disabled
- Minimum tap target: 44x44px on mobile (enforced globally)
- Focus indicators: primary color ring
- Semantic HTML with proper heading hierarchy

---

## 6. Spacing & Layout

### Border Radius

| Element | Radius |
|---------|--------|
| Default radius | 0.75rem (12px) |
| Buttons | Use default radius |
| Cards | Use default radius |
| Inputs | Use default radius |
| Pills | 9999px |

---

## AI Image Generation

### Base Prompt Template

```
Professional UK compliance technology brand, deep navy blue gradient background (hsl(235,40%,15%) to hsl(240,45%,35%)), clean modern UI elements, subtle glassmorphism, data visualization, {DESCRIPTION}
```

### Style Keywords

| Category | Keywords |
|----------|----------|
| **Lighting** | Soft, professional, evenly lit |
| **Mood** | Professional, authoritative, trustworthy, modern |
| **Composition** | Clean, minimal, data-focused, centered |
| **Treatment** | High contrast, crisp, polished |

### Visual Don'ts

| Avoid | Reason |
|-------|--------|
| Doodle-style illustrations | Doesn't fit professional compliance brand |
| Amateurish clip art | Undermines authority |
| Red-only color schemes | Conflicts with destructive/error association |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-21 | Initial guidelines from existing codebase theme |
