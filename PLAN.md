# Music UI — Application Plan

A self-hosted web music player in the style of a desktop music library: a column browser with cascading filters and a track table. It runs in Docker on an **Unraid** server and uses a private **Subsonic-compatible** server (Airsonic in this document; the final choice is still open, see §13) as its music backend.

- **Phase 1 (base):** running, configuration, Subsonic proxy, music catalog, listing.
- **Phase 2 (UI):** player bar, playlists sidebar, cascading filters, track table, drag & drop.

---

## 1. Context & decisions

| Topic | Decision |
|---|---|
| Host | Unraid, x86-64 → image built for `linux/amd64` only |
| Backend | **Subsonic-compatible server, not installed yet** (Airsonic, Airsonic-Advanced or Navidrome, see §13). The app targets the **common Subsonic API 1.15** and builds its own catalog (§5), so it does not depend on server-specific features |
| Network | **LAN only**, plain HTTP. Airsonic is reachable only from the app container |
| Accounts | **One shared Airsonic account** configured by env vars. The app has **no login screen** |
| Stack | Next.js (App Router, TypeScript) + Material UI, Node.js **26 LTS** (`node:26-alpine`) |
| Music folders | First-class concept: the first filter box, and an "all folders" state when nothing is selected |

---

## 2. Architecture

```
┌──────────────────────── Browser (LAN) ─────────────────────────┐
│ Single-page UI (client components, MUI)                        │
│  • catalog store (all tracks, in memory) → facets & table      │
│  • player (<audio src="/api/stream/:id">)                      │
└───────────────┬────────────────────────────────────────────────┘
                │ HTTP, app origin only
┌───────────────▼──────────── Docker container (Unraid) ─────────┐
│ Next.js server (Node 26)                                       │
│  ├─ lib/subsonic      typed Airsonic client (server-only)      │
│  ├─ lib/catalog       sync job: Airsonic → SQLite (/data)      │
│  ├─ /api/catalog      compact catalog snapshot (ETag)          │
│  ├─ /api/stream/:id   audio proxy (Range passthrough)          │
│  ├─ /api/cover/:id    cover art proxy (cached)                 │
│  ├─ /api/playlists…   playlist CRUD → Airsonic                 │
│  └─ /api/health                                                │
└───────────────┬────────────────────────────────────────────────┘
                │ HTTP on LAN (SUBSONIC_URL), shared account
┌───────────────▼───────────┐
│ Airsonic                   │
└────────────────────────────┘
```

### Why a local catalog?
The UI needs **cascading facets**: Folder → Genre → Artist → Album, each one multi-select. The Subsonic/Airsonic API cannot answer these questions directly:
- `getGenres` cannot be limited to a music folder.
- There is no endpoint for "artists within these genres" or "albums of these artists within these genres".
- `getSongsByGenre` takes a single genre and pages slowly.

So the server **syncs the whole library metadata** from Airsonic into SQLite. The browser loads a compact snapshot once and computes facets and the table **in memory**. The cascade is then instant, works for any combination of filters, and the "remove from results" exclusions stay purely client-side.

Rough size: 50 000 tracks come to about 6–8 MB of JSON, or about 1–1.5 MB gzipped. That is a one-time load on the LAN, and the browser can cache it (ETag + IndexedDB).

### Principles
1. **Credentials never leave the server.** Every Airsonic call is made server-side with token auth: `t = md5(password + salt)` with a fresh random salt for each request.
2. **No generic pass-through proxy.** Only allow-listed operations are exposed: stream, cover, catalog, playlists and play queue.
3. **Runtime configuration.** The same image works on any host, and invalid settings stop the app at startup with a clear message.

---

