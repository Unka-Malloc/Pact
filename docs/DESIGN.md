# DESIGN.md - SplitAll Operations Console (V4)

## Visual Theme & Atmosphere
- **Language:** 页面采用纯中文语言设计 (The page uses a pure Chinese language design).
- **Concept:** Structured Carbon Light for operational control surfaces.
- **Mood:** Reliable, technical, calm, and audit-friendly.
- **Density:** Medium-high density. Favor scan speed over showcase whitespace.
- **Aesthetic:** Neutral light surfaces, crisp dividers, restrained shadows, and clear semantic color states.

## Why This Theme Fits SplitAll
- **Product type:** SplitAll is an operator-facing console for tasks, clients, storage, migration, and parsing settings.
- **Primary job:** Users need to spot status changes, failures, and drift quickly instead of admiring a cinematic landing page.
- **Implication:** The UI should feel closer to an enterprise control panel than a consumer hardware site.

## Color Palette & Roles
| Role | Name | Hex | Functional Usage |
|------|------|-----|------------------|
| **Base Background** | `bg-base` | `#f4f4f4` | App shell and page canvas. |
| **Primary Surface** | `bg-surface` | `#ffffff` | Cards, panels, drawers, tables. |
| **Subtle Surface** | `bg-subtle` | `#f8f8f8` | Grouped sections, inactive pills, secondary areas. |
| **Border** | `border-subtle` | `#e0e0e0` | Dividers, input borders, table rules. |
| **Primary Text** | `text-primary` | `#161616` | Main labels, titles, values. |
| **Secondary Text** | `text-secondary` | `#525252` | Field labels, supporting descriptions. |
| **Muted Text** | `text-muted` | `#6f6f6f` | Metadata, timestamps, helper copy. |
| **Brand / Focus** | `brand` | `#0f62fe` | Primary actions, focus rings, active nav, progress emphasis. |
| **Brand Hover** | `brand-strong` | `#0353e9` | Hover and pressed state for primary actions. |
| **Info** | `info` | `#0043ce` | Linked state, secondary status emphasis. |
| **Success** | `success` | `#24a148` | Healthy clients, completed tasks, valid config. |
| **Warning** | `warning` | `#f1c21b` | Pending or degraded states. Use with dark text only. |
| **Danger** | `danger` | `#da1e28` | Failed tasks, destructive actions, hard errors. |

## Status Surface Pairings
- **Success Surface:** `#defbe6` background with `#24a148` text/icon.
- **Warning Surface:** `#fcf4d6` background with `#8a6a00` text/icon.
- **Danger Surface:** `#fff1f1` background with `#da1e28` text/icon.
- **Info Surface:** `#edf5ff` background with `#0043ce` text/icon.

## Typography Rules
- **Font Family:** `"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif`.
- **Monospace:** `"IBM Plex Mono", "SFMono-Regular", Consolas, monospace`.
- **Primary Header:** 28px - 32px, `font-weight: 600`, compact tracking.
- **Section Header:** 12px - 13px, `font-weight: 600`, muted, uppercase only where it improves scan rhythm.
- **Body Text:** 14px, `font-weight: 400`, `line-height: 1.5`.
- **Key Metrics:** 28px - 32px, `font-weight: 600`, no decorative styling.
- **Badges:** 11px - 12px, `font-weight: 600`, compact rounded rectangle rather than oversized pills.

## Component Stylings
- **Buttons:**
  - **Primary:** `brand` fill, white text, `border-radius: 10px`.
  - **Secondary:** white or `bg-subtle` fill, `1px` subtle border, dark text.
  - Avoid oversized pill buttons unless the action is singular and high priority.
- **Cards and Panels:**
  - White surface with `1px solid border-subtle`.
  - `border-radius: 14px`.
  - Shadow should be soft and sparse: `0 8px 24px rgba(22,22,22,0.06)` at most.
- **Inputs:**
  - White background with `1px` border.
  - Focus ring uses `brand`, not black.
  - Monospace is encouraged for rule editors, IDs, paths, and machine values.
- **Badges and Alerts:**
  - Prefer tinted semantic backgrounds over saturated solid fills.
  - Error panels should read urgent, not flashy.
- **Progress:**
  - Neutral track with blue active fill by default.
  - Red only when the progress itself indicates failure.

## Layout Principles
- **Grid:** Narrow utility sidebar plus dominant main work area remains correct.
- **Spacing:** Use 16px, 24px, and 32px as the main structural rhythm.
- **Hierarchy:** Separate sections with borders and surface contrast before using stronger color.
- **Data Density:** Tables, job lists, and client rows should favor alignment and scanning over oversized padding.

## Depth & Elevation
- Keep elevation restrained.
- Prefer borders, surface shifts, and sectional grouping over floating-card theatrics.
- If every panel casts a large shadow, the console loses operational precision.

## Do's and Don'ts
- **Do:** Use blue as the action/focus color and reserve semantic colors for real system meaning.
- **Do:** Keep labels, timestamps, and identifiers visually distinct through tone and typography.
- **Do:** Let task status, client migration state, and config validity drive color usage.
- **Don't:** Reuse warning yellow as a decorative accent.
- **Don't:** Use pure black as the main action color; it makes the product feel editorial instead of operational.
- **Don't:** Over-apply rounded pills, glass, or luxury whitespace patterns from consumer-brand UI.

## Responsive Behavior
- **Breakpoints:** Below `960px`, collapse the sidebar into stacked sections or a drawer.
- **Compact Mode:** Metrics can wrap to 2 columns on tablet and 1 column on mobile.
- **Touch Targets:** Minimum 40px height for controls, even in dense layouts.

## Agent Prompt Guide
"Build SplitAll as a structured operations console. Use a Carbon-inspired light palette with cool neutral surfaces, cobalt blue focus states, crisp borders, and semantic status colors. Optimize for scanning tasks, clients, and migration state quickly. Avoid Apple-style luxury whitespace and avoid black-as-brand primary actions."
