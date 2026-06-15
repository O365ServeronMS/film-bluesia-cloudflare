# FilmBluesia

A minimal, high-performance movie catalog and streaming application built with Astro and React. Deployed on Cloudflare Workers/Pages.

## Features

- **Astro + React**: Blazing fast server-side and client-side rendering.
- **Upstream Integration**: Fetches metadata and streams from OPhim.
- **Image Proxy**: Securely proxies and caches external poster images.
- **Cloudflare Native**: Designed to run efficiently on Cloudflare Pages/Workers using KV, R2, and Cache API.

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

Install the project dependencies:

```bash
npm install
```

### Development

Run the development server locally:

```bash
npm run dev
```

The application will be accessible at `http://localhost:4321`.

### Build & Preview

Build the production site:

```bash
npm run build
```

Preview the Cloudflare Pages worker environment locally using Wrangler:

```bash
npm run preview
```

### Deployment

Deploy to Cloudflare:

```bash
npm run deploy
```

## Troubleshooting & Docs

For advanced caching architecture, image proxy details, and configuration:
- [Cloudflare Caching Configuration](docs/CLOUDFLARE_CACHE.md)
- [Image Proxy Troubleshooting](docs/IMAGE_TROUBLESHOOTING.md)
- [Architectural Decisions](docs/DECISIONS.md)
- [Project File Map](docs/FILE_MAP.md)
