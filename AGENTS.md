# Samhain Agent Guide

This app was scaffolded with `remix new`. Use these conventions when continuing to build it out.

## Commands

```sh
npm i
npm run dev
npm run hmr
npm run start
npm test
npm run typecheck
```

Use `npm run hmr` for live server and browser updates; `npm run dev` only watches and restarts the server. `npm run start` runs in production mode without a separate build step.

## Building Features

Refer to ./.agents/skills/remix/SKILL.md for the Remix mental model and how to find guides and API READMEs through `node_modules/remix/INDEX.md`.

## Starter Layout

- `app/routes.ts` defines the shared route contract used by server and browser modules for type-safe hrefs
- `app/router.ts` exports `createAppRouter({ db, ... })`, which installs middleware (database, cookie session, auth, Kroger client, renderer) and maps controllers; `server.ts` opens and migrates the SQLite database (`app/db.ts`, `db/migrations/`) before creating it
- Put top-level route actions in `app/actions/controller.tsx`; add `app/actions/<route-key>/controller.tsx` for nested route maps. `app/actions/controller.test.ts` is the root controller's router smoke test
- `app/tracks.ts` lists the tracklist pages (title, number, href); `app/actions/track-page.tsx` is their shared placeholder page
- `app/actions/home-page.tsx` renders the home page; `app/actions/document.tsx` owns the HTML shell and the global October Rust theme (color tokens and fonts on `<body>`). `bodyClass` lets a section scope extra styles (groceries uses it)
- `app/actions/public/` contains the browser runtime entry (needed for HMR and any future client components)
- `app/assets.ts` owns the server-side asset pipeline used by the asset route and render middleware
- Root `public/` contains static files served unchanged from the app root

## Groceries (`/groceries`)

5 Minute Groceries, ported from `../groceries` (Spring + React). `docs/groceries-migration/MIGRATION.md` is the behavior spec, decisions log, and cutover plan; `docs/groceries-migration/reference/` has screenshots of the original UI (layout reference; colors now follow October Rust). The Koog AI meal planner is intentionally not ported.

- `app/actions/groceries/` holds the route map (`routes.ts`, mounted in `app/routes.ts`), one directory per area (`auth`, `meals`, `shop`, `settings`, `orders`, `kroger`), and `layout.tsx`
- Browser code lives in `public/` directories; `app/actions/groceries/public/ui/` is the css() port of the source's shadcn components plus Lucide icons. `public/groceries/theme.css` maps the components' shadcn-style tokens (`--primary`, `--card`, …) onto the October Rust palette
- `app/data/groceries/` holds data access and business rules; every query of user-owned rows is scoped by `user_id`
- Client entries post with `app/actions/groceries/public/submit.ts` (JSON `{ location }` / `{ error }`) and then navigate; the same actions handle plain form posts with redirects. Do browser-only work in `ref()` callbacks or event handlers, never in component setup (setup also runs on the server)
- Tests: `test/router.ts` (`createTestApp`, `signIn`) for router tests, `test/fake-kroger.ts` instead of the real Kroger API, `*.test.browser.tsx` for client entries, `*.test.e2e.ts` for full flows
- Env: `SESSION_SECRET` (required in production), `DATABASE_PATH`, `KROGER_REDIRECT_URI`, `KROGER_API_BASE`
- Scripts: `node --import remix/node-tsx scripts/<name>.ts` — `migrate-from-h2.ts <csv-dir>`, `set-password.ts <email>`, `set-kroger-config.ts <email> <clientId> <clientSecret>`

Add directories like `app/ui/` only when you need them.
