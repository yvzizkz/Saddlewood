# Accessibility Audit: Saddlewood Contracting (Next.js Rebuild)

**Standard:** WCAG 2.1 AA | **Date:** March 6, 2026
**Scope:** Full code review of `saddlewood-site` Next.js/Tailwind codebase (pre-deployment)

---

## Summary

**Issues found: 19** | **Critical: 3** | **Major: 8** | **Minor: 8**

The site has a strong accessibility foundation — `lang="en"`, skip link, focus-visible styles, `prefers-reduced-motion` support, and proper form labeling are already in place. The primary issues are color contrast failures (especially gold-on-light text), missing keyboard operability on interactive components, and some missing ARIA patterns.

---

## Findings

### 1. Perceivable

| # | Issue | WCAG Criterion | Severity | File(s) | Recommendation |
|---|-------|---------------|----------|---------|----------------|
| 1 | **Gold (#C49A3C) on light backgrounds fails contrast** — section labels on off-white (2.50:1), cream (2.42:1), and white (2.61:1). Required: 4.5:1 for normal text, 3.0:1 for large text. These are 11px uppercase labels — small text, so 4.5:1 applies. | 1.4.3 Contrast (Minimum) | 🔴 Critical | `globals.css` (.section-label), `ServicesGrid`, `WorkShowcase`, `NeighborhoodCards`, `Testimonials`, `WhySaddlewood`, `BeforeAfter` | Darken gold to **#8B6914** (ratio ≈ 5.2:1 on off-white) or add a darker background behind section labels. Alternatively, increase font-size to 14px+ and weight to 700 to qualify as "large text" (3.0:1 threshold). |
| 2 | **white/50 (#808080) on teal-dark** fails at 4.01:1. Used for CTA banner subtitle text at 15px normal weight. | 1.4.3 Contrast | 🔴 Critical | `CTABanner.tsx` line 19 | Change `text-white/50` to `text-white/60` (5.55:1) for the subtitle paragraph. |
| 3 | **Footer link text (stone/55)** at 4.33:1 narrowly fails AA for normal text. | 1.4.3 Contrast | 🟡 Major | `Footer.tsx` lines 35, 51, 63, 73-74 | Change `text-stone/55` to `text-stone/60` (~4.7:1) or `text-stone/65` to pass comfortably. |
| 4 | **Neighborhood card tagline text (white/50)** on dark gradient overlay — estimated ~3.6:1, fails for normal text. | 1.4.3 Contrast | 🟡 Major | `NeighborhoodCards.tsx` line 72 | Change `text-white/50` to `text-white/65` or higher. |
| 5 | **BeforeAfter slider uses background-image** instead of `<img>` — no alt text for before/after photos. Screen readers have no way to understand the image content. | 1.1.1 Non-text Content | 🟡 Major | `BeforeAfter.tsx` lines 58-68 | Add `role="img"` and `aria-label` to each background-image div describing the before/after scene, OR switch to `<Image>` components with proper `alt`. |
| 6 | **Neighborhood card images have non-descriptive alt text** — just the neighborhood name (e.g., "McCormick Ranch") rather than what's actually shown. | 1.1.1 Non-text Content | 🟢 Minor | `NeighborhoodCards.tsx` line 62 | Use descriptive alts like "Modern kitchen interior in McCormick Ranch home". |
| 7 | **Decorative line/bar elements** (gold lines, dividers) use empty `<span>` and `<div>` elements without `aria-hidden="true"`. | 1.1.1 Non-text Content | 🟢 Minor | `HeroSection.tsx` line 38, `ContactForm.tsx` lines 93/331, `ProcessTimeline.tsx` line 73 | Add `aria-hidden="true"` to purely decorative line elements. |

### 2. Operable

| # | Issue | WCAG Criterion | Severity | File(s) | Recommendation |
|---|-------|---------------|----------|---------|----------------|
| 8 | **Neighborhoods dropdown not keyboard-accessible** — opens on `onMouseEnter` only. Keyboard users cannot open the submenu. | 2.1.1 Keyboard | 🔴 Critical | `Navbar.tsx` lines 94-95 | Add `onFocus`/`onBlur` handlers (or `onKeyDown` for Enter/Space/ArrowDown) to toggle `hoodOpen`. Also add `onKeyDown` with Escape to close. |
| 9 | **Dropdown menu items not keyboard-navigable** — no arrow key support within the `role="menu"` container. Items have `role="menuitem"` but no keyboard handling for Up/Down arrows. | 2.1.1 Keyboard | 🟡 Major | `Navbar.tsx` lines 113-126 | Implement arrow key navigation per WAI-ARIA Menu pattern: Up/Down to move between items, Escape to close, focus management via `tabIndex` and refs. |
| 10 | **BeforeAfter slider not keyboard-operable** — only responds to mouse drag and touch. Keyboard users cannot adjust the slider position. | 2.1.1 Keyboard | 🟡 Major | `BeforeAfter.tsx` lines 47-103 | Add `role="slider"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="Compare before and after"`, `tabIndex={0}`, and Left/Right arrow key handlers. |
| 11 | **ProjectGrid cards use `onClick` on a div** — not focusable by keyboard, no semantic button or link. | 2.1.1 Keyboard | 🟡 Major | `ProjectGrid.tsx` line 169 | Wrap each card in a `<button>` or add `role="button"`, `tabIndex={0}`, and `onKeyDown` (Enter/Space) handler. |
| 12 | **ProjectGrid modal has no focus trap** — when the modal opens, Tab can move focus behind the modal. | 2.4.3 Focus Order | 🟡 Major | `ProjectGrid.tsx` lines 196-277 | Implement focus trapping (e.g., using a custom hook or library). Also set initial focus to the modal or close button on open. |
| 13 | **ProjectGrid modal has no Escape key handler** to close. | 2.1.1 Keyboard | 🟢 Minor | `ProjectGrid.tsx` lines 196-277 | Add `onKeyDown` handler for Escape key that calls `setSelectedProject(null)`. |
| 14 | **Mobile menu has no focus trap** or Escape-to-close. | 2.4.3 Focus Order | 🟡 Major | `Navbar.tsx` lines 161-219 | Trap focus within the mobile menu while open. Add Escape key to close. Move focus to the menu toggle on close. |
| 15 | **ServicesGrid list items have `cursor-pointer` and hover effects** but are not interactive elements — misleading affordance. | 2.1.1 Keyboard | 🟢 Minor | `ServicesGrid.tsx` lines 33-49 | Either make them actual links to service detail sections/pages, or remove cursor-pointer and hover-pl styling. |

### 3. Understandable

| # | Issue | WCAG Criterion | Severity | File(s) | Recommendation |
|---|-------|---------------|----------|---------|----------------|
| 16 | **Contact form error message is generic** — no per-field validation messages. When submission fails, only a generic error appears; individual required fields just use browser-native validation. | 3.3.1 Error Identification | 🟢 Minor | `ContactForm.tsx` lines 241-247 | Add inline error messages per field (e.g., "Name is required") with `aria-describedby` linking each input to its error. Also add `aria-live="polite"` to the error region. |
| 17 | **Success message not announced to screen readers** — the success state replaces the form but there's no `aria-live` region or focus management to alert assistive technology. | 3.3.1 Error Identification | 🟢 Minor | `ContactForm.tsx` lines 103-115 | Wrap the success message in `role="status"` or `aria-live="polite"`, and move focus to it on success. |
| 18 | **ProcessTimeline step buttons lack `aria-controls`** — the buttons change visible content but don't identify what panel they control. | 4.1.2 Name, Role, Value | 🟢 Minor | `ProcessTimeline.tsx` lines 104-143 | Add `aria-controls="step-panel"` to each step button and `id="step-panel"` to the content area. Consider `aria-selected` or `aria-current="step"`. |

### 4. Robust

| # | Issue | WCAG Criterion | Severity | File(s) | Recommendation |
|---|-------|---------------|----------|---------|----------------|
| 19 | **Mobile accordion buttons in ProcessTimeline lack `aria-expanded`** — they toggle content but don't communicate expanded/collapsed state. | 4.1.2 Name, Role, Value | 🟢 Minor | `ProcessTimeline.tsx` lines 227-268 | Add `aria-expanded={isActive}` to each mobile step `<button>`. |

---

## Color Contrast Check

| Element | Foreground | Background | Ratio | Required | Pass? |
|---------|-----------|------------|-------|----------|-------|
| Nav links (default) | #CCCCCC (white/80) | #0F2530 | 9.85:1 | 4.5:1 | ✅ |
| Hero h1 | #FFFFFF | #0F2530 | 15.82:1 | 4.5:1 | ✅ |
| Hero subtitle | #999999 (white/60) | #0F2530 | 5.55:1 | 4.5:1 | ✅ |
| CTA banner subtitle | #808080 (white/50) | #0F2530 | 4.01:1 | 4.5:1 | ❌ |
| Gold section labels | #C49A3C | #FAFAF7 | 2.50:1 | 4.5:1 | ❌ |
| Gold section labels | #C49A3C | #F9F6F0 | 2.42:1 | 4.5:1 | ❌ |
| Gold on white | #C49A3C | #FFFFFF | 2.61:1 | 4.5:1 | ❌ |
| Gold on teal-dark | #C49A3C | #0F2530 | 6.05:1 | 4.5:1 | ✅ |
| CTA button text | #0F2530 | #C49A3C | 6.05:1 | 4.5:1 | ✅ |
| Body text on cream | #2A2A2A | #F9F6F0 | 13.31:1 | 4.5:1 | ✅ |
| Secondary text on cream | #5A5A5A | #F9F6F0 | 6.39:1 | 4.5:1 | ✅ |
| Headings on cream | #1B3A4B | #F9F6F0 | 11.10:1 | 4.5:1 | ✅ |
| Footer links | ~stone/55 | #0F2530 | 4.33:1 | 4.5:1 | ❌ |
| Footer headings | ~stone/40 | #0F2530 | 5.16:1 | 4.5:1 | ✅ |
| Neighborhood tagline | #808080 (white/50) | ~#152D3B | 3.62:1 | 4.5:1 | ❌ |

---

## What's Already Done Well

These are significant and show strong accessibility awareness in the build:

- ✅ `<html lang="en">` — correct language attribute
- ✅ Skip-to-main-content link in Navbar
- ✅ `<main id="main-content">` landmark wrapping page content
- ✅ Semantic `<nav>`, `<footer role="contentinfo">`, `<section>` landmarks with `aria-label`
- ✅ Proper heading hierarchy (single h1 per page, h2 for sections, h3 for items)
- ✅ All `<img>` tags have `alt` attributes; decorative logo images use `alt=""`
- ✅ Contact form has `<label htmlFor>` properly linking every input
- ✅ `aria-expanded` on desktop dropdown button and mobile menu toggle
- ✅ `role="dialog"` and `aria-modal="true"` on mobile menu and project modal
- ✅ Focus-visible styles defined globally via `*:focus-visible`
- ✅ `prefers-reduced-motion` media query disabling all animations
- ✅ `prefers-contrast: high` media query adjusting colors
- ✅ Body scroll lock when mobile menu is open
- ✅ `autoComplete` attributes on form inputs
- ✅ Descriptive `alt` text on portfolio/project images

---

## Priority Fixes

### 🔴 Critical (Fix Before Launch)

1. **Darken gold section label text on light backgrounds** — affects every page, every section. The gold-on-cream/off-white/white fails at ~2.5:1 (needs 4.5:1). Suggested fix: use `#8B6914` for section labels on light bgs, or increase size to qualify as large text.

2. **Make Neighborhoods dropdown keyboard-accessible** — currently mouse-only. Add focus/blur and keydown handlers so keyboard and screen reader users can open and navigate the submenu.

3. **Bump CTA banner subtitle from white/50 to white/60** — one-line CSS change to pass contrast.

### 🟡 Major (Fix Soon After Launch)

4. **Add keyboard support to BeforeAfter slider** — implement `role="slider"` with arrow key control.
5. **Make ProjectGrid cards keyboard-focusable** — wrap in `<button>` or add proper ARIA.
6. **Add focus trap to ProjectGrid modal and mobile menu** — prevent tab from escaping.
7. **Add alt text to BeforeAfter background images** — use `role="img"` + `aria-label`.
8. **Increase footer link contrast** — bump from stone/55 to stone/60+.

### 🟢 Minor (Polish)

9. Add `aria-hidden="true"` to decorative elements.
10. Add `aria-expanded` to ProcessTimeline mobile accordion buttons.
11. Add `aria-live` to contact form success/error states.
12. Improve neighborhood card alt text to be descriptive.
