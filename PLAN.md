# Music UI — Base Application Plan

Scope of this plan: the **foundation** only. It covers running the app in Docker on a NAS, talking to a private Subsonic server through a server-side proxy, and listing music across several Subsonic music folders. UI features (player, queue, playlists, search UX, theming, and so on) will be specified later and are out of scope here.

---

## 1. Goals & constraints

| Constraint | Consequence for the design |
|---|---|
| Hosted as a Docker container on a NAS | Small image built with Next.js `standalone` output, configured at **runtime** through env vars, multi-arch build (amd64 + arm64) |
| Subsonic server is **not public**, LAN only | The browser never talks to Subsonic. The Next.js server is the only thing that does, so it acts as a **BFF / proxy** |
| Next.js + Material UI | App Router, React Server Components for data pages, MUI with the App Router emotion cache integration |
| App revolves around **multiple music folders** | The "current music folder" is a first-class concept in routing, in the API layer and in the UI shell |

Non-goals for this phase: playback UI, scrobbling, playlists editing, offline mode, multi-server.

---

## 2. Architecture

```
┌──────────── Browser (LAN / VPN) ────────────┐
│  Next.js client components (MUI)            │
│  <img src="/api/cover/…">  <audio src="/api/stream/…">
└───────────────┬─────────────────────────────┘
                │ HTTP (only the app's origin)
┌───────────────▼──────────── Docker container on NAS ───────────┐
│ Next.js server (Node runtime)                                  │
│  ├─ Server Components ──► lib/subsonic (typed client)          │
│  ├─ Route handlers  /api/stream, /api/cover, /api/health …     │
│  ├─ Session (encrypted httpOnly cookie)                        │
│  └─ Subsonic credentials NEVER leave the server                │
└───────────────┬────────────────────────────────────────────────┘
                │ HTTP on LAN / docker network (SUBSONIC_URL)
┌───────────────▼───────────┐
│ Subsonic-compatible server │  (Navidrome, Airsonic-Advanced, Gonic, …)
└────────────────────────────┘
```

Key principles:

1. **No generic pass-through proxy.** Exposing `/api/subsonic/[...method]` with server-side credentials would let any client call admin endpoints. Instead:
   - JSON metadata calls (`getMusicFolders`, `getArtists`, `getAlbumList2`, …) are made **server-side** through a typed client and rendered by Server Components or returned by narrow route handlers.
   - **Binary** endpoints (`stream`, `getCoverArt`, later `download`) go through dedicated, allow-listed streaming route handlers.
2. **Range requests are forwarded** so the browser can seek in audio.
3. **Runtime configuration.** No `NEXT_PUBLIC_*` value depends on the deployment, so one image works on any NAS.

---

## 3. Tech stack

- **Runtime:** Node.js 22 LTS (Alpine image)
- **Framework:** Next.js (latest stable, App Router, TypeScript strict, `output: "standalone"`)
- **UI:** MUI (`@mui/material`, `@mui/icons-material`) with `@mui/material-nextjs` (`AppRouterCacheProvider`), plus Roboto through `next/font`
- **Session:** `iron-session` (encrypted, signed httpOnly cookie, no database)
- **Validation:** `zod` for env parsing and Subsonic response shapes at the boundary
- **Client data fetching (for pagination / infinite lists):** TanStack Query, calling the app's own route handlers
- **Package manager:** pnpm
- **Quality:** ESLint, Prettier, Vitest (+ MSW for mocking Subsonic), Playwright (smoke tests)
- **CI:** GitHub Actions that run lint, typecheck and tests, then build a multi-arch image and push it to GHCR

---

## 4. Subsonic integration

### 4.1 Authentication to Subsonic
- Use **token auth**: `u=<user>&t=md5(password+salt)&s=<salt>&v=1.16.1&c=music-ui&f=json`.
- If the server advertises the OpenSubsonic `apiKeyAuthentication` extension, the client can also support `apiKey=` (optional, behind a capability check).
- Never use plain `p=` or hex passwords.

