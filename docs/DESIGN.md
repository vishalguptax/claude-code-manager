---
name: Claude Manager
description: Marketing landing page for the Claude Manager VS Code extension. Dark workbench surface, one warm clay accent.
colors:
  claude-clay: "#e08a63"
  claude-clay-deep: "#d97757"
  clay-ink: "#1a1009"
  workbench-bg: "#14141f"
  workbench-panel: "#1a1a2e"
  surface: "#1f2138"
  surface-raised: "#262945"
  border: "#33365a"
  ink: "#eef0ff"
  muted: "#aab0d6"
  focus-blue: "#8ab4ff"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(2.1rem, 5vw, 3.4rem)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(1.6rem, 3.5vw, 2.3rem)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.18rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.04em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.92rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "9px"
  md: "11px"
  lg: "14px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.claude-clay}"
    textColor: "{colors.clay-ink}"
    rounded: "{rounded.md}"
    padding: "12px 22px"
  button-primary-hover:
    backgroundColor: "{colors.claude-clay-deep}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 22px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.lg}"
    padding: "24px"
  install-cmd:
    backgroundColor: "#0e0e18"
    textColor: "#cfe3ff"
    rounded: "{rounded.md}"
    padding: "13px 16px"
---

# Design System: Claude Manager

## 1. Overview

**Creative North Star: "The Local Workbench"**

Claude Manager lives inside the editor, so its marketing surface should feel like the editor: a quiet, dark workbench where the work, not the chrome, is the subject. The page is a deep navy field (`#14141f`) lit by a single warm tool-light, Claude Clay (`#e08a63`). That one accent does all the pointing, primary buttons, the word "Claude Code" in the headline, icon glyphs, focus states, and its scarcity is the whole point. Nothing else competes for attention.

The voice is precise, local, honest, carried straight from PRODUCT.md. The page shows real extension screenshots and the real demo rather than illustration, because specificity is the credibility. It rejects the saturated AI-landing reflexes by name: no cream/sand background, no gradient-text hero, no tiny uppercase eyebrow stacked above every section, no purple-gradient crypto-hype drench, no fade-in-on-everything choreography. Depth comes from tonal layering of near-black navies, not from glassmorphism or heavy shadows.

This is a developer artifact first. If a developer who lives in VS Code can't tell within a second that this was built by someone who uses Claude Code daily and respects their machine, the page has failed.

**Key Characteristics:**
- Dark workbench field with exactly one warm accent (Claude Clay)
- Real product screenshots, never illustration or mockup
- Tonal navy layering for depth; restraint over shadow
- Inter throughout, weight contrast over font count
- Motion only as state feedback, never as decoration

## 2. Colors

A near-black navy workbench lit by a single warm clay accent; everything between is a tonal step of the same cool field.

### Primary
- **Claude Clay** (`#e08a63`): The one warm signal in the dark. Primary buttons, the accent word in the hero, feature-card icon glyphs, FAQ markers, links. Used on roughly 10% of any screen, no more.
- **Claude Clay Deep** (`#d97757`): Hover state for clay surfaces only. Never a resting color.
- **Clay Ink** (`#1a1009`): Near-black text that sits on clay fills (primary button label) to hold AA contrast.

### Neutral
- **Workbench BG** (`#14141f`): The page field. Carries a faint top radial glow toward `#21243f`.
- **Workbench Panel** (`#1a1a2e`): The brand navy; gradient partner for card bottoms and the sticky header.
- **Surface** (`#1f2138`): Resting fill for cards and FAQ panels.
- **Surface Raised** (`#262945`): The nav "Install" chip and other slightly-lifted controls.
- **Border** (`#33365a`): Hairline (1px) dividers, card edges, input strokes. The default separator.
- **Ink** (`#eef0ff`): Primary text. ~13:1 on the workbench field.
- **Muted** (`#aab0d6`): Secondary text, lede, captions. Tuned to clear 4.5:1 on the dark field, not a washed light gray.
- **Focus Blue** (`#8ab4ff`): Cool counter-accent reserved exclusively for the focus ring, so focus never reads as a clay hover.

### Named Rules
**The One Warm Light Rule.** Claude Clay is the only warm hue on the page and appears on no more than ~10% of any screen. Every additional warm element steals from the signal. If two clay things sit side by side competing, one of them is wrong.

**The Hairline Rule.** Borders are 1px, color `#33365a`, full perimeter only. A thicker or colored edge is never the answer.

## 3. Typography

**Display Font:** Inter (with system-ui, -apple-system, Segoe UI fallback)
**Body Font:** Inter (same family, lighter weights)
**Label/Mono Font:** JetBrains Mono (install command, inline code)

**Character:** One humanist-geometric sans doing the whole job through weight contrast (400 body against 800 display), paired only with a mono for code. No competing second sans. The personality is engineering-precise, not expressive.

### Hierarchy
- **Display** (800, clamp 2.1–3.4rem, lh 1.15, ls -0.02em): The hero H1 only. `text-wrap: balance` recommended.
- **Headline** (800, clamp 1.6–2.3rem, lh 1.15): Section titles (`Everything Claude Code, one click away`).
- **Title** (700, 1.18rem): Feature-card and component headings.
- **Body** (400, 1rem, lh 1.6): Paragraphs and card copy. Lede capped at ~38ch; prose capped 65–75ch.
- **Label** (600, 0.85rem, ls 0.04em, uppercase): The single hero eyebrow (`Free · 100% local · Zero telemetry`) and small chips. Reserved for short strings only.