## 3. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node.js 26 LTS, `node:26-alpine` | |
| Framework | Next.js latest stable, App Router, `output: "standalone"` | |
| UI kit | `@mui/material`, `@mui/icons-material`, `@mui/material-nextjs` | Theme with light and dark color schemes |
| Server DB | SQLite via built-in **`node:sqlite`** | Built into Node, so there is nothing native to compile on Alpine. `better-sqlite3` is the fallback if needed |
| Client state | **Zustand** (catalog, filters, selection, player, playlists) | Small stores with selectors |
| Track table | **TanStack Table + TanStack Virtual**, rendered with MUI `Table` components | Handles tens of thousands of rows, sorting, multi-select. Avoids MUI X Pro licensing |
| Drag & drop | **dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`) | Reordering the sidebar, and dragging table rows onto the sidebar |
| Validation | `zod` | Env vars, API inputs, Airsonic responses |
| Tests | Vitest + MSW, Playwright | |
| Tooling | pnpm, ESLint, Prettier, TypeScript strict | |
| CI | GitHub Actions → GHCR (`linux/amd64`) | |

---

## 4. Airsonic integration (`src/lib/subsonic/`, server-only)

- Requests use `u`, `t`, `s`, `v=1.15.0`, `c=music-ui` and `f=json`. Version 1.15.0 is understood by both Airsonic and Airsonic-Advanced.
- Responses are unwrapped from `subsonic-response`. Because Airsonic returns **HTTP 200 on failure**, `status:"failed"` is turned into `SubsonicError(code)`: 40/41 → 401, 50 → 403, 70 → 404, anything else → 502.
- Each request has a timeout (`AbortSignal.timeout`). A concurrency limiter (about 4 parallel calls) keeps the sync from overloading Airsonic.

| Use | Endpoint |
|---|---|
| Health | `ping` |
| Folders | `getMusicFolders` |
| Catalog crawl | `getAlbumList2?type=alphabeticalByName&size=500&offset=&musicFolderId=` followed by `getAlbum?id=` |
| Change detection | `getIndexes?ifModifiedSince=` (gives `lastModified`), `getScanStatus` |
| Cover | `getCoverArt?id=&size=` |
| Stream | `stream?id=&format=raw` (`raw` = no transcoding, so seeking with Range works) |
| Playlists | `getPlaylists`, `getPlaylist`, `createPlaylist`, `updatePlaylist`, `deletePlaylist` |
| Play queue | `getPlayQueue`, `savePlayQueue` |

---

## 5. Catalog sync (`src/lib/catalog/`)

**SQLite schema (`/data/music-ui.db`):**
```
folders(id, name)
albums (id, folderId, name, artist, artistId, year, genre, coverArt, songCount, created)
tracks (id, folderId, albumId, title, artist, artistId,
        albumArtist, albumArtistId,   -- copied from the album (getAlbum)
        album, genre, year,
        track, disc, duration, bitRate, suffix, size, coverArt, path)
meta   (key, value)        -- lastSync, lastModified, catalogVersion
app_state(key, json)       -- sidebar playlist order, misc UI prefs
```

**Sync algorithm:**
1. `getMusicFolders` returns the list of folders.
2. For each folder, page through `getAlbumList2(musicFolderId)` to get its albums. This gives a reliable album → folder mapping.
3. **Incremental:** call `getAlbum` only for albums that are new or changed (different `songCount` or `created`). Rows for albums that disappeared are deleted.
4. Rows are written in one transaction, then `catalogVersion` is increased.

**Triggers:**
- At startup if the DB is empty.
- Periodically: every `SYNC_INTERVAL_MINUTES`, a cheap check (`getIndexes` `lastModified` + `getScanStatus`) starts a sync only when something changed.
- A manual "Rescan" button in Settings.

Only one sync runs at a time (in-process lock). Progress is available at `/api/catalog/status`.

**Snapshot endpoint `/api/catalog`:**
- Format is columnar and compact: `{version, folders[], genres[], artists[], albums[], tracks:{id[], title[], artistIdx[], albumIdx[], genreIdx[], folderIdx[], year[], track[], disc[], duration[], …}}`. Strings are stored once in dictionaries and tracks refer to them by index.
- Responses are gzipped and carry `ETag: catalogVersion`. The client caches the snapshot in IndexedDB and revalidates with `If-None-Match`.

---

## 6. Server routes (`src/app/api/`)

| Route | Method | Behavior |
|---|---|---|
| `/api/health` | GET | App status, Airsonic reachability and sync state. Used by the Docker `HEALTHCHECK` |
| `/api/catalog` | GET | Snapshot (§5), returns 304 when unchanged |
| `/api/catalog/status` | GET | `{syncing, progress, lastSync, trackCount}` |
| `/api/catalog/rescan` | POST | Starts a sync |
| `/api/stream/[id]` | GET | Proxies `stream`. Forwards `Range`, streams the body, copies `Content-Type/Length/Range` and `Accept-Ranges`, keeps 200/206, and aborts the upstream call when the client disconnects |
| `/api/cover/[id]` | GET | Proxies `getCoverArt`, only for sizes 64/150/300/600, with `Cache-Control: max-age=31536000, immutable` |
| `/api/playlists` | GET / POST | List playlists (merged with the stored order) / create one from `songIds[]` |
| `/api/playlists/[id]` | GET / PATCH / DELETE | Tracks / rename, add, remove, reorder tracks / delete |
| `/api/playlists/order` | PUT | Saves the sidebar order in `app_state` |
| `/api/queue` | GET / PUT | Airsonic play queue ("currently playing") so it is restored after a reload |

All routes use the Node runtime and are dynamic. Ids are validated with zod.

---

## 7. UI specification (Phase 2)

Everything lives on a single page. Settings open in a dialog.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⏮  ⏯  ⏹  ⏭   ▶ Title — Artist        0:42 ━━━━━━●──────────── 3:57   ⚙ │  ← player bar
├───────────────┬──────────────────────────────────────────────────────────┤
│ ▶ Currently   │ ┌ Folder ───┐┌ Genre ────┐┌ Artist ───┐┌ Album ────┐     │
│   playing     │ │☐ Main     ││☐ Pop      ││☐ ABBA     ││☐ Pump     │     │  ← filters
│ 🔎 Filter     │ │☑ Live     ││☑ Rock     ││☑ Aerosmith││☐ Toys…    │     │
│   results     │ │…          ││…          ││…          ││…          │     │
│ ──────────    │ └───────────┘└───────────┘└───────────┘└───────────┘     │
│ ≡ Road trip   ├──────────────────────────────────────────────────────────┤
│ ≡ Chill       │ #  Title          Artist     Album    Genre Year  Time  │  ← track table
│ ≡ Workout     │ 1  Dream On       Aerosmith  Aeros…   Rock  1973  4:28  │
│ (drop here →  │ 2  Walk This Way  Aerosmith  Toys…    Rock  1975  3:40  │
│  new list)    │ …                                                        │
└───────────────┴──────────────────────────────────────────────────────────┘
```

