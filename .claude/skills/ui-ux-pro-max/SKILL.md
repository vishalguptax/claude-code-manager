---
name: ui-ux-pro-max
description: Comprehensive design intelligence for web and mobile UI. Contains 50+ styles, 161 color palettes, 57 font pairings, 161 product types, 99 UX guidelines, and 25 chart types across 10 technology stacks. Use when the task involves UI structure, visual design decisions, interaction patterns, or user experience quality control.
metadata:
  author: nextlevelbuilder
  version: "1.0.0"
---

# UI/UX Pro Max - Design Intelligence

Comprehensive design guide for web and mobile applications. Contains 50+ styles, 161 color palettes, 57 font pairings, 161 product types with reasoning rules, 99 UX guidelines, and 25 chart types across 10 technology stacks. Searchable database with priority-based recommendations.

## When to Apply

This Skill should be used when the task involves **UI structure, visual design decisions, interaction patterns, or user experience quality control**.

### Must Use

- Designing new pages (Landing Page, Dashboard, Admin, SaaS, Mobile App)
- Creating or refactoring UI components (buttons, modals, forms, tables, charts, etc.)
- Choosing color schemes, typography systems, spacing standards, or layout systems
- Reviewing UI code for user experience, accessibility, or visual consistency
- Implementing navigation structures, animations, or responsive behavior
- Making product-level design decisions (style, information hierarchy, brand expression)
- Improving perceived quality, clarity, or usability of interfaces

### Recommended

- UI looks "not professional enough" but the reason is unclear
- Receiving feedback on usability or experience
- Pre-launch UI quality optimization
- Aligning cross-platform design (Web / iOS / Android)
- Building design systems or reusable component libraries

### Skip

- Pure backend logic development
- Only involving API or database design
- Performance optimization unrelated to the interface
- Infrastructure or DevOps work
- Non-visual scripts or automation tasks

## Rule Categories by Priority

| Priority | Category | Impact | Domain | Key Checks |
|----------|----------|--------|--------|------------|
| 1 | Accessibility | CRITICAL | `ux` | Contrast 4.5:1, Alt text, Keyboard nav, Aria-labels |
| 2 | Touch & Interaction | CRITICAL | `ux` | Min size 44x44px, 8px+ spacing, Loading feedback |
| 3 | Performance | HIGH | `ux` | WebP/AVIF, Lazy loading, Reserve space (CLS < 0.1) |
| 4 | Style Selection | HIGH | `style`, `product` | Match product type, Consistency, SVG icons |
| 5 | Layout & Responsive | HIGH | `ux` | Mobile-first breakpoints, Viewport meta, No horizontal scroll |
| 6 | Typography & Color | MEDIUM | `typography`, `color` | Base 16px, Line-height 1.5, Semantic color tokens |
| 7 | Animation | MEDIUM | `ux` | Duration 150-300ms, Motion conveys meaning |
| 8 | Forms & Feedback | MEDIUM | `ux` | Visible labels, Error near field, Helper text |
| 9 | Navigation Patterns | HIGH | `ux` | Predictable back, Bottom nav <=5, Deep linking |
| 10 | Charts & Data | LOW | `chart` | Legends, Tooltips, Accessible colors |

## Quick Reference

### 1. Accessibility (CRITICAL)

- `color-contrast` - Minimum 4.5:1 ratio for normal text
- `focus-states` - Visible focus rings on interactive elements
- `alt-text` - Descriptive alt text for meaningful images
- `aria-labels` - aria-label for icon-only buttons
- `keyboard-nav` - Tab order matches visual order
- `form-labels` - Use label with for attribute
- `skip-links` - Skip to main content for keyboard users
- `heading-hierarchy` - Sequential h1-h6, no level skip
- `color-not-only` - Don't convey info by color alone
- `dynamic-type` - Support system text scaling
- `reduced-motion` - Respect prefers-reduced-motion
- `voiceover-sr` - Meaningful accessibilityLabel/accessibilityHint
- `escape-routes` - Provide cancel/back in modals and multi-step flows
- `keyboard-shortcuts` - Preserve system and a11y shortcuts

### 2. Touch & Interaction (CRITICAL)

- `touch-target-size` - Min 44x44pt (Apple) / 48x48dp (Material)
- `touch-spacing` - Minimum 8px gap between touch targets
- `hover-vs-tap` - Use click/tap for primary interactions
- `loading-buttons` - Disable button during async; show spinner
- `error-feedback` - Clear error messages near problem
- `standard-gestures` - Use platform standard gestures consistently
- `press-feedback` - Visual feedback on press
- `haptic-feedback` - Use haptic for confirmations
- `safe-area-awareness` - Keep primary touch targets away from notch/edges
- `swipe-clarity` - Swipe actions must show clear affordance

### 3. Performance (HIGH)

- `image-optimization` - Use WebP/AVIF, responsive images, lazy load
- `image-dimension` - Declare width/height to prevent layout shift
- `font-loading` - Use font-display: swap/optional
- `critical-css` - Prioritize above-the-fold CSS
- `lazy-loading` - Lazy load non-hero components
- `bundle-splitting` - Split code by route/feature
- `virtualize-lists` - Virtualize lists with 50+ items
- `progressive-loading` - Use skeleton screens for >1s operations
- `debounce-throttle` - Use debounce/throttle for high-frequency events

### 4. Style Selection (HIGH)

