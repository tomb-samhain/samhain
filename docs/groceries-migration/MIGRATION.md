# Groceries → Samhain Migration Guide

This is the working reference for porting **5 Minute Groceries** (`../groceries`, a Spring Boot +
Kotlin API with a React/Vite SPA) into this Remix 3 app. Read it before starting any phase, and
update the checklists and the decisions log as you go.

- Source app: `/home/tomb/git/groceries` (last commit `779b9c0`, "model update and auth fixes")
- Target app: this repo (Remix 3, `remix` is the only runtime dependency)
- Visual reference: `docs/groceries-migration/reference/*.png` (captured from the running source app)
- **Out of scope: Koog AI meal planning.** Do not port `agent/`, `AgentController`, `MealPlanPage`,
  the `canUseAi` flag, the "Meal Plan" nav item, or the Gemini key. See [Excluded](#excluded-koog-ai).

## Status (2026-10-04)

Phases 0–7 are built on the `groceries-migration` branch: every page, the Kroger
integration, and 176 tests (`npm test`: server, browser, and end-to-end). Phase 8 (running
the import on the production H2 data and cutting over) needs production access and is
not done. Deviations from the original plan are recorded in [§14](#14-decisions-log).

---

## Contents

1. [What the source app does](#1-what-the-source-app-does)
2. [Target architecture](#2-target-architecture)
3. [React → Remix 3 differences that matter here](#3-react--remix-3-differences-that-matter-here)
4. [Data model and persistence](#4-data-model-and-persistence)
5. [Authentication and sessions](#5-authentication-and-sessions)
6. [Kroger integration](#6-kroger-integration)
7. [Pages: behavior spec and porting notes](#7-pages-behavior-spec-and-porting-notes)
8. [Design system port (Tailwind/shadcn → `css()`)](#8-design-system-port-tailwindshadcn--css)
9. [Testing strategy](#9-testing-strategy)
10. [Phased plan with checklists](#10-phased-plan-with-checklists)
11. [Data migration and cutover](#11-data-migration-and-cutover)
12. [Known quirks: preserve or fix](#12-known-quirks-preserve-or-fix)
13. [Running the source app for comparison](#13-running-the-source-app-for-comparison)
14. [Decisions log](#14-decisions-log)

---

## 1. What the source app does

A per-user meal library that turns selected meals into a consolidated shopping list and pushes
linked products into the user's Kroger cart.

| Area | Behavior |
| --- | --- |
| Accounts | Register/sign in with email + password. JWT (HS256, 30-day expiry) kept in `localStorage`. |
| Meals | CRUD meals; each meal has ingredients parsed from free text (`"2 lb ground beef"` → qty `2 lb`, name `ground beef`). |
| Ingredients | Inline quantity edit, full edit (qty + name), delete, link to a Kroger product via search popover. |
| Shop | Select meals → consolidated list (merged by lowercase name, integer quantities summed, others joined with `" + "`). Exclude/restore items locally, link products for all selected meals at once, add linked items to Kroger cart, record an order. |
| Orders | Last 5 orders: timestamp + meal names. |
| Settings | Find a Kroger store by ZIP and save it; connect/reconnect a Kroger account (OAuth2 + PKCE). |

### Source map

| Concern | Source files |
| --- | --- |
| Entities | `src/main/kotlin/.../entity/*.kt` (`AppUser`, `Meal`, `Ingredient`, `KrogerConfig`, `KrogerToken`, `OAuthPkceState`, `Order`) |
| Business logic | `service/MealService.kt` (parse, consolidate, link), `OrderService.kt`, `AuthService.kt`, `JwtService.kt` |
| Kroger | `service/KrogerAuthService.kt` (client/user tokens, PKCE, refresh), `service/KrogerApiService.kt` (products, locations, cart) |
| HTTP API | `controller/*.kt` (see table below) |
| Errors | `exception/GlobalExceptionHandler.kt` — `EntityNotFound`→404, `IllegalArgument`→400, `IllegalState`→409, `AccessDenied`→403, body `{"error": msg}` |
| SPA shell | `frontend/src/App.tsx` (header, desktop nav, mobile sheet), `contexts/AuthContext.tsx`, `components/ProtectedRoute.tsx` |
| Pages | `frontend/src/pages/{Login,Meals,Shop,Orders,Settings}Page.tsx` |
| Components | `components/meals/*`, `components/shop/*`, `components/settings/*`, `components/ui/*` (shadcn) |
| Tests | Kotlin: `src/test/kotlin/**` (MealService, KrogerAuthService, controllers). Frontend: Bun + Testing Library (`*.test.tsx`) |

### Source HTTP API (for reference — the port does not need to keep this JSON API)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/register` | email regex `^[^@\s]+@[^@\s]+\.[^@\s]+$`; "Username must be a valid email address"; "Username already taken" (400) |
| POST | `/api/auth/login` | "Invalid credentials" (400, not 401) |
| GET | `/api/auth/me` | |
| GET/POST | `/api/meals` | list summaries / create (201) |
| GET/PUT/DELETE | `/api/meals/{id}` | 404 "Meal not found: {id}" when missing or not owned |
| GET/POST | `/api/meals/{id}/ingredients` | POST body `{raw}` parsed server-side |
| GET/PUT/DELETE | `/api/meals/{id}/ingredients/{iid}` | PUT fields are patch-style: `null` means "unchanged" |
| POST | `/api/meals/consolidate` | body is a bare JSON array of meal IDs |
| PATCH | `/api/meals/ingredients/link` | links every ingredient with matching normalized name across `mealIds` |
| GET | `/api/config/kroger` | `{clientId, locationId, locationName, hasToken}` — never exposes the secret |
| PATCH | `/api/config/kroger/location` | 400 "Kroger config not set" if the user has no config row |
| GET | `/api/kroger/auth/url` | 409 "Kroger not configured" |
| GET | `/api/kroger/auth/callback` | public; redirects to `{base}settings?auth=success` |
| POST | `/api/kroger/products/search` | client-credentials token; `filter.limit=10` |
| POST | `/api/kroger/locations/search` | `filter.zipCode.near`, `filter.limit=10` |
| POST | `/api/kroger/cart` | user token; PUT `/v1/cart/add` |
| POST | `/api/kroger/cart/meals` | unused by the UI |
| POST/GET | `/api/orders` | create (unknown meal IDs silently skipped) / top 5 newest |
| POST | `/api/agent/meal-plan` | **excluded (Koog AI)** |

Production is served at `https://samhain.dev/groceries/` (Vite `base: "/groceries/"`, a reverse proxy
strips the prefix before Spring). The registered Kroger redirect URI is
`https://samhain.dev/groceries/api/kroger/auth/callback`.

---

## 2. Target architecture

### Mount point

Mount the whole feature under **`/groceries`** in this app. That keeps every public URL the same as
production today, including the Kroger OAuth redirect URI, so the Kroger developer app registration
does not have to change. Unlike today, the prefix is owned by the Remix route map, so the proxy must
**stop stripping** `/groceries` at cutover.

### Request flow

The SPA + JSON API becomes **server-rendered pages + native forms**, hydrated only where the UI
needs browser behavior:

```txt
Browser ── GET /groceries/meals/3 ──▶ router ─▶ session ─▶ auth ─▶ requireAuth ─▶ action ─▶ context.render(<MealsPage/>)
Browser ── POST form ───────────────▶ router ─▶ ... ─▶ action (validate, write) ─▶ 303 redirect back (PRG)
Client entries (public/*.tsx) ──────▶ small JSON/HTML resource routes (product search) or enhanced form posts
```

- **Mutations are POST forms with Post/Redirect/Get.** This replaces TanStack Query
  `invalidateQueries`: after the redirect, the page re-renders with fresh data. With the browser
  runtime running, Remix intercepts same-origin form submissions and link clicks and reloads the top
  frame instead of doing a full document load.
- **Selection state moves into the URL.** The selected meal becomes `/groceries/meals/:mealId`; the
  Shop page's selected meals become `?meal=1&meal=2`. Back/forward and reload now work.
- **Client entries** (`clientEntry(import.meta.url, ...)` in `public/` directories) only for: the
  mobile menu sheet, dialogs and menus, inline ingredient editing, the product search popover, the
  Shop page's exclude/restore and auto-submitting meal checkboxes, the auth-success banner timer,
  and pending-state buttons.

### File layout (as built)

Follows `AGENTS.md` and the routing guide: one directory per route map, route-local UI
next to its controller, browser code in `public/` directories.

```txt
app/
├── routes.ts                           # groceries: route('/groceries', groceryRoutes)
├── router.ts                           # createAppRouter({ db, sessionSecret?, kroger? })
├── db.ts                               # openDatabase(), migrateDatabase()
├── middleware/
│   ├── database.ts                     # context.db
│   ├── groceries-auth.ts               # session auth scheme, requireGroceriesUser(), currentUser()
│   ├── kroger.ts                       # context.kroger (per-request Kroger client)
│   └── trailing-slash.ts               # /groceries/ → /groceries
├── data/groceries/
│   ├── tables.ts                       # data-table definitions (§4)
│   ├── ingredients.ts                  # parseIngredient(), consolidate() (pure)
│   ├── meals.ts  orders.ts  users.ts   # owner-scoped data access
│   ├── passwords.ts                    # scrypt hashing
│   └── kroger.ts                       # API client, token cache/refresh, OAuth provider
└── actions/groceries/
    ├── routes.ts                       # groceryRoutes (§7)
    ├── controller.tsx                  # orders (the only direct leaf)
    ├── layout.tsx                      # GroceriesLayout: Document + header + main
    ├── form.ts                         # formText/formIds/done()/failJson() helpers
    ├── auth/  meals/  shop/  settings/  orders/  kroger/   # controller + page + public/
    └── public/                         # shared browser code
        ├── ui/{styles.ts,icons.tsx,dialog.tsx,overlays.ts}
        ├── nav.tsx  mobile-nav.tsx  pending-button.tsx  product-search.tsx  submit.ts
public/groceries/theme.css              # tokens + preflight, layered before `rmx`
db/migrations/0001_create_groceries/    # up.sql, down.sql
scripts/                                # migrate-from-h2.ts, set-password.ts, set-kroger-config.ts
test/                                   # db.ts, router.ts (createTestApp), fake-kroger.ts, fixtures/
```

### Router factory

`app/router.ts` exports `createAppRouter({ db, sessionSecret?, kroger? })`; `server.ts` opens and
migrates the database, then creates the router. Tests build their own with an in-memory
database, a test secret, and the fake Kroger (`test/router.ts`).

Middleware order: `staticFiles` → `stripTrailingSlash()` → `cop()` → `loadDatabase()` →
`session()` → `formData()` → `auth()` → `loadKroger()` → `render({ assets })`.
`requireGroceriesUser()` is controller middleware on every groceries controller except `auth`
(it does **not** flow into nested controllers); `kroger.products` uses the JSON-401 variant.

---

## 3. React → Remix 3 differences that matter here

Remix 3 components use JSX but **are not React**. Read `node_modules/remix/guides/04-rendering-ui.md`
and `05-interactivity.md` before writing components. The traps for this port:

| React pattern in the source | Remix 3 equivalent | Notes |
| --- | --- | --- |
| `function C(props) { const [x, setX] = useState() }` | `function C(handle: Handle<Props>) { let x; return () => ... }` | Setup runs once; the returned function renders. State is a plain variable; call `handle.update()` after changing it. |
| Destructuring props at the top of the component | Read `handle.props` **inside** the render function | Props captured in setup go stale. |
| `useEffect`, `useQuery`, `useQueryClient` | Server loads data in the action; mutations redirect | No client cache. For post-render DOM work use `handle.queueTask()`; for async work use `handle.signal` / the signal passed to `on()` handlers. |
| `onClick={...}`, `onChange`, `onKeyDown` | `mix={on('click', ...)}`; combine with `mix={[css(...), on(...)]}` | Prefer native `submit` on forms over Enter-key handlers: "Enter to create meal" falls out of a real `<form>`. |
| `className="..."` (Tailwind) | `mix={css({...})}`; plain `class` exists but there is no Tailwind | See §8. |
| Callback props from parent (`onSelect`, `onDeleted`, `onLinked`, `onSaved`) | Links, forms, redirects, or frame reloads | **Client-entry props must be serializable** (no functions). A server-rendered parent cannot pass `onLinked` to a client entry. Re-express each callback as navigation (see §7). |
| Context providers (`AuthProvider`, `QueryClientProvider`) | Request context (`context.auth`, `context.db`) on the server | Pass the user to the layout as a prop from the action. |
| `<Navigate to="/login" />`, `window.location.href = ...` | `redirect()` from `remix/response/redirect` in the action/middleware; `navigate()` in client entries | Auth redirects happen before render — no flash of protected content. |
| `react-router` `NavLink` active state | Compute `active` from `context.url.pathname` on the server and pass it to the layout | |
| `localStorage` JWT + `Authorization` header | `httpOnly` signed session cookie | No token handling in browser code at all. |
| Radix portals (Dialog, Popover, DropdownMenu, Sheet) | Native `<dialog>` + `showModal()`, the HTML `popover` attribute | Top layer gives the same stacking without portals. `@remix-run/ui` (unstable, separate package) is an option if native elements fall short. |
| `autoFocus` | `autofocus` attribute, or `ref()` + `focus()` after `await handle.update()` | Inline qty edit must focus its input after switching modes. |
| `key` | `key` | Same idea; use stable IDs (ingredient `id`, consolidated item `name`). |
| `new Date(x).toLocaleString()` in render | Format with an explicit `timeZone`, or render `<time datetime>` and localize in a tiny client entry | Server rendering runs in the **server's** locale and time zone. The Orders page will silently change otherwise. |
| SVG attributes (`strokeWidth`, `stopColor`) | The existing `document.tsx` uses `stop-color`; the guides show both `stroke-width` and `strokeWidth` | Pick one form for the icon set and verify it renders. |
| `lucide-react` | Inline SVG icon components in `app/actions/groceries/ui/icons.tsx` | Copy only the ~20 icons used (§8). Lucide is ISC-licensed; keep the license note in the file. |
| Testing Library + happy-dom + Bun | `remix/test` + `remix/assert`; browser tests in real Chromium via `remix/component/test` | Both mobile and desktop branches render in happy-dom today; in a real browser CSS media queries apply, so tests can target what is actually visible. |

---

## 4. Data model and persistence

### Engine

Replace H2 with **SQLite via `remix/data-table/sqlite`** (Node's built-in `node:sqlite`; no extra
dependency). Migrations live in `db/migrations/NNNN_name/{up,down}.sql` and run from `server.ts`
before listening (`node_modules/remix/guides/08-data-and-validation.md`). Database file:
`db/samhain.sqlite` (the starter already gitignores `db/*.sqlite`), overridable with
`DATABASE_PATH`.

> **Node version:** `package.json` declares `node >= 24.3.0`, but this machine runs Node 22.22.1.
> `node:sqlite` works on 22.22, but install Node 24 before relying on it in production so the
> runtime matches `engines`.

### Schema (`db/migrations/0001_create_groceries/up.sql`)

Table names are prefixed `groceries_` so they never collide with future Samhain tables.

```sql
create table groceries_users (
  id integer primary key autoincrement,
  email text not null unique collate nocase,
  password_hash text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table groceries_meals (
  id integer primary key autoincrement,
  user_id integer not null references groceries_users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  unique (user_id, name)
);

create table groceries_ingredients (
  id integer primary key autoincrement,
  meal_id integer not null references groceries_meals(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  quantity text,
  kroger_product_id text,      -- holds the UPC (see §6)
  kroger_product_name text,
  unique (meal_id, name)
);

create table groceries_kroger_configs (
  user_id integer primary key references groceries_users(id) on delete cascade,
  client_id text not null,
  client_secret text not null,
  location_id text,
  location_name text
);

create table groceries_kroger_tokens (
  user_id integer not null references groceries_users(id) on delete cascade,
  grant_type text not null check (grant_type in ('CLIENT', 'USER')),
  access_token text not null,
  refresh_token text,
  expires_at text not null,    -- ISO-8601 UTC
  primary key (user_id, grant_type)
);

create table groceries_orders (
  id integer primary key autoincrement,
  user_id integer not null references groceries_users(id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table groceries_order_meals (
  order_id integer not null references groceries_orders(id) on delete cascade,
  position integer not null,
  meal_name text not null,
  primary key (order_id, position)
);
```

Changes from H2, all deliberate:

| Source | Port | Why |
| --- | --- | --- |
| `app_users.username`, `can_use_ai` | `email`; `can_use_ai` dropped | Usernames are already validated as emails; AI is out of scope. |
| `meals.user_id` nullable | `not null` | Legacy pre-auth rows with no user are unreachable in the UI anyway; the import script reports and skips them. |
| `kroger_config.id` + nullable `user_id` | `user_id` is the primary key | One config per user was already enforced by a unique constraint. |
| `kroger_tokens.id` | composite primary key `(user_id, grant_type)` | Matches the existing unique constraint. |
| `oauth_pkce_state` table + hourly `@Scheduled` cleanup | **removed** | `remix/auth` stores the OAuth transaction (state + PKCE verifier) in the session (§6). |
| `order_meals` element collection (no order column) | `position` column | Preserves meal order deterministically. |
| No `on delete cascade` from users | cascades | Simplifies tests and account cleanup. |

Mirror these in `app/data/groceries/tables.ts` with `table({ name, columns, primaryKey })` and keep the
two in sync whenever you add a migration. Every query that touches meals, ingredients, configs,
tokens, or orders **must be scoped by `user_id`**. Source code guaranteed this with
`findByIdAndUserId`/`existsByIdAndUserId`; return a 404 for another user's meal, as the source does.

### Pure domain logic (port verbatim, then unit test)

`app/data/groceries/ingredients.ts`:

- `parseIngredient(raw)` from `MealService.parseIngredient`:
  - trim, split on whitespace; first token must match `^\d[\d./]*$` or the whole string is the name
    with `null` quantity;
  - if ≥3 tokens and token 2 (lowercased) is in the unit set → qty `"<n> <unit>"`, name = rest;
  - else if ≥2 tokens → qty = first token, name = rest; else name = raw, qty `null`.
  - Unit set: `lb lbs oz g kg cup cups tsp tbsp ml l liter litre gallon gallons quart quarts pint pints fl bunch clove cloves slice slices can cans pkg package packages`.
- `consolidate(ingredientsInMealOrder)` from `MealService.consolidateIngredients`:
  - group key = `name.trim().toLowerCase()`; **the returned `name` is the key** (lowercased);
  - groups keep first-seen order (iterate meals in the order requested, ingredients in insertion
    order);
  - quantity: all nulls → `null`; all non-null match `^\d+$` → integer sum as string; otherwise
    non-null values joined with `" + "`;
  - Kroger product: the **last** non-null product ID/name seen wins.

---

## 5. Authentication and sessions

| Source | Port |
| --- | --- |
| JWT in `localStorage`, `Authorization: Bearer` header | Signed `httpOnly` session cookie via `remix/middleware/session` + `remix/session-storage/cookie` |
| `SecurityConfig` permits `/api/auth/**`, `/api/kroger/auth/callback` | `requireAuth()` on every groceries controller except `auth`; the Kroger callback **does** require the session (see §6) |
| `ProtectedRoute` client redirect | `requireAuth({ onFailure })` → `redirect(routes.groceries.auth.login.index.href() + '?returnTo=...')` |
| `apiFetch` 401 → clear token, hard redirect | Same `onFailure`; JSON resource routes (product search) return `401` JSON instead |
| BCrypt (`BCryptPasswordEncoder`) | `node:crypto` `scrypt`; the single legacy user resets their password with a script (see below) |
| No CSRF (stateless JWT) | `cop()` (tokenless, uses `Sec-Fetch-Site`/`Origin`); add `csrf()` too if you want synchronizer tokens |

Implementation notes (APIs in `node_modules/remix/src/{auth,auth-middleware,session,session-middleware}/README.md`):

- Cookie: `createCookie('groceries_session', { secrets: [env.SESSION_SECRET], httpOnly: true,
  sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })`. 30 days matches the old JWT expiry.
  `sameSite: 'lax'` is required so the cookie is sent on the top-level redirect back from Kroger.
  Throw at startup if `SESSION_SECRET` is missing outside tests (replaces `APP_JWT_SECRET`).
- Login/register use `createCredentialsAuthProvider` + `verifyCredentials`, then
  `completeAuth(context)` (rotates the session ID) and `session.set('auth', { userId })`.
- Sign-out is a **POST form** (`session.destroy()`, redirect to login). The source used a button
  that only cleared local state; a POST avoids logout-by-link.
- Session scheme: `createSessionAuthScheme({ read, verify, invalidate })` where `verify` loads the
  user row; a deleted user invalidates the session.
- **Password hashing:** `node:crypto` `scrypt` only, stored as `scrypt$N$r$p$salt$hash`. There is
  exactly one production user, so no BCrypt support: the H2 import writes an unusable placeholder
  hash and `scripts/set-password.ts <email>` sets a new password after cutover.
- Validation (data-schema form schemas): email regex identical to the source; password must be
  non-empty (the source had no length rule; keep it that way unless the user wants one).

---

## 6. Kroger integration

### API client

Port `KrogerApiService` + `KrogerAuthService` to plain `fetch` in `app/data/groceries/kroger/`.
Take `fetch` as a parameter (default `globalThis.fetch`) so tests can inject a fake, and read the
base URL from `KROGER_API_BASE` (default `https://api.kroger.com/v1`) so e2e tests can point at a
local fake server.

| Function | Kroger call | Mapping |
| --- | --- | --- |
| `searchProducts(term, locationId?)` | `GET /products?filter.term=&filter.locationId=&filter.limit=10` (client token) | `{productId, description, upc: items[0].upc ?? productId, price: items[0].price.regular ?? null, imageUrl: images[perspective=front].sizes[size=thumbnail].url ?? null}` |
| `searchLocations(zip)` | `GET /locations?filter.zipCode.near=&filter.limit=10` (client token) | `{locationId, name, address: address.addressLine1, city, state, zipCode}` |
| `addToCart(items)` | `PUT /cart/add` body `{items:[{upc, quantity}]}` (user token) | returns `"Items added to cart"` |

Note: `upc` falls back to `productId`, so in practice it is never null and the "No UPC" disabled
state in the popover never triggers. Preserve the fallback; the UI branch can stay for safety.

### Tokens

- **Client token** (`grant_type=client_credentials`, scope `product.compact`, HTTP Basic with the
  user's own client ID/secret). Reuse a cached row unless it expires within 60 s.
- **User token**: reuse unless it expires within 60 s; otherwise refresh with
  `grant_type=refresh_token`. If the refresh returns a 4xx, **delete the token row** and fail with
  "Kroger session expired — please reconnect in Settings". No refresh token → "User token expired
  and no refresh token available"; no row → "User not authenticated…".
- `hasToken` (Settings badge, Shop warning): true if a USER token exists and is fresh; if expired,
  **proactively attempt a refresh** and report false on failure. This proactive check was the most
  recent fix in the source (`3efffe1`) — keep it and test it.
- Use `db.transaction` when replacing a token row.

### OAuth (connect Kroger account)

Kroger is an account *link*, not the login method. Use `createOAuthProvider` from `remix/auth` so the
`state` and PKCE `codeVerifier` live in the session transaction instead of the `oauth_pkce_state`
table:

- `createAuthorizationURL(tx)` → `https://api.kroger.com/v1/connect/oauth2/authorize` with
  `client_id`, `redirect_uri`, `response_type=code`, `scope=cart.basic:write profile.compact`,
  `state=tx.state`, `code_challenge=base64url(sha256(tx.codeVerifier))`, `code_challenge_method=S256`.
  (`createCodeChallenge` is not exported from `remix/auth`; compute it with `crypto.subtle`.)
- `handleCallback(context, tx)` → POST the token endpoint with `grant_type=authorization_code`,
  `code`, `redirect_uri`, `code_verifier`, Basic auth; return `{ provider: 'kroger', account, profile, tokens }`.
- `refreshTokens(tokens)` → refresh grant (or keep the refresh logic in `tokens.ts`; pick one and
  test it).
- Client credentials are **per user** (`groceries_kroger_configs`), so build the provider per request
  from the signed-in user's config instead of at module scope. Missing config → 409-style error
  "Kroger not configured", rendered on the Settings page.
- Routes: `GET /groceries/kroger/connect` → `startExternalAuth(provider, context)`;
  `GET /groceries/api/kroger/auth/callback` (**exact legacy path**) → `finishExternalAuth`, save the
  USER token, redirect `303` to `/groceries/settings?auth=success`. Do **not** call `completeAuth`
  here — the user is already signed in; linking Kroger is not a login.
- `KROGER_REDIRECT_URI` env var. Production keeps
  `https://samhain.dev/groceries/api/kroger/auth/callback`. For dev, register
  `http://localhost:44100/groceries/api/kroger/auth/callback` in the Kroger developer portal (the
  old dev URI was `http://localhost:8080/api/kroger/auth/callback`).

### Gap: there is no UI for Kroger credentials

The source never had a way to set `client_id`/`client_secret`; rows were inserted by hand. Keep that
behavior but make it scriptable: add `scripts/set-kroger-config.ts <email> <clientId> <clientSecret>`.
Adding a Settings card for credentials is a new feature — ask before building it.

---

## 7. Pages: behavior spec and porting notes

All copy below is **verbatim** from the source. Use it in tests. The `…` characters are real
ellipses (U+2026).

### Route map (`app/actions/groceries/routes.ts`)

```ts
export const groceryRoutes = route({
  auth: {
    login: form('/login'),                  // GET page, POST sign in
    register: post('/register'),
    logout: post('/logout'),
  },
  meals: {
    index: get('/'),                        // Meals page, nothing selected
    create: post('/meals'),
    show: get('/meals/:mealId'),            // Meals page with panel open
    rename: post('/meals/:mealId/rename'),
    destroy: post('/meals/:mealId/delete'),
    addIngredient: post('/meals/:mealId/ingredients'),
    updateIngredient: post('/meals/:mealId/ingredients/:ingredientId'),
    deleteIngredient: post('/meals/:mealId/ingredients/:ingredientId/delete'),
    linkIngredient: post('/meals/:mealId/ingredients/:ingredientId/link'),
  },
  shop: {
    index: get('/shop'),                    // ?meal=1&meal=2
    link: post('/shop/link'),               // link product across selected meals
    cart: post('/shop/cart'),               // add to Kroger cart + record order
  },
  orders: get('/orders'),
  settings: {
    index: get('/settings'),                // ?zip= shows location results; ?auth=success banner
    location: post('/settings/location'),
  },
  kroger: {
    connect: get('/kroger/connect'),
    callback: get('/api/kroger/auth/callback'),
    products: get('/kroger/products'),      // resource route for the search popover (JSON)
  },
})
```

Use `post(...)` + distinct paths rather than `methodOverride()` for PUT/DELETE; HTML forms only
send GET/POST and this keeps the router simple. (Switching to `methodOverride()` later is fine.)

### Global shell (`App.tsx`) — ref: `meals-selected.png`, `mobile-menu.png`

- Sticky header, `h-14`, bottom border, translucent white background with backdrop blur.
- Brand **"5 Minute Groceries"** (semibold).
- Desktop (≥768px) nav: **Meals** (`/groceries`, exact match), **Shop**, **Orders**, **Settings**, with
  icons UtensilsCrossed, ShoppingCart, ClipboardList, Settings. Active item: dark pill
  (`primary`); inactive: muted text with accent hover. **No "Meal Plan" item** (AI, excluded).
- Right side when signed in: email (muted) + **"Sign out"** with LogOut icon.
- Mobile (<768px): hamburger (`aria-label="Open menu"`) opens a right-side sheet (`w-64`): brand
  header, same nav (selecting an item closes the sheet), footer with email and **"Sign out"**.
  Sheet title "Navigation menu" is screen-reader only. Port as a `<dialog>` client entry.
- `<main>`: container, `px-4 py-6`. Page `<title>`: "5 Minute Groceries".
- The source renders this header on the login page too (nav visible while signed out; links bounce
  back to login). Faithful port keeps it; see §12.

### Login — ref: `login-register-error.png`

- Centered card `max-w-sm`: h1 "5 Minute Groceries"; subtitle "Sign in to your account" /
  "Create a new account".
- Fields: **Email** (`type=email`, required, autofocus, `id=username`) and **Password**
  (`type=password`, required).
- Submit: "Sign In" / "Register"; pending: "Signing in…" / "Creating account…".
- Toggle line: "No account? **Register**" / "Already have an account? **Sign In**" (underlined
  buttons). Port as links to `?mode=register` / `?mode=signin` so it works without JS; switching mode
  clears the error.
- Errors render in destructive text above the button: "Invalid credentials",
  "Username must be a valid email address", "Username already taken". Re-render with status 400 and
  keep the email value (never the password). Fallback: "An unexpected error occurred".
- Success → 303 to `returnTo` or `/groceries`.

### Meals — ref: `meals-empty-selection.png`, `meals-selected.png`, `meals-menu.png`, `meals-new-dialog.png`, `meals-edit-qty.png`, `mobile-meals.png`, `mobile-meal-detail.png`

Layout: desktop two columns (`w-72` list + flexible panel, height `calc(100vh - 8rem)`, each side
scrolls); mobile shows the list **or** the panel.

List column:
- h1 "Meals"; green **"New"** button (PlusCircle, `bg-green-600`) opens dialog "New meal" /
  "Enter a name for your new meal." with input placeholder "Meal name", buttons "Cancel" / "Create"
  (disabled while blank or pending, spinner while pending). Enter submits. Success → redirect to the
  new meal's `show` URL (the source auto-selected it).
- Loading skeletons are unnecessary with server rendering (data arrives with the page). Keep the
  `Skeleton` primitive only if a frame fallback needs it.
- Empty: 'No meals yet. Click "New" to get started.'
- Meal card: name (truncated) + "N ingredient(s)" (singular when 1); selected card inverts to
  `primary`. Whole card is a link to `show` (use `<a>`, not a click handler). A kebab button
  (MoreVertical) opens a menu: **Rename** (Pencil), separator, **Delete** (Trash2, destructive).
  - Rename dialog: "Rename meal" / `Enter a new name for "{name}".`, input prefilled, "Cancel"/"Save".
  - Delete dialog: "Delete meal" / `Are you sure you want to delete "{name}"? This cannot be undone.`,
    "Cancel"/"Delete" (destructive). On success redirect to `/groceries` if the deleted meal was
    selected, else back to the current URL (replaces the `onDeleted` callback).
  - The menu button must not trigger the card link (`event.preventDefault()` +
    `stopPropagation()` inside the client entry, or render the button outside the `<a>`).
- Meal ordering is unspecified in the source (H2 returned it unordered); **order by name,
  case-insensitive** and record that in the decisions log.

Panel (`/groceries/meals/:mealId`):
- Nothing selected: centered UtensilsCrossed icon (30% opacity) + "Select a meal to manage its
  ingredients".
- Mobile only: "Back to meals" (ChevronLeft) link to `/groceries` at the top of the panel.
- h2 meal name; "N ingredient(s)"; separator; add row: input placeholder
  `Add ingredient, e.g. "2 onions"` + green icon button (PlusCircle; spinner while pending; disabled
  while blank). Enter submits. Server parses with `parseIngredient`.
- Empty: "No ingredients yet."
- Ingredient row (`IngredientRow`, client entry because of inline editing):
  - Quantity badge: secondary badge with the quantity, or outline badge "+ qty" when empty
    (titles "Click to edit quantity" / "Add quantity"). Click → small input (placeholder "qty",
    autofocus) with ✓ / ✗ buttons; Enter saves, Escape cancels.
  - Name (flexible).
  - Linked: product name (muted, truncated at 140px, desktop) + hover-revealed icon buttons
    Edit (Pencil), Change product (Link), Delete (Trash2, destructive).
  - Unlinked: outline button "Link product" (Link icon) + hover-revealed Edit/Delete.
  - Mobile: buttons always visible (h-8); second line shows the product name or "Link product".
  - Edit mode: qty input (w-20, "qty") + name input ("name") + ✓ / ✗.
  - Every mutation is a form POST that redirects back to the same meal URL. Inside a client entry,
    submit with `fetch` and then reload the page/frame, or let the runtime intercept the native form;
    either way the server stays the source of truth.

### Product search popover (shared by Meals and Shop)

- Opens anchored to its trigger (`w-80`, max `calc(100vw - 2rem)`). Input placeholder
  "Search Kroger products...", autofocus, prefilled with the ingredient name, **searches
  immediately on open**. Search button shows a spinner while loading. Enter searches.
- Results list (max-h-52, scroll): optional 40px thumbnail, description (medium), price `$X.XX`
  (muted) when present. Selecting a result links it and closes the popover.
- If results exist but no store is set: "Set a store location in Settings to see prices and enable
  linking."
- "No results" when the search completed empty. Errors show the message in destructive text.
- Port: client entry `public/product-search-popover.tsx` using the `popover` attribute. It fetches
  `GET /groceries/kroger/products?term=` (JSON; server reads the user's `locationId` itself, so the
  client does not need the config). Cache results per term while open. On select, submit the
  relevant link form (`linkIngredient` on Meals, `shop.link` on Shop) — props are hrefs + hidden
  field values, never callbacks.

### Shop — ref: `shop-empty.png`, `shop-selected.png`, `mobile-shop.png`

- h1 "Shop"; two columns on desktop (`md:min-h-[60vh]`).
- Left: section label "SELECT MEALS" (uppercase tracking-wide muted). Each meal is a bordered row
  with a checkbox, the name, and an outline badge with the ingredient count; clicking anywhere on
  the row toggles. Empty: "No meals yet. Go to Meals to create some."
- Port the selector as a **GET form** of `name="meal"` checkboxes whose `value` is the meal ID. A
  tiny client entry calls `form.requestSubmit()` on change (with `data-rmx-history="replace"` so
  every toggle does not add a history entry). Without JS, show a "Update list" submit button.
- Right: label "CONSOLIDATED INGREDIENTS" + "(updating...)" while a submission is pending.
  - No selection: "Select meals on the left to see consolidated ingredients."
  - Desktop table columns: Ingredient | Qty | Kroger Product | (remove). Qty badge or "—".
    Product name with hover-revealed "Change product" icon, or outline "Link product" button.
    Remove ✗ ("Remove from cart", hover-revealed).
  - Mobile cards: name, qty badge (**hidden when qty is exactly "1"** — mobile only, a source quirk),
    ✗, product name + change icon, or full-width "Link Kroger product".
  - Excluded items: desktop "Excluded from cart" row then struck-through rows at 40% opacity with
    Restore (RotateCcw); mobile card "Excluded from cart (N)" at 50% opacity.
  - Exclusions are **client-only state** in the `ConsolidatedList` client entry. As in the
    source, they survive selection changes and linking (the component stays mounted).
  - Footer alerts: destructive "Kroger account not connected. Go to Settings to connect." when no
    user token; default alert "N ingredient(s) without a linked product will not be added to cart."
    when any active item is unlinked.
  - Button "Add N item(s) to Kroger Cart" (ShoppingCart; spinner while pending), disabled when
    pending, not connected, or N = 0. Success shows the server message in green
    ("Items added to cart"); failure shows the error in destructive text.
- Linking from Shop links **every** ingredient with that normalized name across the selected meals
  (`MealService.linkProduct`), then the list refreshes.
- **Cart submission:** post `meal` IDs + `exclude` names to `shop.cart`. The server recomputes the
  consolidated list, drops excluded names, sends linked UPCs with `quantity: 1`, and then records an
  order with the selected meals' names. Order recording is best-effort: a failure there must not
  turn a successful cart add into an error. This is safer than the source (which trusted
  client-sent UPCs) and keeps one code path.

### Orders — ref: `orders.png`

- Centered `max-w-2xl`; h1 "Recent Orders"; cards with timestamp (muted) and comma-joined meal
  names (or italic "No meals recorded").
- Empty: "No orders yet. Head to the Shop page to add meals to your cart." (no heading).
- Error: "Failed to load orders."
- Newest first, limit 5.
- Timestamp: the source used the **browser's** `toLocaleString()`. See §3: render
  `<time datetime="ISO">` with a server-formatted fallback and a small client entry that replaces
  the text with `toLocaleString()`, or decide on a fixed time zone.

### Settings — ref: `settings.png`

- h1 "Settings"; `max-w-2xl`.
- With `?auth=success`: green alert (CheckCircle2) "Kroger account connected successfully!" that
  removes itself (and the query param, via `history.replaceState`) after 5 s — client entry.
- **Store Location** card: "Find and select your nearest Kroger store."; when set, "Current:" +
  outline badge with the location name. ZIP input (placeholder "ZIP code", `max-w-[160px]`) +
  outline "Search" button (Search icon; spinner while pending). Results: radio list (name in
  medium weight + address line, muted) + "Save location" button. Errors in destructive text.
  - Port: the search is a **GET form** (`?zip=`) rendered by the server; the radio list + save is a
    POST form to `settings.location` that sends `locationId` and `locationName`; redirect back to
    Settings. Works without JS.
  - Saving with no config row → 400 "Kroger config not set" rendered inline.
- **Kroger Account** card: "Connect your Kroger account to enable adding items to your cart.";
  "Status:" + success badge "Connected" / secondary badge "Not connected"; button "Connect with
  Kroger" (default variant) or "Reconnect with Kroger" (outline), ExternalLink icon. Port as a
  link/GET form to `kroger.connect`. Errors ("Kroger not configured") render inline.

---

## 8. Design system port (Tailwind/shadcn → `css()`)

### Theme decision

The Samhain site uses the "October Rust" dark theme, set on `<body>` in `app/actions/document.tsx`.
The groceries UI is the default **shadcn "slate" light theme**. To recreate the UI faithfully, the
groceries pages use their **own document shell and tokens**:

- Add a `bodyMix`/`theme` prop to `Document` (or a `GroceriesDocument` in
  `app/actions/groceries/layout.tsx` that shares the head logic) so groceries pages do not inherit
  October Rust colors, fonts, or `color-scheme: dark`.
- Define tokens as CSS custom properties on the groceries body (values from
  `frontend/src/index.css`):

| Token | Value |
| --- | --- |
| `--background` / `--card` / `--popover` | `hsl(0 0% 100%)` |
| `--foreground` | `hsl(222.2 84% 4.9%)` |
| `--primary` | `hsl(222.2 47.4% 11.2%)` |
| `--primary-foreground` | `hsl(210 40% 98%)` |
| `--secondary` / `--muted` / `--accent` | `hsl(210 40% 96.1%)` |
| `--muted-foreground` | `hsl(215.4 16.3% 46.9%)` |
| `--destructive` | `hsl(0 84.2% 60.2%)` |
| `--border` / `--input` | `hsl(214.3 31.8% 91.4%)` |
| `--ring` | `hsl(222.2 84% 4.9%)` |
| `--radius` | `0.5rem` (`sm` = −4px, `md` = −2px, `lg` = radius) |
| Extra colors used directly | green-600 `#16a34a`, green-700 `#15803d` (New/Add buttons); green-500 `#22c55e` (success badge); alert-success border `#22c55e`, text `#15803d`, bg `#f0fdf4` |

The `.dark` palette exists in the source CSS but is never activated; skip it. Font: the source uses
Tailwind's default system sans stack; do not load Syncopate/Archivo on groceries pages.

### Primitives (`app/actions/groceries/ui/`)

Port each shadcn component to a function that returns `css()` mixins (variants via a lookup object
instead of `cva`). Class lists to copy are in `../groceries/frontend/src/components/ui/*.tsx`.

| Primitive | Variants / sizes to keep |
| --- | --- |
| `buttonStyles({ variant, size })` | variants `default destructive outline secondary ghost link`; sizes `default (h-10 px-4)`, `sm (h-9 px-3)`, `lg`, `icon (h-10 w-10)`, plus the ad-hoc `h-6/h-7/h-8` overrides used in rows |
| `badgeStyles({ variant })` | `default secondary destructive outline success warning`; pill, `text-xs font-semibold` |
| `Card*` | header `p-6 space-y-1.5`, title `text-2xl font-semibold`, description muted `text-sm`, content `p-6 pt-0` |
| `Alert` | `default`, `destructive`; icon absolutely positioned at left 16px/top 16px, text padded `pl-7` |
| `Input` | `h-10`, border `--input`, focus ring 2px `--ring` with 2px offset |
| `Table*` | header `h-12 px-4 text-muted`; cells `p-4`; row hover `muted/50` |
| `Separator`, `Label`, `Skeleton` | trivial |
| Dialog | native `<dialog>`: overlay `rgba(0,0,0,.8)`, content `max-w-lg p-6 gap-4 rounded-lg`, close ✗ top-right with sr-only "Close"; footer stacks reversed on mobile |
| Sheet | `<dialog>` docked right, `w-64`, full height |
| Popover / DropdownMenu | `popover` attribute; content `rounded-md border shadow-md`; menu items `px-2 py-1.5 text-sm` |
| Checkbox / Radio | native inputs styled to match (16px, `border-primary`, checked = primary fill) |

Breakpoint: Tailwind `md` = `@media (min-width: 768px)`. Many layouts are "mobile first then `md:`";
mirror that with `'@media (min-width: 768px)': {...}` inside `css()`.

### Icons

Inline SVG components (24×24 viewBox, `stroke="currentColor"`, stroke width 2, round caps/joins,
`aria-hidden`), copied from lucide `0.468`: `UtensilsCrossed`, `ShoppingCart`, `ClipboardList`,
`Settings`, `LogOut`, `Menu`, `PlusCircle` (circle-plus), `Loader2` (with spin animation),
`ChevronLeft`, `Pencil`, `Trash2`, `Link`, `Check`, `X`, `MoreVertical` (ellipsis-vertical),
`Search`, `ExternalLink`, `CheckCircle2` (circle-check), `AlertTriangle` (triangle-alert),
`RotateCcw`. Not needed: `Sparkles` (AI only).

### Visual verification

Compare each page against `docs/groceries-migration/reference/*.png` at 1280×800 and 390×844. Run the
old app (§13) side by side for anything the screenshots do not show (hover states, dialogs on
mobile, focus rings).

---

## 9. Testing strategy

The source has 45 Kotlin tests (plus 2 for the excluded AI agent) and 45 Bun/Testing Library tests. The port must cover **at least**
the same behavior, plus the auth/ownership and Kroger paths the source left untested. Everything
runs with `npm test` (`remix test`); typecheck stays separate (`npm run typecheck`). See
`node_modules/remix/guides/13-testing.md` and `node_modules/remix/src/test/README.md`.

### Layers

| Layer | Runner / file pattern | What it covers |
| --- | --- | --- |
| Unit | server, `*.test.ts` beside the module | `parseIngredient`, `consolidate`, pluralization helpers, Kroger response mapping, PKCE challenge, password hash/verify, email/password schemas |
| Data | server, `app/data/groceries/*.test.ts` | Owner scoping (user B cannot read/update/delete user A's meals/ingredients), unique-name conflicts, cascade deletes, token cache/refresh/delete-on-4xx, order recording + top-5 ordering. In-memory SQLite with real migrations. |
| Router | server, `app/actions/groceries/**/controller.test.ts` | Every route through `createAppRouter({...}).fetch()`: auth redirects (`returnTo`), 404 for missing/foreign meals, 400 re-render with errors, 303 PRG redirects + `Location`, rendered copy (empty states, singular/plural, alerts, button labels and disabled states), Kroger OAuth start/callback with fake Kroger, `?auth=success` banner |
| Browser component | browser, `*.test.browser.tsx` | Client entries: inline qty edit (click badge → input focused → Enter/Escape), edit mode, exclude/restore + recount in `ConsolidatedList`, meal selector auto-submit, dialogs open/close/focus, product search popover (mock `fetch`; loading, results, "No results", error, select submits form), mobile nav sheet |
| End-to-end | e2e, `*.test.e2e.ts` | Real browser against `createTestServer(router.fetch)` with a fake Kroger HTTP server: (1) register → create meal → add ingredients → rename → delete; (2) link product → shop consolidate → add to cart → order appears; (3) mobile viewport nav + meal detail back link; (4) connect Kroger round-trip; (5) signed-out redirect + returnTo |

### Test infrastructure (`test/`)

- `test/router.ts` — `createTestApp()`: in-memory SQLite with migrations applied, a test cookie
  secret, and the fake Kroger injected as `fetch`; `app.fetch()`/`app.post()` send same-origin
  requests. Also `signIn(app, email)`, `getResponseCookie()`, `connectKroger(app, userId)`.
- `test/db.ts` — `createTestDatabase()`, `createUser()`, `createMealWith(db, userId, name, items[])`.
- `test/fake-kroger.ts` — programmable fake for both injected `fetch` (router tests) and a local
  HTTP server (e2e, via `KROGER_API_BASE`): token endpoint (client + refresh + auth code), products,
  locations, `cart/add`; records requests so tests can assert on UPCs, Basic auth, PKCE verifier,
  and scopes. **Tests never call the real Kroger API.**
- Dev dependency: `playwright` (`npm i -D playwright`). Chromium is already cached locally
  (`~/.cache/ms-playwright/chromium-1243`, works with Playwright 1.63).

### Golden cases captured from the running source app

Encode these as tests; they are the parity contract.

| Input | Expected |
| --- | --- |
| `parseIngredient("2 lb ground beef")` | name `ground beef`, qty `2 lb` |
| `parseIngredient("1 onion")` | `onion`, `1` |
| `parseIngredient("salt")` | `salt`, `null` |
| `parseIngredient("1/2 cup salsa")` | `salsa`, `1/2 cup` |
| `parseIngredient("3 cloves garlic")` | `garlic`, `3 cloves` |
| `parseIngredient("1 can beans")` | `beans`, `1 can` |
| `parseIngredient("2 Onion")` | `Onion`, `2` (case preserved on the row) |
| Ported from `MealServiceTest.kt` | `"2 onions"`→`onions`/`2`; `"1 lb ground beef"`→`ground beef`/`1 lb`; `"2% milk"`→`2% milk`/`null` (first token is not numeric); `"1/2 cup flour"`→`flour`/`1/2 cup`; `"2.5 apples"`→`apples`/`2.5`; `"3 cups chicken broth"`→`chicken broth`/`3 cups`; `"  4 oz cheddar  "`→`cheddar`/`4 oz` |
| consolidate Tacos `[2 lb ground beef, 1 onion, salt, 1/2 cup salsa, 3 cloves garlic]` + Chili `[1 lb ground beef, 2 Onion, 1 can beans]` | `ground beef: "2 lb + 1 lb"`, `onion: "3"`, `salt: null`, `salsa: "1/2 cup"`, `garlic: "3 cloves"`, `beans: "1 can"` — in that order, names lowercased |
| consolidate: product linked in only the 2nd meal | consolidated row carries that product |
| Register `"bad"` | 400 "Username must be a valid email address" |
| Register existing email | "Username already taken" |
| Login wrong password | "Invalid credentials" |
| Meal 99 / another user's meal | 404 |
| Kroger: location save with no config | "Kroger config not set" |
| Kroger: connect with no config | "Kroger not configured" |
| Create order with `[1, 2, 99]` | records `["Tacos", "Chili"]` (unknown IDs skipped) |

Also port the remaining `MealServiceTest` consolidation cases and every `KrogerAuthServiceTest` case
(cached token reuse, 60-second expiry window, missing config, missing/expired user token, PKCE URL
parameters, unique `state`, unknown/expired callback state) one-to-one. The callback-state cases
become `finishExternalAuth` failures: a callback whose `state` does not match the session
transaction must be rejected.

### Porting the existing frontend tests

Each Bun test maps to a router test (server-rendered output) or a browser test (interaction):

- `LoginPage.test.tsx` → router tests for title/subtitle/fields/button labels/mode toggle links and
  error rendering; e2e for the submit flow. The JSON-error-body parsing tests become "server renders
  the error message" tests.
- `MealCard.test.tsx` → router tests for name and "4 ingredients"/"1 ingredient"; browser tests for
  menu → Rename/Delete dialogs; router tests for the rename/delete POSTs.
- `MealSelector.test.tsx` → router tests for names, count badges, empty state, `checked` from
  `?meal=`; browser test for auto-submit.
- `ConsolidatedList.test.tsx` → router tests for item names, product names, "Add 2 items to Kroger
  Cart", unlinked warning, not-connected alert; browser tests for exclude/restore.
- `client.test.ts` (`ApiError`) and `utils.test.ts` (`cn`) test code that will not exist; drop them.

### Definition of done for every phase

`npm test` and `npm run typecheck` pass, `remix doctor` is clean, and new behavior has tests at the
narrowest useful layer. Add a test before fixing any bug found while comparing with the source app.

---

## 10. Phased plan with checklists

Work on a feature branch and merge to `main` through a PR (see memory: branch-and-pr-workflow).
Use `npm run hmr` for the dev server. Tick items here as they land.

### Phase 0 — Foundations
- [x] Branch `groceries-migration` from `main`
- [x] `npm i -D playwright` (no `remix.json` needed; the defaults run Chromium)
- [x] `app/router.ts` → `createAppRouter(options)`; `server.ts` opens and migrates the DB
- [x] `app/db.ts`, `db/migrations/0001_create_groceries`, `app/middleware/database.ts`
- [x] `test/db.ts`, `test/router.ts`, `test/fake-kroger.ts`
- [x] Env: `SESSION_SECRET` (required in production), `DATABASE_PATH`, `KROGER_REDIRECT_URI`, `KROGER_API_BASE`

### Phase 1 — Domain logic and data access
- [x] `tables.ts` matching the migration
- [x] `parseIngredient`, `consolidate` + golden and ported unit tests
- [x] Owner-scoped meal/ingredient/order functions + data tests (incl. cross-user isolation)

### Phase 2 — Auth
- [x] Session cookie, `cop()`, `auth()` with session scheme, `requireAuth` redirect helper
- [x] Login/register/logout routes + login page (verbatim copy)
- [x] Password hashing (scrypt) + `scripts/set-password.ts`
- [x] Router tests: redirects, returnTo, errors, cookie flags, cross-site rejection, logout

### Phase 3 — Shell and UI kit
- [x] Groceries pages use `Document theme="none"` + `public/groceries/theme.css`; Samhain pages keep October Rust
- [x] UI primitives + icons
- [x] Header, desktop nav with active state, mobile sheet client entry
- [x] Browser test for the mobile sheet; visual check vs `mobile-menu.png`

### Phase 4 — Meals
- [x] Meals page (list + panel), create/rename/delete dialogs, add ingredient
- [x] `IngredientRow` client entry: qty edit, full edit, delete, link
- [x] Router + browser tests; visual check vs meals screenshots (desktop and mobile)

### Phase 5 — Kroger + Settings
- [x] Kroger client, token cache/refresh, `hasToken` proactive refresh
- [x] OAuth provider + connect/callback routes (legacy callback path)
- [x] Settings page: location search/save, account card, success banner
- [x] Product search resource route + popover; link from Meals
- [x] `scripts/set-kroger-config.ts`
- [x] Tests against the fake Kroger (incl. refresh 4xx deletes token, PKCE round trip, forged state)

### Phase 6 — Shop and Orders
- [x] Shop page with GET selection form + auto-submit client entry
- [x] `ConsolidatedList` client entry (exclude/restore), link across meals, cart POST + order record
- [x] Orders page with localized timestamps
- [x] Router + browser tests

### Phase 7 — End-to-end and parity review
- [x] E2E: meals/ingredients, Kroger connect + link + cart + orders, sign-in with returnTo, phone width
- [x] Visual comparison with the reference screenshots, desktop and mobile
- [x] §12 quirks resolved as recommended (§14)

### Phase 8 — Data migration and cutover
- [x] `scripts/migrate-from-h2.ts` + tests against a real H2 export (`test/fixtures/h2-export/`)
- [ ] Rehearse on a copy of the production H2 file
- [ ] Cutover checklist (§11)

---

## 11. Data migration and cutover

### Export from H2

The source DB is an H2 file (`data/groceries.mv.db`; the local copy is empty — real data is on the
production host under `/opt/groceries`). Export with the H2 jar already in the Gradle cache:

```sh
H2=$(ls ~/.gradle/caches/modules-2/files-2.1/com.h2database/h2/2.4.240/*/h2-2.4.240.jar)
# Run against a COPY of the .mv.db file while the app is stopped (H2 file locks).
java -cp "$H2" org.h2.tools.Shell -url "jdbc:h2:file:/path/to/copy/groceries" -user sa -password "" \
  -sql "CALL CSVWRITE('/tmp/export/app_users.csv', 'SELECT * FROM APP_USERS');
        CALL CSVWRITE('/tmp/export/meals.csv', 'SELECT * FROM MEALS');
        CALL CSVWRITE('/tmp/export/ingredients.csv', 'SELECT * FROM INGREDIENTS');
        CALL CSVWRITE('/tmp/export/kroger_config.csv', 'SELECT * FROM KROGER_CONFIG');
        CALL CSVWRITE('/tmp/export/kroger_tokens.csv', 'SELECT * FROM KROGER_TOKENS');
        CALL CSVWRITE('/tmp/export/orders.csv', 'SELECT * FROM ORDERS');
        CALL CSVWRITE('/tmp/export/order_meals.csv', 'SELECT * FROM ORDER_MEALS')"
```

### Import (`scripts/migrate-from-h2.ts`)

- Run migrations on a fresh SQLite file, then insert inside one transaction, **preserving IDs** so
  any bookmarked `/groceries/meals/:id` URLs keep working.
- `app_users.username` → `email`; replace the BCrypt hash with an unusable placeholder (§5); drop `can_use_ai`.
- Skip (and report) meals/configs/tokens/orders with a null `user_id`.
- `order_meals` has no order column; assign `position` by row order within each order.
- Convert `TIMESTAMP WITH TIME ZONE` to ISO-8601 UTC strings.
- Skip `oauth_pkce_state` (transient).
- CLIENT tokens can be dropped (re-fetched on demand); USER tokens are worth keeping so users stay
  connected to Kroger.
- Print per-table counts before/after and fail on any mismatch other than reported skips.

### Cutover

1. Deploy Samhain with the groceries routes behind `/groceries` (proxy no longer strips the prefix).
2. Stop the Spring service (`systemctl stop groceries`), export, import, start Samhain.
3. Run `scripts/set-password.ts <email>` for the existing user. Smoke test: sign in, open a meal, shop, Settings shows
   "Connected" for a linked user, connect flow round-trips on the production redirect URI.
4. Keep the old jar and H2 file for rollback until the new app has run cleanly for a while.
5. Afterward: retire `deploy.sh`, the systemd unit, `APP_JWT_SECRET`, and `GEMINI_API_KEY`.

Existing JWTs in users' `localStorage` become meaningless; everyone signs in once after cutover.

---

## 12. Known quirks: preserve or fix

Observed by reading the source and by exercising the running app. Default recommendation in bold;
record the final call in §14.

| # | Quirk in the source | Recommendation |
| --- | --- | --- |
| 1 | Creating a meal with a duplicate name → unhandled constraint violation, **500**; the dialog silently stays open. | **Fix:** 400 with an inline message in the dialog. |
| 2 | Adding a duplicate ingredient name to a meal → 500 (unique `(meal_id, name)`). | **Fix:** 400 with inline message. |
| 3 | Clearing an ingredient quantity is impossible: the UI sends `quantity: null`, which the API treats as "unchanged". | **Fix:** empty input clears the quantity. |
| 4 | Bad login returns **400**, not 401. | Preserve the message; status is internal now (page re-render 400). |
| 5 | Meal list order is undefined. | **Order by name, case-insensitive.** |
| 6 | Consolidated item names are shown lowercased. | **Preserve.** |
| 7 | Mobile Shop cards hide a quantity of exactly `"1"`; desktop shows it. | **Preserve** (faithful), revisit later. |
| 8 | Login page renders inside the full header with nav links while signed out. | **Preserve**; optional cleanup: hide nav when signed out. |
| 9 | `POST /api/kroger/cart` trusts client-sent UPCs; `/cart/meals` (server-computed) is unused. | **Fix:** server computes cart items from meal IDs + exclusions (§7). |
| 10 | Location results show only `addressLine1`; city/state/ZIP are fetched but not shown (the frontend type even expects a single `address` string). | **Preserve** display; keep the extra fields in the mapping. |
| 11 | Saving a location that is not in the current search results stores `locationName = null`. | Only possible via stale state; the server-rendered form always posts the name. Fixed by construction. |
| 12 | Kroger client credentials have no UI. | **Preserve**; add a CLI script (§6). |
| 13 | Order timestamps use the browser locale/time zone. | **Preserve** via client-side localization (§7). |
| 14 | `upc` falls back to `productId`, so "No UPC" never triggers. | **Preserve.** |
| 15 | The sign-out button only cleared local state (no server call). | **Change:** POST logout that destroys the session. |

---

## 13. Running the source app for comparison

The built jar (`build/libs/groceries-0.0.1-SNAPSHOT.jar`) was built for production: its SPA expects
to be served under `/groceries/`. To run it locally **without touching the real H2 file**:

```sh
S=<scratch dir>; mkdir -p $S/h2 && cp ../groceries/data/groceries.mv.db $S/h2/
java -jar ../groceries/build/libs/groceries-0.0.1-SNAPSHOT.jar \
  --server.port=18080 --spring.datasource.url="jdbc:h2:file:$S/h2/groceries"
```

Then browse through something that maps `/groceries/*` → `/*` on port 18080. The screenshots in
`reference/` were taken with a Playwright context route that rewrote `/groceries/` → `/` before
fetching. Alternatives: `cd ../groceries/frontend && bun run dev` (Vite dev server at `/`, proxies
`/api` to **8080**, so start the jar on 8080), or a two-line Caddy/nginx prefix strip.

Kroger features need a `kroger_config` row with real client credentials; without one, Settings shows
"Not connected" and searches fail with "Kroger not configured". Seed data used for the screenshots:
user `demo@example.com`; meals Tacos (`2 lb ground beef`, `1 red onion`, `salt`, `1/2 cup salsa`,
`3 cloves garlic`) and Chili (`1 lb ground beef`, `2 Onion`, `1 can beans`).

---

## 14. Decisions log

Record every decision that changes behavior relative to the source, with the date.

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-10-04 | Mount at `/groceries` in Samhain | Keeps production URLs and the registered Kroger redirect URI. |
| 2026-10-04 | SQLite via `remix/data-table`; drop `oauth_pkce_state` | No extra deps; OAuth transaction lives in the session. |
| 2026-10-04 | Session cookie auth replaces JWT/localStorage | Server rendering needs identity on every request; httpOnly is safer. |
| 2026-10-04 | Groceries pages keep the shadcn slate light theme | "Recreate the UI faithfully"; Samhain pages keep October Rust. |
| 2026-10-04 | Koog AI meal planning excluded | User requirement. |
| 2026-10-04 | scrypt only, no BCrypt dependency; legacy user resets password via script | Only one existing user. |
| 2026-10-04 | Quirks #1–#15 (§12) resolved as recommended | Approved by user. |
| 2026-10-04 | Database file is `db/samhain.sqlite` | The starter already gitignores `db/*.sqlite`. |
| 2026-10-04 | Login is two leaves (`login` GET, `loginAction` POST) instead of `form()` | Controllers own only direct leaves; a nested `form()` map would need its own controller. |
| 2026-10-04 | "Connect with Kroger" is a POST form (`data-rmx-document`) | Starting OAuth changes session state; the response redirects off-site, so it must be a full document navigation. |
| 2026-10-04 | Sign in rotates the session id with `session.regenerateId()` instead of `completeAuth()` | Sessions live in the cookie; `completeAuth()` also tries to delete the old id from storage and warns on every sign in. |
| 2026-10-04 | Shop submits selected meals in list (name) order | A GET checkbox form posts in DOM order; the source used click order. Consolidated rows and recorded order names follow list order. |
| 2026-10-04 | Shop exclusions persist across selection changes and links | That is what the source did (state outlived the selection), not what §7 first said. |
| 2026-10-04 | Rename/delete return to the page the user was on | Matches the source, where renaming did not change the selection. |
| 2026-10-04 | Popovers open with `popovertarget`, dialogs with `commandfor`/`command="show-modal"` | Triggers work before hydration; the e2e suite caught clicks landing before newly navigated client entries hydrated. Dialog forms also post without JavaScript. |
| 2026-10-04 | Browser-only work (timers, `location`) runs in `ref()` callbacks | Component setup also runs during server rendering; a timer started in setup crashed the server. |
| 2026-10-04 | GET paths with a trailing slash redirect (308) to the canonical path | Production URLs were `/groceries/…/`. |
| 2026-10-04 | Meal pages title themselves `"<meal> · 5 Minute Groceries"` | Small improvement over the source's constant title; other pages use `"<Section> · 5 Minute Groceries"`. |