### 4.2 Typed client — `src/lib/subsonic/`
```
client.ts      // buildUrl(), request<T>(method, params), error mapping
auth.ts        // salt/token generation
types.ts       // MusicFolder, Artist, Album, Child (song), Directory, …
endpoints.ts   // typed wrappers (below)
errors.ts      // SubsonicError(code, message) + HTTP mapping
```
- Every response is wrapped in `subsonic-response`. Subsonic returns **HTTP 200 even on failure** (`status: "failed"`), so the client unwraps and throws `SubsonicError`:
  - `40/41/44` → 401 (bad credentials / token), `50` → 403, `70` → 404, others → 502.
- Timeouts through `AbortSignal.timeout()`, plus one retry on network error for idempotent GETs.
- Server-only module (`import "server-only"`) so it can never be bundled client-side.

### 4.3 Endpoints needed for the base app

| Purpose | Endpoint | Notes |
|---|---|---|
| Health / connectivity | `ping` | Used by `/api/health` and the login check |
| Capabilities | `getOpenSubsonicExtensions` | Optional; detect Navidrome/OpenSubsonic features |
| **Music folders** | `getMusicFolders` | Root of the whole app |
| Artists (ID3) | `getArtists?musicFolderId=` | Indexed A–Z |
| Artist detail | `getArtist?id=` | Albums of the artist |
| Album list | `getAlbumList2?type=alphabeticalByName&size=&offset=&musicFolderId=` | Paginated |
| Album detail | `getAlbum?id=` | Tracks |
| File-tree browsing | `getIndexes?musicFolderId=` + `getMusicDirectory?id=` | "Folder" view, since folders matter for this app |
| Cover art | `getCoverArt?id=&size=` | Proxied binary |
| Stream | `stream?id=&maxBitRate=&format=` | Proxied binary with Range (needed only to validate the proxy in this phase) |

> **ID3 vs file-tree:** both are planned. The ID3 view (`getArtists`/`getAlbum`) gives clean metadata. The file-tree view (`getIndexes`/`getMusicDirectory`) mirrors the on-disk folder structure. Because the app centers on music folders, the base app ships both, behind a simple view toggle.

### 4.4 Multiple music folders
- `musicFolderId` is an optional param on most list endpoints. The app models a **folder scope**:
  - `all`: no `musicFolderId` param (aggregated)
  - `<id>`: scoped to one folder
- The scope lives in the **URL** (shareable, server-renderable): `/f/[folderId]/…`, where `folderId` = `all` or a numeric id.
- The layout loads `getMusicFolders` once (cached) and renders a folder switcher in the app shell.
- The last used folder is remembered in a cookie so `/` redirects to `/f/<last>/albums`.
- Edge cases: a folder the user has no access to (Subsonic returns a reduced list, so validate the id against it → 404), a server with a single folder (hide the switcher), and a deleted folder (fall back to `all`).

---

## 5. Proxy / route handlers (`src/app/api/`)

| Route | Method | Behavior |
|---|---|---|
| `/api/health` | GET | `200 {app:"ok", subsonic:"ok"\|"unreachable"}`, used by the Docker `HEALTHCHECK` (the app answers even if Subsonic is down, reporting it as degraded) |
| `/api/auth/login` | POST | Validates credentials with `ping`, then creates the session |
| `/api/auth/logout` | POST | Destroys the session |
| `/api/cover/[id]` | GET | Proxies `getCoverArt`. `?size=` limited to a whitelist (64/150/300/600/1200). Sends `Cache-Control: private, max-age=31536000, immutable` |
| `/api/stream/[id]` | GET | Proxies `stream`. Forwards the `Range` header, streams `upstream.body`, copies `Content-Type`, `Content-Length`, `Content-Range`, `Accept-Ranges`, keeps the status (`200`/`206`), and aborts upstream when the client disconnects (`request.signal`) |
| `/api/folders/[folderId]/albums` | GET | JSON pagination for infinite scroll (`offset`, `size`, `type`) |

All handlers: `export const runtime = "nodejs"` and `dynamic = "force-dynamic"`. A session is required (otherwise 401). Ids are validated with zod (Subsonic ids are opaque strings, so length and charset are checked).

---

## 6. Authentication of app users

