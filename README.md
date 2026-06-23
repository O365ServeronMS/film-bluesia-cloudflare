# FilmBluesia

A minimal, high-performance movie catalog and streaming application built with Astro and React. Deployed on Cloudflare Workers/Pages.

## Project Structure

This project follows a component-driven architecture using Astro for server-side rendering and routing, and React for interactive client-side islands. 

Below is the basic structure of the project:

- **`src/`**: Contains the core Astro application.
  - **`pages/`**: File-based routing. Each `.astro` file here corresponds to a route (e.g., `/`, `/movie/[slug]`). API routes are located in `src/pages/api/`.
  - **`layouts/`**: Astro layout components (e.g., `BaseLayout.astro`) that wrap page content with common HTML scaffolding and metadata.
  - **`styles/`**: Global CSS files (e.g., `globals.css`) utilizing Tailwind CSS for styling and custom CSS variables.
  - **`middleware.ts`**: Cloudflare Pages middleware for caching strategies, handling edge headers, and intercepting requests.
  
- **`components/`**: Reusable UI components.
  - Built primarily with React (`.tsx`) for interactive elements (e.g., `BottomNav`, `MoviePlayer`, `SectionRow`).
  - Used within Astro pages as islands where interactivity is needed (`client:load`, `client:visible`, etc.).

- **`lib/`**: Core logic, utilities, and integrations.
  - API clients and data fetching layers (e.g., `ophim.ts`).
  - Edge caching and routing utilities (`cache.ts`, `html-cache-headers.ts`, `navigation.ts`).
  - Image handling and normalization logic (`image-cache.ts`).
  - Shared TypeScript interfaces and types (`types.ts`).

- **`public/`**: Static assets that are served directly at the root path without processing (e.g., `favicon.ico`, `manifest.webmanifest`, PWA icons).

- **`docs/`**: Internal documentation files covering design guidelines (`DESIGN.md`), architecture decisions (`DECISIONS.md`), edge caching rules (`CLOUDFLARE_CACHE.md`), and other project references.

- **`scripts/`**: Utility scripts for testing, verification, and maintenance tasks (e.g., testing image normalization, KV write resilience).

## Core Technologies

- **Framework**: [Astro](https://astro.build/) for static and server-generated content.
- **UI Library**: [React](https://react.dev/) for interactive components.
- **Styling**: Tailwind CSS with a custom design token system.
- **Deployment**: Cloudflare Pages & Workers (utilizing Cache API and KV).

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

## Documentation Reference

For advanced configuration and architecture details, refer to the `docs/` folder:
- `CLOUDFLARE_CACHE.md`: Cloudflare Caching Configuration
- `DECISIONS.md`: Architectural Decisions
- `FILE_MAP.md`: Project File Map
