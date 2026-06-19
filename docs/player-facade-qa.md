# Player Facade QA

- Source visual truth: `C:\Users\X\AppData\Local\Temp\codex-clipboard-ef0c1d59-dbbc-4bf7-8d0d-27cfc19d0ef1.png`
- Visual evidence: local-only desktop, mobile, and comparison captures under `docs/assets/` (Git-ignored).
- Route: `/movie/khe-uoc?server=1`
- Viewports: 720 × 950 and 390 × 844
- State: iframe facade visible before the second Play interaction

## Full-view comparison evidence

The local comparison places the supplied facade and the implementation side by side. The implementation removes both instructional copy lines and makes the Signal Blue Play control the sole focal point over the dimmed poster.

## Focused evidence

The player region is large enough in the full comparison to judge button scale, centering, contrast, and the removed copy. The mobile capture confirms the 96px control remains centered without crowding the player header or local actions.

## Required fidelity surfaces

- Typography: Instructional copy is intentionally removed; surrounding player labels remain unchanged.
- Spacing and layout: The Play control is centered at 112px desktop and 96px mobile.
- Colors and tokens: The button uses the existing Signal Blue and Snow tokens with a restrained border and shadow.
- Image quality: Existing signed poster artwork and dim treatment are unchanged.
- Copy and content: `Bấm Play để bắt đầu` and `Video chỉ được tải sau thao tác này.` are absent.

## Interaction and accessibility

- The facade remains a native button with a descriptive `Phát {title}` accessible name.
- Clicking it replaces the facade with the iframe; no iframe loads before that click.
- `playerPlayPulse` runs at 2.4 seconds and is disabled by `prefers-reduced-motion`.
- Playwright reported zero console errors before the iframe interaction.

## Findings

- No actionable P0/P1/P2 findings remain.

## Patches made

- Removed the two instructional text rows.
- Added one large responsive Signal Blue Play control.
- Added a subtle pulse/glow animation and reduced-motion override.
- Used explicit pixel dimensions to avoid the project’s custom Tailwind spacing scale shrinking the control.

final result: passed