**Recommended: log in with the Subsonic account.**
- The login page posts username and password. The server calls `ping` with token auth.
- On success the session cookie stores `{ username, token, salt }` (token = md5(password+salt)). The password itself is **not** stored. The token+salt pair is reusable for Subsonic calls, and the cookie is encrypted with `SESSION_SECRET`.
- This respects per-user folder permissions configured in Subsonic, which matters for a multi-folder app.
- The route guard runs in `proxy.ts` (Next.js ≥16 name for `middleware.ts`). It redirects to `/login` when no session cookie exists. The full check happens server-side in the data layer.

**Alternative (optional flag): single-user mode.** With `SUBSONIC_USER` + `SUBSONIC_PASSWORD` set in env and `AUTH_MODE=none`, the login page is skipped. This is handy for a home NAS that only you use on the LAN.

---

## 7. Routes / pages (base app)

```
/login                                 Login form
/                                      → redirect to /f/<lastFolder|all>/albums
/f/[folderId]/albums                   Album grid (paginated, ID3)
/f/[folderId]/artists                  Artist index A–Z (ID3)
/f/[folderId]/artists/[artistId]       Artist → albums
/f/[folderId]/albums/[albumId]         Album → track list
/f/[folderId]/browse                   File-tree root (getIndexes)
/f/[folderId]/browse/[dirId]           Directory (getMusicDirectory)
/settings                              Server info, connection status, logout
```

Each segment gets `loading.tsx` (MUI Skeletons), `error.tsx` (it maps `SubsonicError` to a friendly message) and `not-found.tsx`.

**App shell (minimal, refined later):** MUI `AppBar` with the folder switcher (`Select`), a responsive `Drawer` (Albums / Artists / Browse / Settings), and light/dark theme following the system (`CssVarsProvider` / `colorSchemes`). Lists are plain MUI `ImageList` / `List`. Virtualization and the player bar come with the UI phase.

---

## 8. Project structure

```
music-ui/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/page.tsx
│  │  ├─ (app)/layout.tsx              # shell: AppBar, Drawer, folder switcher
│  │  ├─ (app)/f/[folderId]/…          # pages from §7
│  │  ├─ (app)/settings/page.tsx
│  │  ├─ api/{health,auth,cover,stream,folders}/…
│  │  ├─ layout.tsx                    # <AppRouterCacheProvider><ThemeProvider>
│  │  └─ page.tsx                      # redirect
│  ├─ lib/
│  │  ├─ subsonic/                     # §4.2 (server-only)
│  │  ├─ session.ts                    # iron-session helpers
│  │  ├─ env.ts                        # zod-validated env, fails fast at boot
│  │  └─ folders.ts                    # folder-scope helpers (all | id)
│  ├─ components/                      # FolderSwitcher, AlbumCard, CoverArt, …
│  ├─ theme/                           # MUI theme
│  └─ proxy.ts                         # route guard
├─ tests/ (unit + e2e)
├─ docker/
│  └─ compose.dev.yml                  # Navidrome + sample music for local dev
├─ Dockerfile
├─ compose.yml                         # example for the NAS
├─ .env.example
└─ next.config.ts                      # output: "standalone"
```

---

## 9. Configuration (runtime env)

| Variable | Required | Example | Description |
|---|---|---|---|
| `SUBSONIC_URL` | ✅ | `http://192.168.1.20:4533` or `http://navidrome:4533` | Internal URL, reachable from the container only |
| `SESSION_SECRET` | ✅ | 32+ random chars | Cookie encryption |
| `AUTH_MODE` | | `subsonic` (default) \| `none` | §6 |
| `SUBSONIC_USER` / `SUBSONIC_PASSWORD` | if `AUTH_MODE=none` | | Single-user mode |
| `SUBSONIC_CLIENT_NAME` | | `music-ui` | `c=` param |
| `COOKIE_SECURE` | | `false` | Set to `true` behind HTTPS reverse proxy. On a plain-HTTP LAN it must be `false`, otherwise the cookie is dropped |
| `PORT` | | `3000` | |
| `LOG_LEVEL` | | `info` | |

`src/lib/env.ts` validates these at startup, so a misconfigured container exits immediately with a clear message.

---

## 10. Docker & NAS deployment

