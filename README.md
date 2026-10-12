# Music UI

Web music player for a private [Navidrome](https://www.navidrome.org/) server (Subsonic API), built with Next.js and Material UI. It runs in Docker on Unraid. See [PLAN.md](PLAN.md) for the full design and milestones.

## Requirements

- Node.js 26 (`.nvmrc`)
- pnpm 10 (`packageManager` field; `npm i -g pnpm@10` if corepack is not available)

## Development

```sh
pnpm install
cp .env.example .env.local   # then set SUBSONIC_URL / SUBSONIC_USER / SUBSONIC_PASSWORD
pnpm dev                      # http://localhost:3000
```

The server refuses to start (with a list of what's wrong) when the configuration is invalid.

At startup, and then every `SYNC_INTERVAL_MINUTES`, the server copies the library metadata from Navidrome into SQLite (`$DATA_DIR/music-ui.db`), unless Navidrome reports no change. Useful endpoints:

- `GET /api/catalog/status`: sync state, last sync, track count
- `POST /api/catalog/rescan`: force a full sync
- `GET /api/catalog`: the catalog snapshot loaded by the browser (gzip + ETag)

### Dev Navidrome

A Navidrome with two libraries ("Main" and "Live") and generated sample tracks, for development and integration tests. Requires `ffmpeg` and Docker.

```sh
pnpm navidrome:music                              # generate ./docker/music (sine tones, tagged)
docker compose -f docker/compose.dev.yml up -d
pnpm navidrome:setup                              # admin/admin, libraries, app user music/music
pnpm test:integration                             # runs against http://localhost:4533
```

`.env.local` for this setup: `SUBSONIC_URL=http://localhost:4533`, `SUBSONIC_USER=music`, `SUBSONIC_PASSWORD=music`.

| Script                              | Purpose                                                              |
| ----------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                          | Dev server                                                           |
| `pnpm build` / `pnpm start`         | Production build (standalone output) / serve it                      |
| `pnpm lint`                         | oxlint (TypeScript, React hooks, Next.js, a11y rules; warnings fail) |
| `pnpm typecheck`                    | `tsc --noEmit`                                                       |
| `pnpm format` / `pnpm format:check` | oxfmt                                                                |
| `pnpm test`                         | Vitest unit tests (integration tests are skipped without a server)   |
| `pnpm test:integration`             | Integration tests against the dev Navidrome                          |

## Status

- [x] M0 — Scaffold: Next.js, TypeScript, MUI theme (light/dark), static app shell, oxlint/oxfmt, Vitest
- [x] M1 — Runtime config validation, typed Navidrome (Subsonic) client, dev Navidrome with two libraries
- [x] M2 — SQLite catalog (node:sqlite), sync from Navidrome, `/api/catalog`, `/api/catalog/status`, `/api/catalog/rescan`
- [ ] M3 — Stream, cover and health routes
