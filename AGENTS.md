# Agent Guide

## Behavioral Guidelines
*Adapted from core AI principles.*

### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**
- State your assumptions explicitly before implementing. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing and ask.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
- If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
- Don't "improve" adjacent code, comments, or formatting when editing existing code.
- Match existing style, even if you'd do it differently.
- Remove imports/variables/functions that YOUR changes made unused, but don't remove pre-existing dead code unless asked.
- The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**
- Transform tasks into verifiable goals (e.g., "Write a test that reproduces the bug, then make it pass").
- For multi-step tasks, state a brief verifiable plan.
- Strong success criteria let you loop independently.

---

## Project Purpose
- FilmBluesia is an Astro + React movie streaming/catalog app for `film.bluesia.net`.
- It fetches OPhim metadata, renders movie lists and unified detail/playback pages, uses signed URLs for the shared external image cache, and runs on Cloudflare through the Astro Cloudflare adapter.
- Runtime storage is Cloudflare-native: Cache API, KV-compatible metadata storage, R2 image storage, and browser `localStorage` for user state.

## Runtime Assumptions
- Build target is server output for Cloudflare Workers/Pages.
- Keep Cloudflare compatibility: avoid Node-only runtime APIs unless already supported by the configured adapter/compat flags.
- Do not add filesystem runtime persistence; Cloudflare runtime does not provide durable local files.
- Public site URL and cache versioning are configured in `astro.config.mjs`, `src/middleware.ts`, and `wrangler.jsonc`; production HTML cache keys are deployment-scoped through the `WORKER_VERSION` binding, with `HTML_CACHE_VERSION` only as a fallback.
- Video playback policy: M3U8/HLS chunking is delegated to upstream segments. Do not proxy or re-chunk video through Cloudflare Worker. Optimize only client-side HLS buffer, retry, lazy loading, native HLS fallback, and error recovery. Default buffer should remain conservative; 5-minute buffer is an upper cap for good-network aggressive mode, not the universal default.
- Playback source priority: desktop and Android prefer iframe/embed playback; iOS prefers native HLS. MSE fallback must retain the dynamically imported light build at `hls.js/dist/hls.light.js`.

## Token-Saving Workflow
- Use `rg` first. Prefer `rg -n "term" src components lib` and `rg --files` over broad file reads.
- Read only high-signal files relevant to the task. Avoid `node_modules`, `dist`, `.astro`, `.wrangler`, `.vite-cache-build`, and generated/cache folders.
- Start with `package.json`, `astro.config.mjs`, `wrangler.jsonc`, `tsconfig.json`, then targeted files under `src/`, `components/`, and `lib/`.
- Check `docs/FILE_MAP.md` before scanning for common UI, cache, player, and routing tasks.
- For broad visual changes, read `docs/DESIGN.md`; use `docs/design-qa.md` and its desktop/mobile screenshots as the current home-hero QA reference.
- For movie-detail metadata spacing or player-facade changes, use `docs/metadata-spacing-qa.md` and `docs/player-facade-qa.md` as the focused desktop/mobile QA references.

## Local Commands
- On Windows, prefer `npm.cmd` over `npm` for all npm commands and scripts.
- `npm run dev`: start the local Astro development server.
- `npm run build`: create the Cloudflare server build.
- `npm run preview`: build, then serve the generated Cloudflare Worker configuration through Astro preview.
- `npm run test:image-normalization`: run the deterministic image metadata normalization checks.
- `npm run test:ophim-latest-order`: verify the latest OPhim request uses `modified.time` and preserves the source's first 24 movies in order.
- `npm run scan:image-hosts`: fetch the latest OPhim page and report observed poster/thumb hosts; this is a networked diagnostic and does not modify the allowlist.
- `npm run deploy`: build and deploy through Wrangler; run only when deployment is explicitly requested.

## Editing Rules
- Keep edits narrow and consistent with existing Astro/React/Tailwind patterns.
- Avoid broad UI refactors for small card, layout, cache, or metadata changes.
- Reuse existing helpers in `lib/` before adding new abstractions.
- Preserve mobile-first layout and the `max-w-[720px]` app shell unless the task explicitly changes it.
- Do not change unrelated cache keys, cache TTLs, binding names, or cache version strings unless explicitly requested.
- Do not commit secrets, account IDs, tokens, or private deployment details.
- Navigation policy: never generate new category context links with hash fragments. Use `returnTo=<encoded path+search>` for `/movie` and `/watch` navigation so the exact source page can be restored. Hash and `from` fallback may exist only for legacy cached links. `/movie` and `/watch` pages must preserve category context for bottom nav active state.
- Navigation policy: category context for `/movie` and `/watch` pages must be passed with the `returnTo` query param, not hash fragments. Hash fragments are unavailable during Astro/server/static render. Bottom nav active state should use pathname plus `returnTo` and optional movie category fallback. Do not change Cloudflare/cache/video logic for nav active-state fixes.
- Playback navigation policy: new UI links must target `/movie/[slug]`; playback and episode selection live on that page. `/watch/[slug]` is legacy redirect compatibility only. Revealing a player must never autoplay media, and embed iframes load only after a separate Play interaction.
- Keep device detection, playback URL validation, and iframe/native-HLS/hls.js fallback ordering centralized in `lib/playback.ts`; do not duplicate that source-selection logic in player components.