**Dockerfile (multi-stage):**
1. `deps`: `node:22-alpine`, `corepack enable`, `pnpm install --frozen-lockfile`
2. `build`: `pnpm build` (standalone output, telemetry disabled)
3. `runner`: `node:22-alpine`. It copies `.next/standalone`, `.next/static` and `public`, runs as a non-root `node` user, uses `EXPOSE 3000` and `CMD ["node","server.js"]`, and sets `HEALTHCHECK` to `wget -qO- http://127.0.0.1:3000/api/health`.

Target image size: about 150 MB. Built with `docker buildx` for `linux/amd64,linux/arm64` (Synology/QNAP/ARM NAS).

**compose.yml (NAS example):**
```yaml
services:
  music-ui:
    image: ghcr.io/leomaradan/music-ui:latest
    restart: unless-stopped
    ports: ["3000:3000"]
    environment:
      SUBSONIC_URL: http://navidrome:4533   # or the LAN IP of the Subsonic server
      SESSION_SECRET: ${SESSION_SECRET}
      COOKIE_SECURE: "false"
    networks: [music]
networks:
  music:
    external: true   # shared with the Subsonic container if it runs on the same NAS
```

Networking notes:
- **Subsonic in Docker on the same NAS:** join the same Docker network and use the service name. Nothing needs to be exposed.
- **Subsonic on the host or another machine:** use its LAN IP (`host.docker.internal` is not reliable on NAS Docker. Use the IP or `network_mode: host`).
- Remote access, if wanted later, goes through the NAS reverse proxy or a VPN to this app only. Subsonic stays private.

---

## 11. Caching & performance (base level)

- `getMusicFolders`, `getArtists`, `getIndexes`: server-side cache via `unstable_cache` / `"use cache"`. The key includes **username + folderId** (permissions differ per user). TTL is 5 min, and a manual "refresh" in settings revalidates the tag.
- Album/artist detail: short TTL (60 s).
- Cover art: immutable browser cache. A server-side disk cache is not needed in phase 1.
- Stream: never cached. Pure pass-through.

---

## 12. Testing & quality

- **Unit (Vitest):** token generation, URL building, error mapping, response unwrapping, folder-scope parsing, Range header forwarding logic.
- **Integration (Vitest + MSW):** route handlers against a mocked Subsonic (including `status:"failed"` responses and 206 partial content).
- **E2E smoke (Playwright):** run against `docker/compose.dev.yml` (Navidrome with a few CC-licensed tracks in **two music folders**). The tests log in, switch folders, list albums, open an album, fetch a cover, and request a stream with `Range: bytes=0-1023` (expect 206).
- **CI:** lint, typecheck, unit tests, build, Docker build. The image is pushed to GHCR on `main` and on tags.

---

## 13. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold: Next.js + TS + MUI + ESLint/Prettier + Vitest | `pnpm dev` shows a themed MUI page |
| M1 | `env.ts` + Subsonic client + unit tests | `ping`/`getMusicFolders` work against dev Navidrome |
| M2 | Session + login/logout + route guard (+ `AUTH_MODE=none`) | Unauthenticated users are redirected; bad credentials show an error |
| M3 | Binary proxy: `/api/cover`, `/api/stream`, `/api/health` | Covers render; stream answers 206 to Range requests; health is OK |
| M4 | Folder scope + app shell + folder switcher | Switching folders changes the URL and the data |
| M5 | Listing pages (albums, artists, artist, album, browse) | All §7 pages render real data in both `all` and single-folder scope |
| M6 | Dockerfile + compose + multi-arch CI build | Container runs on the NAS and reaches Subsonic over the LAN |

---

## 14. Open questions (to confirm before / during M1)

1. **Which Subsonic server?** (Navidrome, Airsonic-Advanced, Gonic, original Subsonic…). This decides OpenSubsonic features and whether `musicFolderId` is honored on every endpoint (Navidrome historically had partial support for it on some endpoints).
2. **Auth model:** per-user Subsonic login (recommended), or single-user env credentials?
3. **Access:** LAN only over HTTP, or also through a reverse proxy with HTTPS (affects `COOKIE_SECURE`, base path)?
4. **Folder semantics:** is "all folders" a useful view, or should the app always be scoped to exactly one folder?
5. **NAS model / CPU arch**, to confirm that arm64 builds are needed.
