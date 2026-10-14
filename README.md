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
node scripts/cli.mjs user add me   # an account for the login screen (once the app has started)
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
- **Player bar:** previous (restarts the track after 3 s), play/pause, stop, next, seek slider, volume.
- **Playback modes** (button next to _Next_): _In order_, _Shuffle_ (each track once), _Random_ (endless, avoids repeating tracks and artists too soon), _Shuffle by album_ / _Random by album_ (whole albums), _Shuffle by artist_ / _Random by artist_ (one album per artist). They apply to what you start playing (the listed tracks, or a playlist); the double-clicked track plays first. Changing the mode while playing re-plans what comes next. Space toggles play/pause, Ctrl/Cmd + ←/→ previous/next; OS media keys work too.
- **Currently playing:** the queue in play order. Double-click jumps to a track; Delete removes tracks from the queue.
- **Playlists** (stored in Navidrome): drag tracks from the table (the selection, or the dragged row) onto the dashed zone (above the playlists) to create a playlist, onto a playlist to append them, or onto _Currently playing_ to queue them. **+** creates an empty playlist. Drag playlists to reorder them (the order is kept by the app). Double-click a playlist to play it; right-click → _Rename_ or _Delete…_ (asks first). You can also drag values from the filter boxes (an artist, an album, a genre…; the selected values if you drag one of them): their tracks, within the boxes to the left, go to the playlist, the queue or a new playlist named after them. Open a playlist to see its tracks: Delete removes tracks from it, double-click plays it. Playlists you cannot change (owned by another user) show a lock.
- **Smart playlists** (stored by the app, not in Navidrome): **+** next to _Smart playlists_ opens the editor. Give it a name and criteria on tags: _Genre_, _Artist_ (album artist), _Track artist_, _Album_, _Music folder_, _Format_ with _is_ / _is not_ (no case or accent difference; a track with several genres "is" each of them), and _Year_ with _is_, _is not_, _before_, _up to_, _after_, _from_. Choose whether tracks must match _all criteria_ or _any criterion_; the editor shows how many tracks match as you type. The list follows the library: new or retagged tracks join or leave it after each sync. Click to list the tracks (sortable), double-click to play them; right-click → _Edit…_, _Save as playlist_ (a regular Navidrome playlist with the current tracks) or _Delete…_.
- **Track menu** (right-click, or ⋮ on a phone): _Play_, _Play next_, _Add to queue_, _Add to playlist…_ (an existing playlist or a new one), and remove.
- **On a phone** (narrower than 900 px): ☰ in the player bar opens the sidebar; _Filters_ opens the filter boxes full screen, one per tab (a tap adds or removes a value). A tap on a track plays it; ⋮ or a long press selects it, then taps add more tracks to the selection and a bar at the bottom plays them or adds them to the queue or a playlist. There is no drag and drop on phones.
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
| `pnpm test`                         | All Vitest projects: `unit` and `storybook` (below)                  |
| `pnpm test:unit`                    | Unit and jsdom UI tests (integration tests skip without a server)    |
| `pnpm test:storybook`               | Every story as a test in headless Chromium (play function + a11y)    |
| `pnpm test:integration`             | Integration tests against the dev Navidrome                          |
| `pnpm storybook`                    | Storybook on http://localhost:6006                                   |
| `pnpm build-storybook`              | Static Storybook in `storybook-static/`                              |

### Storybook and story tests

Each component has stories next to it (`src/components/**/X.stories.tsx`). Stories run without a
server:

- `tests/helpers/fake-api.ts` answers the app's `/api` JSON routes in memory.
- `.storybook/main.ts` serves `/api/stream` as silent audio (with byte ranges) and `/api/cover` as
  coloured squares, so the player really plays, pauses and seeks.

Before every story, `.storybook/preview.tsx` resets the stores, localStorage, the IndexedDB cache
and the fake API (`resetApp` in `tests/helpers/stories.ts`). The library is the sample catalog in
`tests/fixtures/catalog-snapshot.json`. A unit test keeps that file identical to what the sync
produces; regenerate it with `pnpm test:unit tests/fixtures -u`.

The [Vitest addon](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon) turns
every story into a test. It renders the story in Chromium and runs its `play` function, then runs
the accessibility checks (`a11y.test: 'error'`: violations fail). To cover a new feature, write a
story whose `play` function performs the interaction and asserts the result:

```tsx
export const ClickSelectsOne: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(option(canvasElement, 'Artist', 'ABBA'));
    expect(useFilterStore.getState().filters.artists).toEqual(['ABBA']);
  },
};
```

- **Story options:**
  - `parameters.fakeApi` sets what the fake API serves (playlists, saved queue, catalog).
  - `parameters.catalog: 'loading'` leaves the library for `CatalogLoader` to load.
  - `fakeApi().sent(method, url)` lists the requests the story made.
- **Native drag and drop:** `userEvent` can't do it; use `dragAndDrop` / `fireDrag` from
  `tests/helpers/dnd.ts`.
- **Running the tests:**
  - CI installs Chromium with `pnpm exec playwright install --with-deps chromium`.
  - To use a Chromium that is already installed, set `CHROMIUM_EXECUTABLE_PATH`, e.g.
    `CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm test:storybook`.
  - The Storybook UI can also run them: the "Run tests" button in the sidebar.

## Deployment (Unraid)

The image `ghcr.io/leomaradan/music-ui` (linux/amd64) is built and published by CI on every push to `main` (`latest`) and on version tags (`v1.2.3` → `1.2.3`, `1.2`).

**Prerequisite: Navidrome** (0.58 or later). Create one Navidrome library per music folder, and a non-admin user with access to every library: the app uses that account.

**With the Unraid template**

1. Copy `unraid/music-ui.xml` to `/boot/config/plugins/dockerMan/templates-user/my-music-ui.xml` on the Unraid server (e.g. via the flash share).
2. _Docker → Add Container → Template: music-ui_.
3. Fill in _Navidrome URL_, _user_ and _password_. If Navidrome runs on the same server, put both containers on the same custom Docker network (_Network type_) and use `http://navidrome:4533`; otherwise use `http://<server IP>:4533`.
4. Apply, then open the WebUI (port 3000). The first library sync starts at once.

**With Docker Compose**: see `compose.yml` (`SUBSONIC_PASSWORD=… docker compose up -d`).

**Accounts.** The UI is behind a login screen (`AUTH_ENABLED=true`, the default). The app still talks to Navidrome with its single shared account; these accounts only protect the UI. Manage them from the server (Unraid: the container's _Console_, or `docker exec`):

```sh
docker exec -it music-ui node cli.mjs user add alice      # asks for the password
docker exec -it music-ui node cli.mjs user passwd alice   # also signs alice out everywhere
docker exec -it music-ui node cli.mjs user remove alice
docker exec -it music-ui node cli.mjs user list
docker exec -it music-ui node cli.mjs sessions clear      # signs everyone out
echo 'secret-pass' | docker exec -i music-ui node cli.mjs user add bob   # scripted
```

Sessions last `SESSION_DAYS` (30) after the last visit. Set `AUTH_ENABLED=false` only when something in front of the app (a reverse proxy with its own login) already authenticates. `/api/health` stays public for the Docker healthcheck.

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
- [x] M11 — Storybook with story tests (Vitest addon: play functions + a11y checks in Chromium)
- [x] M12 — Login screen in front of the UI, accounts managed with `cli.mjs`
- [x] M13 — Smart playlists: saved criteria on tags (==, !=, and <, <=, >, >= on the year), all / any
- [x] M14 — Phone layout: sidebar drawer, filters dialog, two-line rows, track menu instead of drag and drop