Layout uses CSS grid: the top bar has a fixed height, and below it the sidebar has a fixed width (resizable later). On the right, the filter panel takes a fixed height that can be resized with a splitter, and the table fills the remaining space with internal scrolling only.

### 7.1 Player bar (top)
- **Previous / Play-Pause / Stop / Next** (MUI `IconButton`s), a **seek slider** (MUI `Slider`) with elapsed/total time, and the current track (cover thumbnail, title, artist).
- Engine: a single `HTMLAudioElement` held by `playerStore`, with `src=/api/stream/:id`. Seeking sets `currentTime`, which works through Range requests (§6).
- Behavior:
  - Stop pauses and goes back to 0:00.
  - Previous restarts the current track if more than 3 s have played, otherwise it goes to the previous track.
  - Next plays the next track in the queue.
  - At the end of a track the next one starts automatically.
- The next track is preloaded through a second hidden `<audio preload="auto">` for gapless-ish playback.
- Media Session API: OS media keys and lock-screen controls.
- Keyboard: Space toggles play/pause, Ctrl+← / Ctrl+→ go to previous / next.

### 7.2 Sidebar (left)
Items, from top to bottom:
1. **Currently playing.** Always first and fixed. It is the play queue. Selecting it shows the queue in the table, with the current track highlighted.
2. **Filter results.** Fixed. It is the virtual list produced by the current filters minus exclusions. Selecting it shows the filter panel and the filtered table.
3. **Custom playlists.** Stored in Airsonic. They can be **reordered with drag & drop** (dnd-kit sortable), and the order is saved through `/api/playlists/order`. Each one offers rename and delete in a context menu.

Drop targets for tracks dragged from the table:
- The **empty area / "new playlist" zone** creates a new playlist. It is created immediately with an inline-editable default name ("New playlist").
- An **existing playlist**: the tracks are appended to it.
- **Currently playing**: the tracks are added to the end of the queue.

The **filter boxes are always visible**, whichever sidebar item is selected. When "Currently playing" or a custom playlist is shown, the boxes keep displaying the current filter state but do not filter that list. **Changing any filter switches the view to "Filter results".**

### 7.3 Filters (right, upper part)
Four boxes in a row: **Music Folder → Genre → Artist → Album**.
- The **Artist** box uses the **album artist** (`albumArtist` from §5), not the track artist. A compilation therefore appears under its album artist (for example "Various Artists"), and a "feat." track appears under the main album's artist.
- Each box is a **multi-select list** (MUI `List` with checkboxes, virtualized for long lists). Each box has a small search field, a "clear" action and a count per item.
- **Nothing selected = everything selected** for that level.
- **Cascade (options):** each box only lists values present in the tracks that match all **previous** boxes.
  - Genre options come from the tracks in the selected folders (or all folders).
  - Artist options come from the tracks matching folder ∩ genre.
  - Album options come from the tracks matching folder ∩ genre ∩ artist.