## Image Cache Contract
- Active poster/backdrop rendering must use the external signed image cache at `img.bluesia.net` via `lib/image-cache.ts`.
- The legacy `/api/image` endpoint and `proxiedImage()` helper are deleted and must not be re-introduced for active rendering.
- Only two image variants are allowed: `m` (mobile) and `d` (desktop). Do not send width, quality, profile, DPR, format, or AVIF parameters from frontend code.
- HMAC signing secret (`IMAGE_CACHE_SIGNING_SECRET`) must stay server-side only. Never use a `PUBLIC_` prefix or expose it to client/browser code.
- `lib/image-cache.ts` is the canonical helper for building signed image URLs. Use `buildCachedImageUrl()` or `buildCachedImagePair()` from there.
- When signed URLs are unavailable (missing env vars), components fall back to raw upstream URLs, not to a proxy endpoint.
- OG/meta image tags use the signed desktop variant (`thumbSigned?.d || posterSigned?.d`) with raw upstream fallback.
- TMDB/OPhim metadata fetching and normalization are unchanged; only the image delivery URLs changed.
- Responsive image rendering must use both `m` and `d` variants via `srcset` or `<picture>`. The `img` tag's `src` fallback must be the `d` (desktop) variant. Do not hard-code `m` variants for all cards.
- Shared Image Cache Invariant: Both `film.bluesia.net` and `phim.bluesia.net` must generate exactly the same image cache URL. The cache key MUST be derived ONLY from the normalized upstream image URL and variant (`m` or `d`). It MUST NOT include the requester site domain, frontend name, page route, or any frontend-specific params.

## Web Lazy-Loading Rules
- Keep the first visible home Hero image as the only high-priority image (`loading="eager"` and `fetchpriority="high"`) because it is the expected LCP element. Do not lazy-load it.
- Load poster, backdrop, search-result, and other non-LCP images with `loading="lazy"` and `decoding="async"`. Preserve intrinsic dimensions or a stable aspect-ratio container to avoid layout shift.
- Keep critical, immediately interactive islands such as the home Hero, TopBar search, and BottomNav on `client:load`. Prefer `client:visible` for below-the-fold interactive islands and `client:idle` for non-visual background behavior when delayed hydration does not change the initial UI.
- Do not mount embed iframes until the user explicitly presses Play. Keep direct video preload conservative (`metadata` at most), and dynamically import `hls.js/dist/hls.light.js` only when MSE fallback is actually needed.
- Do not lazy-load tiny above-the-fold chrome assets such as the site logo when doing so would cause flicker. Defer non-critical third-party scripts and keep scroll/touch listeners passive where applicable.
- Adaptive prefetch must continue to respect slow connections and browser data-saving preferences. Do not add broad route or media preloads that compete with the Hero LCP request.

## Verification Rules
- Run `npm run build` when code changes are made and it is reasonable.
- `package.json` currently has no lint or dedicated typecheck script. For image normalization changes, also run `npm run test:image-normalization`.
- For UI changes, verify shared components first: `MovieCard`, `SectionRow`, list/search/home usage, and mobile layout classes.
- For home hero or broad visual changes, verify interaction and console state at both desktop and mobile viewports and update `docs/design-qa.md` plus its evidence images when the reference comparison materially changes.
- For Cloudflare/cache changes, inspect `src/middleware.ts`, `lib/cache.ts`, `lib/ophim.ts`, `src/worker.ts`, and `docs/CLOUDFLARE_CACHE.md`.

## Response Format
- Report changed files and one-line purpose for each.
- Report verification commands and results.
- Mention any remaining `Need verification` items or skipped checks.

## Pagination Rules
- We use a strict Netflix-style compact window for pagination. See `docs/PAGINATION.md` for the exact algorithm. Do not revert to simple next/prev or endless scroll.

## Player Loading Rules
- **Desktop & Android**: ALWAYS prioritize rendering the built-in player (iframe/embed) from the source API. This is the first choice.
- **iOS**: ALWAYS prioritize using the browser's Native HLS.
- **HLS.js Fallback**: ONLY use `hls.js` as a fallback for environments supporting MSE (Media Source Extensions). When used, MUST ONLY load the `hls.light.js` build and MUST load it via **dynamic import** to avoid blocking the render process and speed up initial page load.
