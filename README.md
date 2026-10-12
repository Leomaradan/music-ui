# Music UI

Web music player for a private [Navidrome](https://www.navidrome.org/) server (Subsonic API), built with Next.js and Material UI. It runs in Docker on Unraid. See [PLAN.md](PLAN.md) for the full design and milestones.

## Requirements

- Node.js 26 (`.nvmrc`)
- pnpm 10 (`packageManager` field; `npm i -g pnpm@10` if corepack is not available)

## Development

```sh
pnpm install
cp .env.example .env.local   # not used yet, wired in M1
pnpm dev                      # http://localhost:3000
```

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
- [ ] M1 — Navidrome client and env config
