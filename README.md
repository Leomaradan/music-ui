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
- `GET /api/health`: app status, Navidrome reachability, sync state (for the Docker healthcheck)

### Using the library view

- **Filters:** four boxes, Music Folder → Genre → Artist (album artist) → Album. Several values can be ticked in a box; nothing ticked means everything. Changing a box clears the boxes after it, and brings back tracks removed from the results.
- **Table:** click a header to sort (ascending, descending, off), drag a header's right edge to resize (double-click resets).
- **Selection:** click, Ctrl/Cmd-click, Shift-click, Ctrl/Cmd+A, arrow keys (Shift extends), Escape.
- **Remove from results:** Delete / Backspace, or right-click → _Remove from results_. Hidden only; _Restore_ in the status bar brings them back.
- **Play:** double-click a track (or select it and press Enter, or right-click → _Play_): the tracks listed in the table, in their displayed order, become "Currently playing" and playback starts at that track.
- **Player bar:** previous (restarts the track after 3 s), play/pause, stop, next, seek slider, volume. Space toggles play/pause, Ctrl/Cmd + ←/→ previous/next; OS media keys work too.
- **Currently playing:** the queue in play order. Double-click jumps to a track; Delete removes tracks from the queue.
- Filters, removed tracks, sort and column widths are remembered in the browser. The queue and position are remembered in the browser and saved to the Navidrome play queue (shared with other clients of the account). The catalog is cached in IndexedDB and revalidated every minute and when the tab becomes visible.

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
- [x] M3 — `/api/stream` (Range, seeking), `/api/cover`, `/api/health`, `/api/queue`
- [x] M5 — Catalog loaded in the browser (IndexedDB cache, ETag revalidation)
- [x] M6 — Cascading multi-select filters (Folder → Genre → Artist → Album)
- [x] M7 — Virtualized track table: sort, resize, multi-select, remove from results
- [x] M8 — Player: transport, seek, volume, queue ("Currently playing"), Media Session, saved queue
- [ ] M4 — Docker image, Unraid template, CI