- **Cascade (reset):** changing a selection in a box **clears the selection of every box after it**. For example, changing Genre from Rock to Pop clears Artist and Album.
- Facets are computed in memory with memoized selectors over the catalog store. Track index arrays are filtered level by level, so each step only scans the previous step's result.

### 7.4 Track table (right, lower part)
- Rows = tracks matching **all four** filters minus the **exclusions**. For example, selecting Aerosmith as Artist lists every Aerosmith track until specific Albums are selected.
- Columns: `#`, Title, Artist, Album, Genre, Year, Duration, Folder, Format/Bitrate. Columns are sortable (click a header) and their width can be changed. The default sort is Artist → Year → Album → Disc → Track.
- Virtualized rows, so 50k+ tracks remain smooth.
- **Selection:** click, Ctrl/Cmd-click (toggle), Shift-click (range), Ctrl+A (all).
- **Delete** key or the context menu "Remove from results" adds the selected tracks to the **exclusion set** of "Filter results". The tracks are hidden only. Nothing is deleted from disk or from the server. **The exclusion set is cleared whenever any filter changes**, so removed tracks come back.
  - Inside a custom playlist, Delete removes the tracks from that playlist through `updatePlaylist`.
  - Inside Currently playing, Delete removes the tracks from the queue.
- **Double-click** a track: the current table list, in its visible (sorted) order, replaces "Currently playing" and playback starts at that track.
- **Drag** the selected rows onto the sidebar (§7.2). A drag overlay shows "N tracks".

### 7.5 Client state (Zustand stores)
| Store | Contents | Persistence |
|---|---|---|
| `catalogStore` | Decoded snapshot, lookup maps | IndexedDB (snapshot + ETag) |
| `filterStore` | `folders[]`, `genres[]`, `albumArtists[]`, `albums[]`, `excluded: Set<trackId>` (cleared on any filter change) | localStorage |
| `viewStore` | Active sidebar item, table sort, column widths, row selection | localStorage (not selection) |
| `playerStore` | Queue (track ids), index, state, position, volume | Airsonic play queue + localStorage |
| `playlistStore` | Playlists, order, cached tracks | Server (`/api/playlists`) |

---

## 8. Project structure

```
music-ui/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                 # AppRouterCacheProvider + ThemeProvider
│  │  ├─ page.tsx                   # the single-page shell
│  │  └─ api/{health,catalog,stream,cover,playlists,queue}/…
│  ├─ lib/
│  │  ├─ env.ts                     # zod-validated runtime env
│  │  ├─ subsonic/                  # Airsonic client (server-only)
│  │  ├─ catalog/                   # sync job, SQLite repo, snapshot encoder
│  │  └─ db.ts                      # node:sqlite connection + migrations
│  ├─ client/
│  │  ├─ stores/                    # zustand stores (§7.5)
│  │  ├─ catalog/                   # snapshot decode + facet selectors
│  │  └─ player/                    # audio engine, media session
│  ├─ components/
│  │  ├─ PlayerBar/  Sidebar/  Filters/  TrackTable/  SettingsDialog/
│  └─ theme/
├─ tests/{unit,integration,e2e}/
├─ docker/compose.dev.yml           # Airsonic + sample music (2 folders) for dev/e2e
├─ unraid/music-ui.xml              # Unraid Docker template
├─ Dockerfile
├─ compose.yml
├─ .env.example
└─ next.config.ts                   # output: "standalone"
```

---

## 9. Configuration (runtime env)

| Variable | Required | Example | Description |
|---|---|---|---|
| `SUBSONIC_URL` | ✅ | `http://192.168.1.10:4040` | Airsonic URL as seen from the container |
| `SUBSONIC_USER` | ✅ | `music` | Shared account |
| `SUBSONIC_PASSWORD` | ✅ | | Shared account password, used only to compute tokens |
| `SYNC_INTERVAL_MINUTES` | | `15` | Change-check interval, `0` = manual only |
| `DATA_DIR` | | `/data` | SQLite location (mount it as a volume) |
| `PORT` | | `3000` | |
| `LOG_LEVEL` | | `info` | |

---

## 10. Docker & Unraid

**Dockerfile (multi-stage):**
1. `deps`: `node:26-alpine`, `corepack enable`, `pnpm install --frozen-lockfile`
2. `build`: `pnpm build` (standalone output)
3. `runner`: `node:26-alpine`, a non-root user, copies `.next/standalone`, `.next/static` and `public`. It declares `VOLUME /data`, `EXPOSE 3000`, a `HEALTHCHECK` on `/api/health` and runs `CMD ["node","server.js"]`.

