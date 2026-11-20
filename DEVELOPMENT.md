# Development

## Run it

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/bayline/`. The site is always served under `/bayline/`, as on GitHub Pages.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dev server |
| `npm test` | Runs the tests: the logic, every page, the build, the pages driven in jsdom, and a check that fails on any hex colour |
| `npm run test:tz` | Runs the same tests in a US time zone, to show the site always uses Manila time |
| `npm run build` | Type-checks, then builds the site into `dist/` |
| `npm run preview` | Serves `dist/` at `http://localhost:4173/bayline/` |

## Screenshot build

Bayline reads the real Manila clock, so after 8:00 PM the bay shows as closed. For screenshots, build a copy with the clock pinned to an open hour:

```sh
VITE_CAPTURE_AT=2026-11-19T10:30:00+08:00 npm run build:capture
npm run preview:capture
```

The copy is served at `http://localhost:4125/bayline/`. The pinned clock only works in this capture build; a normal build ignores it.

## Deploy

Every push to `main` runs `.github/workflows/pages.yml`. It runs the tests in both time zones, builds, and publishes `dist/` to GitHub Pages at `https://<username>.github.io/bayline/`. In the repository's Pages settings, the source must be GitHub Actions.

The workflow passes the repository's Pages address to the build as `VITE_SITE_URL`, and canonical and Open Graph links are built from it. A local build uses the preview address; to build with another, copy `.env.example` to `.env`.
