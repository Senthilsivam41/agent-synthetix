# Design tokens — Orchestrate Control Console

Implementation-ready token names for the console specified in [orchestrate-console.md](./orchestrate-console.md). Values are authoritative for visual direction; hosts may map them to CSS variables, Figma variables, or native theme keys.

## Visual direction

| Axis | Choice | Avoid |
|---|---|---|
| Atmosphere | Cool slate workspace, subtle paper-grid or soft radial wash | Flat pure-white void; neon glow |
| Accent | Single teal | Purple / indigo gradients; terracotta |
| Type | Display: **Newsreader**; UI: **IBM Plex Sans** | Inter, Roboto, Arial, system-ui as primary |
| Density | Plan prose 65–75ch; lists compact | Broadsheet multi-column rules; pill clusters |
| Shape | Small radius on controls only (`--radius-sm`) | Large rounded cards everywhere |

Brand wordmark **AutoClaw Orchestrate** must remain a hero-level signal in the shell (not eyebrow-only).

## Color

```css
:root {
  /* Surfaces */
  --color-bg: #0f1419;           /* app chrome / page */
  --color-bg-elevated: #171d25;  /* panels */
  --color-bg-quiet: #1c2430;     /* drop zone idle */

  /* Text */
  --color-fg: #e8eef4;           /* primary text ≥ 4.5:1 on bg */
  --color-fg-muted: #9aa8b5;     /* secondary */
  --color-fg-subtle: #6b7a88;    /* tertiary / timestamps */

  /* Accent (single) */
  --color-accent: #2ec4b6;       /* primary actions, step current */
  --color-accent-hover: #3dd4c6;
  --color-accent-fg: #06221f;    /* text on accent buttons */

  /* Semantic */
  --color-success: #3dbf7a;
  --color-warning: #e3b341;
  --color-danger: #e35d6a;
  --color-info: #5b9fd4;

  /* Lines */
  --color-border: #2a3441;
  --color-border-strong: #3d4b5c;

  /* Focus */
  --focus-ring: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent);
}
```

Light theme (optional second set for IDE embedding):

```css
[data-theme="light"] {
  --color-bg: #f4f7fa;
  --color-bg-elevated: #ffffff;
  --color-bg-quiet: #e8eef4;
  --color-fg: #12181f;
  --color-fg-muted: #4a5866;
  --color-fg-subtle: #6b7a88;
  --color-accent: #0d9488;
  --color-accent-hover: #0f766e;
  --color-accent-fg: #ffffff;
  --color-border: #d5dde6;
  --color-border-strong: #b8c4d0;
}
```

## Typography

```css
:root {
  --font-display: "Newsreader", "Source Serif 4", Georgia, serif;
  --font-ui: "IBM Plex Sans", "IBM Plex Sans Fallback", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;

  --text-display: 1.75rem / 1.25 var(--font-display); /* shell / plan title */
  --text-lg: 1.125rem / 1.4 var(--font-ui);
  --text-md: 1rem / 1.5 var(--font-ui);
  --text-sm: 0.875rem / 1.45 var(--font-ui);
  --text-xs: 0.75rem / 1.4 var(--font-ui);

  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
}
```

Load only the weights used (400/500/600). Do not substitute Inter/Roboto for `--font-ui`.

## Spacing and layout

```css
:root {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-8: 3rem;

  --radius-sm: 4px;   /* buttons, inputs */
  --radius-md: 8px;   /* approve panel only if needed */
  --radius-none: 0;

  --content-prose: 42rem;   /* ~65–75ch */
  --shell-max: 72rem;
}
```

## Motion

```css
:root {
  --duration-fast: 120ms;
  --duration-enter: 220ms;
  --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms;
    --duration-enter: 0ms;
  }
}
```

Use motion only for: step-rail underline, catalog row enter, approve success settle.

## Elevation

Prefer border (`--color-border`) over multi-layer shadows. If a single shadow is required for Approve focus:

```css
:root {
  --shadow-focus-panel: 0 1px 0 var(--color-border);
}
```

No glow, no stacked soft shadows on cards.

## Component token mapping

| Component | Key tokens |
|---|---|
| Shell / wordmark | `--font-display`, `--color-fg`, `--color-bg` |
| Step rail current | `--color-accent`, `--duration-enter` |
| Primary button | `--color-accent`, `--color-accent-fg` |
| Secondary button | `--color-border-strong`, `--color-fg` |
| Drop zone | `--color-bg-quiet`, `--color-border-strong` |
| Soft-gate banner | `--color-info` border, `--color-bg-elevated` |
| Danger / block | `--color-danger` |
| Focus | `--focus-ring` |

## Anti-patterns (do not ship)

- Purple-on-white or purple-to-indigo gradient themes
- Warm cream background (#F4F1EA-like) + terracotta + high-contrast serif as the default look
- Broadsheet layout: hairline rules, zero radius everywhere, dense newspaper columns
- Rounded-full pill clusters, emoji as status, glow accents
- Cards wrapping every section of Plan Review