The image is built for `linux/amd64` only and published to `ghcr.io/leomaradan/music-ui`.

**Unraid:**
- Ship `unraid/music-ui.xml`, a Docker template with:
  - port `3000`
  - `/data` → `/mnt/user/appdata/music-ui`
  - env vars from §9, with the password as a masked field
  - icon and WebUI link
- Networking:
  - If Airsonic runs as an Unraid container, put both on the same **custom Docker network** and use `http://airsonic:4040`.
  - Otherwise use the Unraid host LAN IP and Airsonic's mapped port.
  - Airsonic's port does not need to be published to the LAN at all when a custom network is used.
- `PUID/PGID`: the `/data` appdata folder must be writable by the container user (document `chown 99:100` (nobody:users), or run as `99:100`).

**compose.yml** (for non-template use):
```yaml
services:
  music-ui:
    image: ghcr.io/leomaradan/music-ui:latest
    restart: unless-stopped
    ports: ["3000:3000"]
    volumes: ["/mnt/user/appdata/music-ui:/data"]
    environment:
      SUBSONIC_URL: http://airsonic:4040
      SUBSONIC_USER: music
      SUBSONIC_PASSWORD: ${SUBSONIC_PASSWORD}
    networks: [music]
networks:
  music:
    external: true
```

---

## 11. Testing

- **Unit:** token/salt generation, Airsonic error mapping, snapshot encode/decode round-trip, **facet cascade** (options per level, reset of descendant boxes, empty = all), exclusions, table multi-select logic, player prev/next rules.
- **Integration (MSW):** sync (incremental: new, changed and removed albums), stream proxy (Range → 206, client abort), playlist routes.
- **E2E (Playwright)** against `docker/compose.dev.yml` (Airsonic + CC-licensed sample tracks in **two** music folders). The tests:
  - wait for the initial sync
  - filter Folder → Genre → Artist and check the cascade and resets
  - remove tracks from the results
  - drag the selection onto the sidebar, which creates a playlist
  - reorder playlists
  - play a track, seek, then use next and stop

---

## 12. Milestones

### Phase 1 — Base
| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold: Next.js + TS + MUI + ESLint/Prettier + Vitest, Node 26 | `pnpm dev` shows the themed empty shell |
| M1 | `env.ts` + Airsonic client + tests | `ping` and `getMusicFolders` work against the dev Airsonic |
| M2 | SQLite + catalog sync + `/api/catalog(/status,/rescan)` | Both dev folders are fully indexed, and a second sync is incremental |
| M3 | `/api/stream`, `/api/cover`, `/api/health` | 206 on Range, covers cached, health OK |
| M4 | Docker image + Unraid template + CI (amd64 → GHCR) | The container runs on Unraid, reaches Airsonic and syncs |

### Phase 2 — UI
| # | Milestone | Done when |
|---|---|---|
| M5 | Layout shell (player bar, sidebar, filters, table zones) + catalog store | The snapshot loads and is cached in IndexedDB |
| M6 | Cascading filters (4 multi-select boxes) | Cascade and reset rules from §7.3 pass the tests |
| M7 | Virtualized track table: sort, multi-select, remove from results | Smooth with 50k rows, exclusions work |
| M8 | Player bar + audio engine + Currently playing queue (+ Airsonic play queue) | Play, pause, stop, previous, next and seek work, and the queue survives a reload |
| M9 | Playlists: sidebar list, DnD reorder, drag tracks → new playlist, rename/delete | The order persists, and playlists also show up in Airsonic |
| M10 | Polish: keyboard shortcuts, Media Session, settings dialog (rescan, status), dark mode | |

---

## 13. Open questions & decisions log

**Decided:**
- Artist filter = **album artist**.
- Removed tracks come back **when any filter changes**.
- Dropping tracks on an existing playlist or on Currently playing **appends** them.
- Double-click **replaces the queue** with the table list and starts at that track.
- Filters are **always displayed**, and changing one switches the view to Filter results.
- Library size is unknown. The in-browser catalog is kept, and performance will be addressed later if needed.

**Still open:**
1. **Which server to install:** original Airsonic, Airsonic-Advanced or Navidrome. Recommendation: **Navidrome** first, otherwise Airsonic-Advanced. Original Airsonic is no longer maintained. The app is designed to work with any of them. One thing to verify before committing to Navidrome: that `getMusicFolders` returns its libraries and `getAlbumList2` honors `musicFolderId` (multi-library support since v0.58.0).
