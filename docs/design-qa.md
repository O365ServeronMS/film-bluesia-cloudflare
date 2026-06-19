# Design QA — Home Cinematic Hero

- Source visual truth: `C:\Users\X\AppData\Local\Temp\codex-clipboard-3837c71f-f929-4bea-aa9b-44f7e7b42204.png`
- Desktop implementation screenshot: `docs/assets/hero-hbo-desktop.png`
- Mobile implementation screenshot: `docs/assets/hero-hbo-mobile.png`
- Combined comparison evidence: `docs/assets/hero-hbo-comparison.png`
- Viewports: desktop 720 × 625; mobile 390 × 844
- State: dark theme, Smart Spotlight hero with first content row visible

## Full-view comparison evidence

The combined board places the supplied HBO Max reference and the rendered desktop implementation in one image. Both use the same core composition: transparent navigation over a full-bleed backdrop, left-anchored title/metadata/actions, dark lower gradient, indicators near the lower edge, and a poster row overlapping the hero boundary. FilmBluesia intentionally retains its 720px app shell and fixed bottom navigation.

## Focused region comparison evidence

The combined board renders both hero/header/content-boundary regions at readable size, so a separate crop was unnecessary. The mobile screenshot additionally verifies the title wrap, backdrop crop, controls, overlap, card rail, and bottom safe area at 390px.

## Required fidelity surfaces

- Fonts and typography: System/Max Sans fallback produces the compact streaming hierarchy; weights, line heights, wrapping, and metadata tracking are consistent across desktop and mobile.
- Spacing and layout rhythm: Header clears the hero content, CTA spacing is even, the first rail overlaps by 32px, and no controls collide at either tested viewport.
- Colors and visual tokens: Existing obsidian/snow palette is retained; layered black gradients preserve text contrast without hiding the artwork.
- Image quality and asset fidelity: Real OPhim signed `m`/`d` assets are used. Desktop and mobile crops stay sharp with no stretching or placeholders.
- Copy and content: Hero copy is intentionally limited to Vietnamese title, English title, IMDb score when available, year, and normalized `Trailer/HD` status. Category, country, runtime, and episode progress are absent.

## Findings

- No actionable P0/P1/P2 findings remain.
- P3: The server-preloaded hero may differ from the first client-ranked slide when local personalization changes ordering, producing a harmless browser preload warning.

## Interaction and responsive checks

- Next-slide control changes the active heading and artwork.
- Keyboard/swipe handlers remain implemented; reduced-motion behavior is present.
- Desktop and mobile screenshots show zero console errors.
- `/movie/[slug]?returnTo=%2F` navigation contract is preserved.

## Patches made since the blocked pass

- Reduced desktop hero height from 540px to 450px so the poster rail appears above the fold.
- Constrained overlay search width so all header actions remain visible.
- Moved desktop carousel arrows away from the title block.
- Removed eager priority from first-row cards to avoid unnecessary image preloads.
- Simplified hero information to Vietnamese/English names, IMDb, `Trailer/HD`, and year only.
- Raised desktop carousel arrows so they do not overlap the compact metadata row.

final result: passed
