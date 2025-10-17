# Palette Monorepo

This is a Turborepo-based monorepo containing three workspaces that share a single local Supabase setup and a single Git repository.

- apps
  - `Palette` – main web app (Vite/React)
  - `paletteshipper` – shipper-facing web app (Vite/React)
  - `palette_backend` – serverless API for Vercel (`api/*.ts` functions)
- infra
  - `supabase/` – single shared Supabase project (local dev only)

## Getting Started

- Install: `npm install` (run at repo root)
- Dev (all in parallel): `npm run dev`
  - `Palette`: Vite dev server
  - `paletteshipper`: Vite dev server
  - `palette_backend`: `vercel dev` (requires Vercel CLI)
- Build all: `npm run build`

## Requirements

- Node 18+
- Vercel CLI for backend dev: `npm i -g vercel`
- Supabase CLI (optional for local DB): `npm i -g supabase`

## Workspaces

This repo uses npm workspaces with Turborepo for task orchestration and caching.

- Run a script in a specific workspace: `npm --workspace <name> run <script>`
- Example: `npm --workspace Palette run build`

## Turborepo

- Config: `turbo.json` (modern `tasks` format)
- Common tasks: `build`, `dev`, `lint`, `test`
- Outputs cached: `dist/**` (Vite/tsc); logs cached automatically
- Remote caching (optional): `npx turbo login && npx turbo link` then set `TURBO_TEAM`/`TURBO_TOKEN` in CI/Vercel

More details and best practices in `docs/turborepo/`.

## Supabase

- Single shared project under `./supabase`
- Do not create per-app Supabase folders
- Configure environment variables in each app (local `.env`, Vercel Project Settings)

## Vercel Deployments

You can deploy apps as separate Vercel projects:

- Root Directory: `Palette` (web)
- Root Directory: `paletteshipper` (shipper web)
- Root Directory: `palette_backend` (API functions)

Alternatively, use a single Vercel project for one app and filter tasks with Turborepo (e.g., `turbo run build --filter=Palette`).

## Unified Authentication (Single Entry) Less goo

Palette uses the Gallery app as the single entry point for both login and signup. After authentication, users are routed based on their organization type.

- Entry point: Gallery `Palette` at `/auth`
- Shipper `/auth` is a redirector to Gallery `/auth` when unauthenticated
- Routing after login/signup:
  - Partner (shipper) users → handed off to Shipper via a short‑lived, single‑use session link
  - Client (gallery) users → remain in Gallery (`/dashboard`)
- Pre‑approval on signup is enforced via the existing Supabase RPC `join_organization_if_approved` and `organization_approved_users`

### Session Handoff (DB‑backed)

The backend (`palette_backend`) exposes two endpoints to pass the session securely from Gallery → Shipper:

- `POST /api/auth/session-link/create`
  - Auth: Bearer `<access_token>`
  - Body: `{ refresh_token, target_app: 'shipper', redirect_path?: string }`
  - Response: `{ link: <uuid>, exp: <unix-seconds> }`
- `POST /api/auth/session-link/consume`
  - Body: `{ link: <uuid> }`
  - Response: `{ access_token, refresh_token, redirect_path }`

Links are stored in `public.session_links` (see `tasks/single-entry-auth/session_links.sql`) and enforced as single‑use with a short TTL.

Handoff encoding (bytea) is handled server‑side to avoid double‑encoding:
- Insert via RPC: `public.session_link_put(...)` accepts Base64 strings and decodes into bytea in SQL.
- Read via view: `public.session_links_api` exposes Base64 strings for bytea fields (`encode(...,'base64')`).
- These are provided in `tasks/testusers-seed/session_link_put.sql` and are required in environments using the DB‑backed handoff.

Shipper handoff page (`/auth/handoff`) consumes the link, exchanges the refresh token for an access token, and sets the Supabase session locally.

### Environment Variables (auth-related)

Backend (`palette_backend`):
- `SESSION_LINK_SECRET` – 32‑byte secret (hex/base64) for AES‑GCM encryption
- `ALLOWED_ORIGINS` – comma‑separated CORS origins (include Gallery + Shipper, staging + prod)

Gallery (`Palette`):
- `VITE_API_BASE_URL` – backend base URL
- `VITE_SHIPPER_APP_URL` – Shipper base URL

Shipper (`paletteshipper`):
- `VITE_API_BASE_URL` – backend base URL
- `VITE_GALLERY_APP_URL` – Gallery base URL

See `.env` files in each workspace and the `.env.example` files for templates.

Important:
- `VITE_API_BASE_URL` must be an absolute URL with scheme (e.g., `https://your-backend.vercel.app`). If it is a bare hostname or path, the browser will treat it as relative to the current origin and requests will 404.
- `ALLOWED_ORIGINS` must include the exact Gallery and Shipper origins for CORS to allow the session‑link endpoints.

Local dev defaults (repo root `.env`):
- Gallery: `http://localhost:5173`
- Shipper: `http://localhost:3000`
- Backend (Express wrapper over Vercel handlers): `http://localhost:3002`

Supabase (local):
- `SUPABASE_URL=http://127.0.0.1:54321`
- Use the local `anon` and `service_role` keys from `supabase status`.

### Logout (Cross‑App)

- Uses `supabase.auth.signOut({ scope: 'global' })` to revoke refresh tokens.
- Both apps clear local/session storage for Supabase (`sb-*` keys) on logout.
- Cross‑app bounce ensures both origins clear their storage:
  - Gallery → redirect to `SHIPPERS_APP_URL/auth?logout=1&return=<gallery>/auth`
  - Shipper → redirect to `GALLERY_APP_URL/auth?logout=1&return=<shipper>/auth`
  - Each app’s `/auth` handles `logout=1` by signing out globally, clearing storage, and returning to the caller.

This guarantees users can immediately sign back in without stale sessions.

### Seeding Test Users (local)

SQL for local test setup lives at `tasks/testusers-seed/seed_test_users.sql`.
- Creates: `Test Gallery` (client) and `Test Shipper` (partner)
- Seeds pre‑approved users: `gallery@test.com`, `shipper@test.com`
- Ensures a `logistics_partners` row for the partner org

Additional debug notes and the server‑side handoff SQL are in:
- `tasks/testusers-seed/HANDOFF_DEBUG.md`
- `tasks/testusers-seed/session_link_put.sql`

## Database Support

The optional DB migration for one‑time session links lives at:

- `tasks/single-entry-auth/session_links.sql`

It creates `public.session_links`, indexes, RLS (service‑role only), and a purge helper function. Run it once per environment to enable the DB‑backed handoff.

## Conventions

- Root-only Git repo; no nested `.git` directories
- Root-only lockfile; nested lockfiles are ignored and removed
- `.env` files are ignored by Git, but `.env.example` files are tracked

## Security Notes

- Do not commit real secrets; use Vercel environment variables
- CORS is enforced dynamically via `ALLOWED_ORIGINS` in the backend (no hardcoded domains)
- Handoff uses AES‑GCM encryption and single‑use DB claims to minimize risk

## Common Commands

- `npm run dev` – run all workspace dev servers
- `npm run build` – build everything
- `npm --workspace <w> run dev` – run a single workspace
- `turbo run` – list runnable tasks detected by Turborepo

---

Questions or improvements? See `docs/turborepo` or open an issue.