### Named Rules
**The One Eyebrow Rule.** The uppercase tracked label appears once, in the hero. It is forbidden above every section; repeating it is the AI-scaffold tell this brand rejects.

**The Weight-Not-Family Rule.** New hierarchy comes from Inter weight (400 / 500 / 600 / 700 / 800), never from adding a third typeface.

## 4. Elevation

Flat by default, with depth built from tonal navy layering rather than shadow. Cards are a top-to-bottom gradient from `#1f2138` to `#1a1a2e` against the darker field, which reads as a raised panel without a visible cast shadow. Shadows appear only on genuinely floating media (the hero demo, screenshots) as a deep, soft, near-black ambient pool, never as a hard drop.

### Shadow Vocabulary
- **Hero float** (`box-shadow: 0 30px 70px -30px rgba(0,0,0,.7)`): Hero demo image only. A deep diffuse pool that lifts it off the field.
- **Screenshot float** (`box-shadow: 0 18px 44px -24px rgba(0,0,0,.7)`): Screenshot figures. A lighter version of the same pool.

### Named Rules
**The Tonal-Depth Rule.** Depth is a lighter navy, not a shadow. Reach for a `box-shadow` only when an element genuinely floats above the page (media); for panels, step the surface tone instead.

## 5. Components

Buttons, cards and controls are precise and restrained: subtle borders, a small lift on hover, no flashy fills. Confidence through quiet.

### Buttons
- **Shape:** Gently rounded (11px / `rounded.md`), min-height 48px for touch.
- **Primary:** Claude Clay fill (`#e08a63`) with Clay Ink text (`#1a1009`), padding 12px 22px.
- **Ghost:** Transparent with a 1px border (`#33365a`) and Ink text; border shifts to clay on hover.
- **Hover / Focus:** `translateY(-2px)` lift on a 180ms ease-out curve; primary deepens to `#d97757`. Focus shows the 3px Focus Blue ring at 2px offset.

### Cards (feature grid)
- **Corner Style:** 14px (`rounded.lg`).
- **Background:** Vertical gradient `#1f2138` → `#1a1a2e`.
- **Shadow Strategy:** None at rest (see Elevation, Tonal-Depth Rule).
- **Border:** 1px `#33365a`, shifting to Claude Clay on hover alongside a `translateY(-4px)` lift.
- **Internal Padding:** 24px (`spacing.lg`). Icon sits in a 44px clay-tinted (`rgba(224,138,99,.13)`) rounded tile.

### Inputs / Code
- **Install command:** Darkest surface (`#0e0e18`), 1px border, 10px radius, JetBrains Mono in cool `#cfe3ff`, horizontally scrollable. A display affordance, not an editable field.

### FAQ Disclosure
- **Style:** Native `<details>` on Surface (`#1f2138`), 1px border, 11px radius.
- **State:** A clay `+` marker rotates 45° to `×` on open. No JS; native semantics keep it keyboard-accessible.

### Navigation
- **Style:** Sticky, blurred translucent panel (`rgba(20,20,31,.78)` + backdrop blur) over a 1px bottom border.
- **States:** Muted links brighten to Ink on hover; the Install chip is Surface Raised with a clay border on hover. Below 820px, secondary links hide and only the Install chip remains.

## 6. Do's and Don'ts

### Do:
- **Do** keep Claude Clay (`#e08a63`) to ~10% of any screen; it is the only warm hue (The One Warm Light Rule).
- **Do** build depth from tonal navy steps (`#14141f` → `#1a1a2e` → `#1f2138` → `#262945`); reserve `box-shadow` for floating media.
- **Do** use real extension screenshots and the real demo; specificity is the credibility.
- **Do** drive hierarchy with Inter weight contrast (400 vs 800), never a third typeface.
- **Do** give every interactive element the 3px Focus Blue (`#8ab4ff`) ring and a `prefers-reduced-motion` fallback.
- **Do** keep body/muted text (`#aab0d6`) at >=4.5:1 on the dark field; bump toward Ink if it drifts close.

### Don't:
- **Don't** ship the generic SaaS template: no cream/sand background, no identical icon-card grids beyond the one deliberate feature set, no tiny uppercase eyebrow above every section (The One Eyebrow Rule).
- **Don't** use gradient text (`background-clip: text`); the accent word is a solid `#e08a63`.
- **Don't** drift toward crypto/AI hype: no neon glow, no purple-gradient drench, no buzzwords (supercharge / unleash / next-generation), no fake urgency.
- **Don't** over-animate: no scroll-jacking, no uniform fade-in on every section, no parallax. Motion is state feedback only.
- **Don't** use a colored or >1px side-stripe border; borders are 1px full-perimeter `#33365a` (The Hairline Rule).
- **Don't** use glassmorphism anywhere except the one sticky-nav blur, which is functional, not decorative.
- **Don't** write em dashes in page copy; use commas, colons, or periods.
