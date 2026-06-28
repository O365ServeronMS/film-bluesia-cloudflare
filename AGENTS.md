# Agent Guide

> **Architecture (current): zero-Worker static + catalog-api.** This project is now
> deployed as **static assets only** (Astro `output: "static"`, no Cloudflare Worker,
> no SSR). All catalog data, TMDB metadata, and pre-signed images come from the VPS
> `catalog-api` at `img.bluesia.net/api/*`, fetched **client-side** via `lib/catalog.ts`.
> There is no OPhim client, KV, image signing, HTML cache, metadata snapshot, or refresh
> cron in this repo — `catalog-api` owns all of it. **`CLAUDE.md` is the authoritative
> guide;** sections below that describe Worker/KV/SSR/snapshot internals are historical.

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
- It renders movie lists and a client-rendered detail/playback page from data served by the VPS `catalog-api` (`img.bluesia.net/api/*`): OPhim catalog + TMDB metadata + pre-signed images, cached in Valkey. The frontend deploys as static Cloudflare assets (no Worker, no SSR).
- The only runtime storage in the frontend is browser `localStorage` (favorites/history). All catalog state lives on the VPS.

## Runtime Assumptions
- Build target is **static** output (`output: "static"`); deploy is static assets only (no Worker, no adapter).
- **Everything in `lib/` and `components/` runs in the browser.** No Node builtins, no `process.env` (use `import.meta.env.PUBLIC_*`), no filesystem.
- Dynamic routes: list types are prerendered via `getStaticPaths`; `/movie/*` is a client-rendered shell reached through `public/_redirects` (200 rewrite); `/watch/*` 301s to `/movie/:splat`.
- `catalog-api` CORS allowlists every `*.bluesia.net` subdomain and `http://localhost:<port>`, so catalog data loads in local dev as well as production (simple GETs, no preflight).
- Video playback policy: M3U8/HLS chunking is delegated to upstream segments. Never proxy or re-chunk video. Optimize only client-side HLS buffer, retry, lazy loading, native HLS fallback, and error recovery.
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
- `npm run build`: create the static build (`dist/`). This is the only automated gate.
- `npm run preview`: build, then serve `dist/` locally via wrangler (catalog data loads — localhost is CORS-allowlisted).
- `npm run deploy`: build and deploy the static assets through Wrangler; run only when deployment is explicitly requested.

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
- Images arrive **pre-signed** from `catalog-api`. The frontend never signs, re-keys, or mints variants — there is no `lib/image-cache.ts` anymore.
- Each item carries `thumb_url` = pre-signed `/i/m/…` (TMDB poster, portrait) and `poster_url` = pre-signed `/i/d/…` (TMDB backdrop, landscape). Only two variants per movie: `m` and `d`.
- `normalizeCard()` (in `lib/catalog.ts`) sets `MovieCard.thumb`/`poster` to these URLs and leaves `thumbSigned`/`posterSigned` undefined. `MovieCard.tsx` renders a single `<img src={thumb}>` with `poster` as the on-error fallback (global handler in `BaseLayout.astro`). Do not reintroduce a `{m,d}` `srcset`/`<picture>` pair — the cache holds one size per orientation.
- Shared Image Cache Invariant: `film.bluesia.net` and `phim.bluesia.net` generate identical cache URLs for the same upstream image. The key is derived ONLY from `sha256(upstreamUrl)+variant`. Never add the requester domain, route, or frontend-specific params, and never create a third/site-specific variant.
- TMDB attribution is required by ToS and lives in `BaseLayout.astro` + `settings.astro`. Do not remove it.

## Web Lazy-Loading Rules
- Keep the first visible home Hero image as the only high-priority image (`loading="eager"` and `fetchpriority="high"`) because it is the expected LCP element. Do not lazy-load it.
- Load poster, backdrop, search-result, and other non-LCP images with `loading="lazy"` and `decoding="async"`. Preserve intrinsic dimensions or a stable aspect-ratio container to avoid layout shift.
- Keep critical, immediately interactive islands such as the home Hero, TopBar search, and BottomNav on `client:load`. Prefer `client:visible` for below-the-fold interactive islands and `client:idle` for non-visual background behavior when delayed hydration does not change the initial UI.
- Do not mount embed iframes until the user explicitly presses Play. Keep direct video preload conservative (`metadata` at most), and dynamically import `hls.js/dist/hls.light.js` only when MSE fallback is actually needed.
- Do not lazy-load tiny above-the-fold chrome assets such as the site logo when doing so would cause flicker. Defer non-critical third-party scripts and keep scroll/touch listeners passive where applicable.
- Adaptive prefetch must continue to respect slow connections and browser data-saving preferences. Do not add broad route or media preloads that compete with the Hero LCP request.

## Verification Rules
- Run `npm run build` when code changes are made — it is the only automated gate (no lint/typecheck script). It must emit static `dist/` with no `_worker.js`.
- For UI changes, verify shared components first: `MovieCard`, `SectionRow`, list/search/home usage, and mobile layout classes.
- For data/image changes, confirm rendered URLs are `catalog-api` pre-signed `i/{m|d}/…` with no client-side signing and no new variant. Full data flows only verify on the deployed `film.bluesia.net` (CORS).
- For catalog client changes, inspect `lib/catalog.ts` and the islands that consume it (`HomeIsland`, `ListIsland`, `SearchResults`, `SearchSuggest`, `MovieDetailIsland`).

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
