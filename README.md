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

- **Filters:** four boxes, Music Folder → Genre → Artist (album artist) → Album. They select like a list: click selects one value, Ctrl/Cmd-click adds or removes one, Shift-click selects a range; _All_ (or nothing selected) means everything. Changing a box clears the boxes after it, and brings back tracks removed from the results.
- **Table:** click a header to sort (ascending, descending, off), drag a header's right edge to resize (double-click resets).
- **Selection:** click, Ctrl/Cmd-click, Shift-click, Ctrl/Cmd+A, arrow keys (Shift extends), Escape.
- **Remove from results:** Delete / Backspace, or right-click → _Remove from results_. Hidden only; _Restore_ in the status bar brings them back.
- **Play:** double-click a track (or select it and press Enter, or right-click → _Play_): the tracks listed in the table, in their displayed order, become "Currently playing" and playback starts at that track.
- **Player bar:** previous (restarts the track after 3 s), play/pause, stop, next, seek slider, volume. Space toggles play/pause, Ctrl/Cmd + ←/→ previous/next; OS media keys work too.
- **Currently playing:** the queue in play order. Double-click jumps to a track; Delete removes tracks from the queue.
- **Playlists** (stored in Navidrome): drag tracks from the table (the selection, or the dragged row) onto the dashed zone (above the playlists) to create a playlist, onto a playlist to append them, or onto _Currently playing_ to queue them. **+** creates an empty playlist. Drag playlists to reorder them (the order is kept by the app). Double-click a playlist to play it; right-click → _Rename_ or _Delete…_ (asks first). Open a playlist to see its tracks: Delete removes tracks from it, double-click plays it. Playlists you cannot change (owned by another user) show a lock.
- **Settings** (gear icon, top right): Navidrome connection and library sync status, _Rescan library_, theme (System / Light / Dark), reset of the table sort and column widths, and the list of keyboard shortcuts (also opened with `?`).
- Filters, removed tracks, sort and column widths are remembered in the browser. The queue and position are remembered in the browser and saved to the Navidrome play queue (shared with other clients of the account). Reloading the page while playing resumes playback where it was; if the browser blocks it, click anywhere (or press a key) to resume. The catalog is cached in IndexedDB and revalidated every minute and when the tab becomes visible.

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

## Deployment (Unraid)

The image `ghcr.io/leomaradan/music-ui` (linux/amd64) is built and published by CI on every push to `main` (`latest`) and on version tags (`v1.2.3` → `1.2.3`, `1.2`).

**Prerequisite: Navidrome** (0.58 or later). Create one Navidrome library per music folder, and a non-admin user with access to every library: the app uses that account.

**With the Unraid template**

1. Copy `unraid/music-ui.xml` to `/boot/config/plugins/dockerMan/templates-user/my-music-ui.xml` on the Unraid server (e.g. via the flash share).
2. _Docker → Add Container → Template: music-ui_.
3. Fill in _Navidrome URL_, _user_ and _password_. If Navidrome runs on the same server, put both containers on the same custom Docker network (_Network type_) and use `http://navidrome:4533`; otherwise use `http://<server IP>:4533`.
4. Apply, then open the WebUI (port 3000). The first library sync starts at once.

**With Docker Compose**: see `compose.yml` (`SUBSONIC_PASSWORD=… docker compose up -d`).

Notes:

- The container runs as `99:100` (nobody:users). If `/mnt/user/appdata/music-ui` belongs to someone else, the container stops at startup and prints the `chown` command to run.
- GitHub packages of a private repository are private: either make the `music-ui` package public (GitHub → Packages → music-ui → Package settings), or `docker login ghcr.io` on the server with a token that can read packages.
- To build the image yourself: `docker build -t music-ui .`
- `/api/health` reports `degraded` (HTTP 200) when Navidrome is unreachable: the container stays healthy, since restarting it would not help.

## Status

- [x] M0 — Scaffold: Next.js, TypeScript, MUI theme (light/dark), static app shell, oxlint/oxfmt, Vitest
- [x] M1 — Runtime config validation, typed Navidrome (Subsonic) client, dev Navidrome with two libraries
- [x] M2 — SQLite catalog (node:sqlite), sync from Navidrome, `/api/catalog`, `/api/catalog/status`, `/api/catalog/rescan`
- [x] M3 — `/api/stream` (Range, seeking), `/api/cover`, `/api/health`, `/api/queue`
- [x] M5 — Catalog loaded in the browser (IndexedDB cache, ETag revalidation)
- [x] M6 — Cascading multi-select filters (Folder → Genre → Artist → Album)
- [x] M7 — Virtualized track table: sort, resize, multi-select, remove from results
- [x] M8 — Player: transport, seek, volume, queue ("Currently playing"), Media Session, saved queue
- [x] M9 — Playlists: sidebar, drag tracks to create / append / queue, reorder, rename, delete
- [x] M10 — Settings (library status, rescan, theme, layout reset, shortcuts), track in the tab title
- [x] M4 — Docker image (`ghcr.io/leomaradan/music-ui`), Unraid template, CI