- `style-match` - Match style to product type
- `consistency` - Use same style across all pages
- `no-emoji-icons` - Use SVG icons, not emojis
- `platform-adaptive` - Respect platform idioms (iOS HIG vs Material)
- `state-clarity` - Make hover/pressed/disabled states visually distinct
- `dark-mode-pairing` - Design light/dark variants together
- `primary-action` - Each screen should have only one primary CTA

### 5. Layout & Responsive (HIGH)

- `viewport-meta` - width=device-width initial-scale=1
- `mobile-first` - Design mobile-first, then scale up
- `breakpoint-consistency` - Use systematic breakpoints
- `readable-font-size` - Minimum 16px body text on mobile
- `horizontal-scroll` - No horizontal scroll on mobile
- `spacing-scale` - Use 4pt/8dp incremental spacing system
- `z-index-management` - Define layered z-index scale
- `viewport-units` - Prefer min-h-dvh over 100vh on mobile
- `visual-hierarchy` - Establish hierarchy via size, spacing, contrast

### 6. Typography & Color (MEDIUM)

- `line-height` - Use 1.5-1.75 for body text
- `font-pairing` - Match heading/body font personalities
- `font-scale` - Consistent type scale
- `color-semantic` - Define semantic color tokens
- `color-dark-mode` - Dark mode uses desaturated tonal variants
- `color-accessible-pairs` - Meet 4.5:1 (AA) or 7:1 (AAA)
- `whitespace-balance` - Use whitespace intentionally

### 7. Animation (MEDIUM)

- `duration-timing` - 150-300ms for micro-interactions
- `transform-performance` - Use transform/opacity only
- `loading-states` - Show skeleton when loading exceeds 300ms
- `easing` - Use ease-out for entering, ease-in for exiting
- `motion-meaning` - Every animation must express cause-effect
- `spring-physics` - Prefer spring curves for natural feel
- `interruptible` - Animations must be interruptible
- `motion-consistency` - Unify duration/easing tokens globally

### 8. Forms & Feedback (MEDIUM)

- `input-labels` - Visible label per input (not placeholder-only)
- `error-placement` - Show error below the related field
- `submit-feedback` - Loading then success/error state on submit
- `required-indicators` - Mark required fields
- `empty-states` - Helpful message and action when no content
- `confirmation-dialogs` - Confirm before destructive actions
- `progressive-disclosure` - Reveal complex options progressively
- `inline-validation` - Validate on blur, not keystroke
- `undo-support` - Allow undo for destructive actions
- `focus-management` - After submit error, auto-focus first invalid field

### 9. Navigation Patterns (HIGH)

- `bottom-nav-limit` - Bottom navigation max 5 items
- `back-behavior` - Back navigation must be predictable
- `deep-linking` - All key screens reachable via deep link
- `nav-state-active` - Current location visually highlighted
- `modal-escape` - Modals must offer clear close/dismiss
- `state-preservation` - Navigating back restores previous scroll/state
- `gesture-nav-support` - Support system gesture navigation
- `adaptive-navigation` - Large screens prefer sidebar; small use bottom nav

### 10. Charts & Data (LOW)

- `chart-type` - Match chart type to data type
- `color-guidance` - Use accessible color palettes
- `legend-visible` - Always show legend near chart
- `tooltip-on-interact` - Provide tooltips on hover/tap
- `responsive-chart` - Charts must reflow on small screens
- `large-dataset` - For 1000+ points, aggregate or sample
- `screen-reader-summary` - Provide text summary for screen readers

## Common Rules for Professional UI

### Icons & Visual Elements

- Use vector-based icons (Lucide, react-native-vector-icons, @expo/vector-icons)
- Never use emojis as structural icons
- Use consistent stroke width within same visual layer
- Touch targets minimum 44x44pt with hitSlop if icon is smaller
- Align icons to text baseline

### Light/Dark Mode Contrast

- Primary text contrast >=4.5:1 in both modes
- Secondary text contrast >=3:1 in both modes
- Use semantic color tokens mapped per theme
- Modal scrim 40-60% black for foreground legibility
- Test both themes before delivery

### Layout & Spacing

- Respect top/bottom safe areas for fixed headers and tab bars
- Use consistent 4/8dp spacing rhythm
- Add bottom/top content insets so lists aren't hidden behind fixed bars
- Increase horizontal insets on larger widths and landscape

## Pre-Delivery Checklist

### Visual Quality
- [ ] No emojis used as icons
- [ ] All icons from consistent icon family
- [ ] Official brand assets with correct proportions
- [ ] Semantic theme tokens used consistently

### Interaction
- [ ] All tappable elements provide pressed feedback
- [ ] Touch targets meet minimum size
- [ ] Micro-interaction timing 150-300ms
- [ ] Disabled states visually clear and non-interactive
- [ ] Screen reader focus order matches visual order

### Light/Dark Mode
- [ ] Primary text contrast >=4.5:1 in both modes
- [ ] Dividers/borders distinguishable in both modes
- [ ] Both themes tested before delivery

### Layout
- [ ] Safe areas respected for headers, tab bars, CTA bars
- [ ] Scroll content not hidden behind fixed bars
- [ ] Verified on small phone, large phone, and tablet
- [ ] 4/8dp spacing rhythm maintained

### Accessibility
- [ ] All meaningful images/icons have accessibility labels
- [ ] Form fields have labels, hints, and clear error messages
- [ ] Color is not the only indicator
- [ ] Reduced motion and dynamic text size supported
