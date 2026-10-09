# Bedrock design system

Bedrock ships two surfaces. The **TV launcher** is a 10-foot UI on the laptop, built on the Apple tvOS Human
Interface Guidelines. The **phone remote** is a PWA in Safari or Chrome, built on the iOS HIG. Both share the tokens
below. Competitive input: [`../research/arvio-competitive-analysis.md`](../research/arvio-competitive-analysis.md).

## 1. Brand

- **Name:** Bedrock. Always written "Bedrock", never "BedRock" or "BEDROCK", except for CSS letter-spaced
  eyebrow labels.
- **Tagline:** "Your laptop, from bed." Secondary: "Everything you watch. One remote. Zero getting up."
- **Mascot:** the friendly orange remote with a navy screen-face (`static/bedrock-logo.png`). It appears as the app
  icon (squircle mask), in the startup animation, on the welcome hero when there is no history, and on the phone's
  pairing screen. Its personality is calm, sleepy-friendly and helpful, never loud.
- **Brand colors** (sampled from the logo):

| Token | Hex | Use |
|---|---|---|
| `--brand-orange` | `#F36425` | Tint / accent, primary buttons on phone, focus glow tint, active indicators |
| `--brand-navy` | `#0E2C5A` | Deep accent surfaces, mascot screen, hero gradients |
| `--brand-lime` | `#BCE772` | Success / "connected" highlights, mascot eyes, small accents only |

## 2. Color (dark appearance, which is the default: people use this at night in bed)

Follow Apple's dark system colors.

| Token | Value |
|---|---|
| `--bg` | `#000000` (TV), `#000000` (phone) |
| `--bg-elevated` | `#1C1C1E` |
| `--bg-elevated-2` | `#2C2C2E` |
| `--fill` | `rgba(120,120,128,0.36)` (system fill) / `--fill-2` `rgba(120,120,128,0.24)` / `--fill-3` `rgba(118,118,128,0.18)` |
| `--label` | `#FFFFFF` |
| `--label-2` | `rgba(235,235,245,0.60)` |
| `--label-3` | `rgba(235,235,245,0.30)` |
| `--separator` | `rgba(84,84,88,0.60)` |
| `--tint` | `--brand-orange` |
| `--green` | `#30D158` · `--red` `#FF453A` · `--yellow` `#FFD60A` |
| Materials | `--material-thin: rgba(28,28,30,0.55)` + `backdrop-filter: blur(30px) saturate(180%)`; `--material-regular: rgba(28,28,30,0.72)` + same blur |

Contrast: text on materials must meet WCAG AA (4.5:1). Never place `--label-2` on top of artwork without a scrim.

## 3. Typography

Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif`.
Load no web fonts; the app must work offline on the LAN.

**TV (designed at 1920×1080 and scaled with `clamp()`/`vw`, tvOS type ramp):**

| Style | Size / weight |
|---|---|
| Large Title (hero) | 76px / 700, tracking -0.02em |
| Title 1 | 57px / 700 |
| Title 2 | 48px / 600 |
| Title 3 | 38px / 600 |
| Headline | 31px / 600 |
| Body | 29px / 400 |
| Callout | 25px / 400 |
| Caption 1 | 23px / 500 |
| Caption 2 | 19px / 500 |

Minimum TV text size is 19px at 1080p. Use `font-variant-numeric: tabular-nums` for clocks, codes and time-left.

**Phone (iOS Dynamic Type "Large" defaults):** Large Title 34/700, Title 2 22/700, Headline 17/600, Body 17/400,
Callout 16, Subheadline 15, Footnote 13, Caption 12. Respect user font scaling and use `rem`.

## 4. Layout & shape

- TV safe area: 80px horizontal, 60px vertical at 1080p, `clamp()`-scaled. Nothing interactive sits outside it.
- 8pt grid. Spacing tokens: 4, 8, 12, 16, 24, 32, 48, 64, 80.
- Corner radii (continuous-looking): cards 20px (TV) / 16px (phone), buttons are capsules (999px) or 14px,
  app icons are a squircle at 22.37% of size.
- Phone: honor `env(safe-area-inset-*)`, minimum hit target 44×44pt, single column, max-width 430px centered.

## 5. Focus engine (TV), the core interaction

Everything on TV must work with arrows + Enter + Escape, because that is all the phone sends.

- Focus is 2-D across **rows** (hero actions → Continue Watching → Apps). Up/Down move between rows and keep the
  nearest column. Left/Right move within a row and clamp at its ends.
- The focused element scales `1.06–1.08`, lifts with `box-shadow: 0 24px 48px rgba(0,0,0,.55)`, gets a 3px white
  ring (`outline` offset or inset `box-shadow`), and shows a soft specular sheen (a radial-gradient pseudo-element).
  Unfocused items stay at full opacity.
- Focus transitions: `transform 220ms cubic-bezier(.2,.8,.2,1)`.
- A focused row scrolls horizontally so the focused card stays fully visible (`scrollIntoView({inline:"nearest",block:"nearest"})`).
- Mouse hover also moves focus. Click activates.

## 6. Motion

- Standard easing is `cubic-bezier(.2,.8,.2,1)` (spring-like ease-out). Durations: 150ms micro, 250ms focus, 400ms
  screen, 600ms hero crossfade.
- **Startup animation** (TV, ~1.8s total, skippable with any key): black → mascot icon springs in (scale 0.6→1.04→1,
  slight rotate -6°→0) with a lime glow bloom → mascot "blinks" (scaleY on an eye overlay, or a quick squash) →
  "Bedrock" wordmark fades and rises 8px → whole splash scales to 1.04 and fades as Home fades in.
- `prefers-reduced-motion: reduce` replaces all motion with ≤150ms opacity fades. The splash is then 600ms total.

## 7. Iconography

SF Symbols-style inline SVG icons: 2px stroke at 24px, round caps and joins, `currentColor`. Keep one
`Icon` component per package with names such as `play.fill`, `pause.fill`, `playpause.fill`, `gobackward.10`,
`goforward.10`, `speaker.wave.2.fill`, `speaker.minus`, `speaker.plus`, `house.fill`, `chevron.left`,
`magnifyingglass`, `keyboard`, `hand.point.up.left`, `dpad`, `qrcode`, `iphone`, `wifi`, `checkmark.circle.fill`,
`xmark.circle.fill`, `ellipsis`, `escape`, `delete.left`, `return`, `arrow.up/down/left/right`. Don't use emoji or
unicode glyphs (▲ ◀ ⌫ ⚙) as icons.

## 8. Voice & copy

Talk like Apple: short, human, sentence case.
- Status: "iPhone connected" / "Ready to pair" / "Remote unavailable". Never "CONNECTED", "DISCONNECTED",
  "nav:up" or "mDNS".
- Toasts: "Playing", "Paused", "Back 10 seconds", "Forward 10 seconds", "Volume up", "Volume down", "Next
  episode", "Searching for 'dune'", "Couldn't reach Netflix. Try again."
- Pairing: "Pair your phone", "Scan with your phone's camera, or go to bedrock.local and enter this code."
- Show technical details (IP, port) only as secondary caption text in the pairing sheet, never on Home.

## 9. Accessibility

- Every icon-only button has an `aria-label`. Live regions announce connection changes and toasts.
- Focus is always visible on TV. On phone, `:focus-visible` uses a 2px tint ring.
- Respect `prefers-reduced-motion` and `prefers-contrast: more` (thicker focus ring, opaque materials).
