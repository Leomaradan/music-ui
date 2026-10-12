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

### Dev Navidrome

A Navidrome with two libraries ("Main" and "Live") and generated sample tracks, for development and integration tests. Requires `ffmpeg` and Docker.

```sh
pnpm navidrome:music                              # generate ./docker/music (sine tones, tagged)
docker compose -f docker/compose.dev.yml up -d
pnpm navidrome:setup                              # admin/admin, libraries, app user music/music
pnpm test:integration                             # runs against http://localhost:4533
```

`.env.local` for this setup: `SUBSONIC_URL=http://localhost:4533`, `SUBSONIC_USER=music`, `SUBSONIC_PASSWORD=music`.

| Script                              | Purpose                                             |
| ----------------------------------- | --------------------------------------------------- |
| `pnpm dev`                          | Dev server                                          |
| `pnpm build` / `pnpm start`         | Production build (standalone output) / serve it     |
| `pnpm lint`                         | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `pnpm typecheck`                    | `tsc --noEmit`                                      |
| `pnpm format` / `pnpm format:check` | Prettier                                            |
| `pnpm test`                         | Vitest (jsdom + Testing Library)                    |

## Status

- [x] M0 — Scaffold: Next.js, TypeScript, MUI theme (light/dark), static app shell, ESLint/Prettier, Vitest
- [x] M1 — Runtime config validation, typed Navidrome (Subsonic) client, dev Navidrome with two libraries
- [ ] M2 — SQLite catalog sync
