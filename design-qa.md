# Movie Card Badge Redesign — Design QA

- Source visual truth: `C:\Users\X\AppData\Local\Temp\codex-clipboard-d59c692c-0a7d-459b-9376-488ea01cfdd5.png`
- Implementation screenshots:
  - `D:\Antigravity\film-bluesia-cloudflare\docs\assets\movie-card-list-qa-720.png`
  - `D:\Antigravity\film-bluesia-cloudflare\docs\assets\movie-card-qa-390.png`
- Viewports: 720 × 950 and 390 × 844
- State: dark theme, `/list/phim-le`, live OPhim card data

## Full-view comparison evidence

The source and both implementation screenshots were opened and inspected. The implementation keeps the same four-column 720px and three-column 390px card grids while replacing the large neutral IMDb badge with a compact solid IMDb-yellow badge. The former two-badge status row and poster-wide bottom gradient are replaced with one Signal Blue status badge.

The browser security policy blocked loading the local comparison board needed to place the source and implementation in one combined comparison input. Because the Product Design QA contract requires that combined artifact, strict full-view comparison remains blocked.

## Focused region comparison evidence

Focused card regions are readable in the 720px list screenshot. IMDb labels remain compact on bright and dark posters; `HD`, `TRAILER`, and `TẬP x` remain legible without covering poster subjects. A combined focused-region board could not be opened for the same browser-policy reason.

## Required fidelity surfaces

- Fonts and typography: existing Max Sans/system hierarchy is unchanged; IMDb uses compact 9px black text and status uses 11px bold uppercase text.
- Spacing and layout rhythm: card aspect ratio, grid tracks, title block, and metadata spacing are unchanged. The overlay footprint is reduced.
- Colors and visual tokens: IMDb alone uses solid `#f5c518`; playback/content status alone uses Signal Blue. The poster-wide gradient was removed.
- Image quality and asset fidelity: existing signed OPhim `m`/`d` images, crops, lazy loading, and fallbacks are unchanged.
- Copy and content: `FULL` is removed. Each card exposes at most one status using the priority `TRAILER` → `TẬP x` → `HD`.

## Findings

- No visible card-level P0/P1/P2 issue was found in the separately inspected desktop and mobile screenshots.
- Blocking process issue: the required combined before/after comparison input could not be opened because local `file://` navigation was rejected by browser security policy.

## Patches made since the previous QA pass

- Removed the star icon and oversized dark IMDb treatment.
- Added compact solid IMDb-yellow rating treatment.
- Removed `FULL`, the second status badge, and the poster-wide bottom gradient.
- Added one Signal Blue status badge with strict display priority.
- Reduced the favorite icon container from 32px to 28px.

final result: blocked
