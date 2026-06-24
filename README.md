# FilmBluesia

A Vietnamese movie streaming catalog at **[film.bluesia.net](https://film.bluesia.net)** — browse, search, and watch movies with a fast, mobile-first interface.

---

## What it does

- **Browse & search** Vietnamese movie metadata sourced from the OPhim API
- **Stream** via embedded players or direct HLS playback, device-aware (iOS vs Android/Desktop)
- **Remember** your favorites and watch history, stored locally in your browser
- **Load fast** — pages are edge-cached on Cloudflare, posters served from a shared image CDN

---

## Stack (for the curious)

| What | How |
|---|---|
| Pages & routing | [Astro 7](https://astro.build) (server-rendered) |
| Interactive bits | React 19 (islands only) |
| Styling | Tailwind CSS 4 |
| Hosting | Cloudflare Workers |
| Metadata cache | Cloudflare KV |
| Images | `img.bluesia.net` (HMAC-signed CDN) |
| Video | hls.js (direct) + Vidsrc embed |

---

## Run it locally

```bash
npm install
npm run dev        # → http://localhost:4321
```

```bash
npm run build      # production build
npm run preview    # build + serve via Wrangler (mirrors Cloudflare env)
```

> **Deploy** is intentionally manual: `npm run deploy` — only run this when you mean it.

---

## Project layout

```
src/pages/       # Routes: /, /movie/[slug], /list/[type], /search, …
components/      # UI: MovieCard, HeroSlider, MoviePlayer, BottomNav, …
lib/             # Logic: API client, caching, image URLs, types
docs/            # Architecture notes (start with DECISIONS.md)
scripts/         # Diagnostic & test scripts
```

---

## For developers

Full architectural decisions, cache rules, and anti-regression guidelines live in [`docs/DECISIONS.md`](docs/DECISIONS.md). Read it before touching cache behavior, image URLs, navigation, or playback.

The only automated check is the build:

```bash
npm run build    # must pass after every change
```
