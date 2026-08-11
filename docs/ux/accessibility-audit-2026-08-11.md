# Orchestrate console accessibility pass

**Date:** 2026-08-11  
**Target:** WCAG 2.2 AA  
**Scope:** Primary console shell and Intake, Clarify, Plan Review, Approve, and Sprints workflows

This is an implementation audit, not an external accessibility certification. Automated checks are backed by deterministic contrast tests and code-level keyboard/focus coverage; assistive-technology and browser-zoom checks remain manual release gates.

## Findings and resolutions

| Finding | Relevant criteria | Severity | Resolution |
|---|---|---:|---|
| No skip navigation or deterministic focus after workflow changes | 2.4.1, 2.4.3 | High | Added a visible-on-focus skip link and moved focus to the workflow main region after step changes. |
| File drop target was not a reliable keyboard control | 2.1.1, 2.5.7 | High | Replaced the label-only interaction with a real button that opens the native file picker; drag-and-drop remains optional. |
| Intake table had no accessible name | 1.3.1 | Medium | Added a descriptive table caption. |
| Focus indication was incomplete across interactive controls | 2.4.7, 2.4.11 | Medium | Added consistent high-contrast `:focus-visible` treatment for buttons, links, fields, summaries, selectors, and the main region. |
| Narrow viewport and user contrast preferences were not explicitly handled | 1.4.10, 1.4.11 | Medium | Added reflow, increased-contrast, and forced-colors rules while retaining reduced-motion behavior. |

## Verification evidence

- Axe checks cover WCAG 2.0, 2.1, and 2.2 A/AA tags and report no structural violations for the primary shell.
- Keyboard tests prove that the skip link targets the main workflow region, step changes focus that region, and the file picker is reachable through a native button.
- A deterministic token test validates primary text/background pairs; the lowest tested ratio is 5.32:1.
- Reflow, `prefers-reduced-motion`, `prefers-contrast`, and forced-colors behavior is present in the shipped stylesheet.

## Manual release checks still required

- VoiceOver on macOS/Safari and NVDA on Windows/Firefox.
- Browser zoom at 200% and text-only zoom where supported.
- High-contrast mode on Windows.
- End-to-end keyboard traversal with representative runtime data and validation errors.

The automated audit disables Axe's layout-dependent color-contrast rule under jsdom because jsdom does not compute rendered geometry or final colors. The direct token contrast test covers the known palette; a real-browser audit remains the final verification for computed styles.
