# Personal Image Gallery

A production-ready personal image gallery CMS built with **React**, **Tailwind CSS**, **Aiven for PostgreSQL** (single database, custom JWT auth) and **Cloudinary** (image storage/CDN), deployed on **Vercel**.

```
Cloudinary         → image files (binary)
Aiven PostgreSQL   → image metadata, users, categories, tags, authors, albums
api/ (serverless)  → the ONLY path from the browser to the database
```

> **No mock data.** This app uses real integrations only. Until you configure
> the environment it renders honest "backend not configured" screens.

### Supabase is gone

This project was migrated from Supabase to plain **Aiven for PostgreSQL**:

- No `@supabase/supabase-js` anywhere (removed from `package.json`).
- No Supabase Auth — admins log in via `POST /api/auth/login` (bcrypt
  password check against `profiles.password_hash`) and receive a **JWT**.
- No Row Level Security — authorization is enforced by the API layer
  (`api/_lib/auth.js` verifies the JWT + `profiles.role` on every request).
- Schema lives in `aiven/migrations/` (the old `supabase/` folder is deleted).

---

## 1. Requirements

- **Node.js ≥ 20** (LTS recommended)
- An **Aiven for PostgreSQL** service (any plan)
- A **Cloudinary** account (free tier is fine)
- A **Vercel** account (free tier is fine)

Verify: `node --version`

---

## 2. Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy the environment template and fill it in (see §3)
cp .env.example .env

# 3. Create the schema in Aiven
npm run migrate:aiven

# 4. Create your admin account
npm run create-admin -- you@example.com "AStrongPass!123"

# 5. Start the app (Vite on :5173 + local API on :3001)
npm run dev
```

Open http://localhost:5173 — sign in at `/admin/login`.

> ⚠ If you previously used the Supabase version: **delete every
> `VITE_SUPABASE_*` / `SUPABASE_*` line from your `.env`** — they are ignored
> now and only cause confusion.

---

## 3. Environment variables

Copy `.env.example` → `.env`. Two groups:

| Variable | Where | Description |
|---|---|---|
| `VITE_CLOUDINARY_CLOUD_NAME` | Browser | Cloudinary cloud name (safe) |
| `VITE_CLOUDINARY_UPLOAD_FOLDER` | Browser | Folder for uploads (default `personal-gallery`) |
| `DATABASE_URL` | Server only | Aiven PostgreSQL connection string (`postgres://avnadmin:…@host:port/defaultdb?sslmode=require`) |
| `DATABASE_SSL` | Server only | Set `false` only for a local non-TLS Postgres |
| `JWT_SECRET` | Server only | Signs auth tokens — generate a long random string |
| `CLOUDINARY_API_KEY` | Server only | Never expose to the browser |
| `CLOUDINARY_API_SECRET` | Server only | Never expose to the browser |
| `ADMIN_EMAILS` | Server only | Informational allow-list for admins |
| `PORT` | Server only | Local API port (default 3001) |

`.env` is git-ignored. **Never commit secrets.** The browser bundle only ever
contains `VITE_*` values — `DATABASE_URL`, `JWT_SECRET` and the Cloudinary
secret are used exclusively by the API (Express in dev, `api/` serverless
functions on Vercel).

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 4. Aiven PostgreSQL setup

### 4.1 Create the service

1. Go to https://console.aiven.io → **Create service → PostgreSQL**.
2. Service → **Connection information** → copy the `avnadmin` URI into
   `DATABASE_URL` (keep `?sslmode=require`).

### 4.2 Apply the schema

```bash
npm run migrate:aiven
```

This applies `aiven/migrations/*.sql` in order inside transactions and tracks
them in `schema_migrations` — safe to re-run. Alternatives:

```bash
npm run test:aiven          # connection test
npm run check:tables        # verify all tables exist
npm run check:schema        # verify tables + functions
npm run test:aiven:functions # functional test of the SQL functions
```

### 4.3 What the schema creates

Tables: `profiles` (with `password_hash`), `settings`, `categories`, `tags`,
`authors`, `albums`, `images` (metadata only — **no binaries**), `image_tags`,
`image_views`, `activity_logs`, `reels` + `reel_views` (short videos,
metadata only — video files live in Cloudinary).

Migration files:

| File | What it creates |
|---|---|
| `aiven/migrations/0001_initial_schema.sql` | Core tables, indexes, image functions, triggers |
| `aiven/migrations/0002_taxonomy_list.sql` | `taxonomy_list()` (counts + covers) |
| `aiven/migrations/0003_reels.sql` | `reels` module: tables, `list_reels()`, `get_reel_by_slug()`, `record_reel_view()`, extended `dashboard_stats()` |

Key points:

- **Search / filters / sort / pagination** all happen in PostgreSQL via the
  `list_images(jsonb)` function — never by downloading the whole table.
- `get_image_by_slug(slug, include_drafts)` — the API passes
  `include_drafts = true` only for authenticated admins.
- `record_image_view(uuid, text)` increments views **once per session**.
- `dashboard_stats()` + `log_activity()` are used by admin API endpoints.
- Unique constraints guarantee unique public slugs.

### 4.4 Authorization model (no RLS)

RLS does not exist on this stack — **the API layer is the security boundary**.
Every mutating endpoint requires `Authorization: Bearer <JWT>` and resolves
the caller's role from the `profiles` table on each request (a role claim in
the token is never trusted blindly). Public endpoints force
`published_only = true` server-side, regardless of what the client asks for.

### 4.5 Create the admin user

```bash
npm run create-admin -- you@example.com "AStrongPass!123"
```

Inserts a `profiles` row with `role = 'admin'` and a bcrypt password hash.
Re-running it for an existing email **resets that password** — this is also
your "forgot password" path. Sign in at `/admin/login`.

---

## 5. Cloudinary setup

### 5.1 Create the account & get keys

1. Sign up at https://cloudinary.com.
2. **Dashboard → Account details**: copy
   - **Cloud name** → `VITE_CLOUDINARY_CLOUD_NAME`
   - **API Key** → `CLOUDINARY_API_KEY`
   - **API Secret** → `CLOUDINARY_API_SECRET` (secret — server-side only)

> ⚠ A previous Cloudinary key/secret pair was committed publicly in this
> repo's history. **Regenerate both** in the Cloudinary dashboard.

### 5.2 Upload architecture (signed — secure)

1. The admin browser asks `POST /api/cloudinary/sign` for a signature.
2. The API verifies the admin's JWT, then signs the upload parameters with
   the API secret (the secret never leaves the server).
3. The browser uploads the file **directly** to Cloudinary with those signed
   parameters — no file ever passes through our server.
4. Cloudinary returns the asset metadata → `POST /api/images` stores it in
   PostgreSQL.

Deletes go through `POST /api/cloudinary/delete` (or `DELETE /api/images/:id`,
which removes the row and then the CDN asset), always admin-verified
server-side.

### 5.3 Test the upload

1. Start the app with env vars set.
2. Sign in at `/admin/login`.
3. Open **Upload Image**, drop a JPEG/PNG/WebP/AVIF/GIF (≤ 15 MB), fill
   title + category, click **Upload**.
4. The image appears in the gallery.

### 5.4 Reels (short videos)

The Reels module reuses the same signed-upload flow with
`resource_type: 'video'`:

- **Admin → Reels → Upload Reel**: MP4/WebM/MOV up to 100 MB (Cloudinary
  free-tier video limit; vertical 9:16 recommended).
- Videos stream from Cloudinary (`f_auto,q_auto`); posters are auto-extracted
  frames (`so_auto`) unless a dedicated thumbnail is stored.
- Public pages: `/reels` (feed with search/sort) and `/reel/:slug` (player
  with prev/next). Admin: `/admin/reels` (publish/feature/delete),
  `/admin/reels/:id/edit` (metadata + replace video).
- Requires `aiven/migrations/0003_reels.sql` (`npm run migrate:aiven`).

---

## 6. Local development

```bash
npm run dev        # Vite (5173) + API (3001), Vite proxies /api → 3001
npm run dev:web    # frontend only
npm run dev:api    # API only
npm run lint       # ESLint
npm run build      # production build into dist/
npm run preview    # serve the production build
npm run smoke      # Playwright route sweep against the running dev server
```

The local API (`server/index.js`) mounts the **exact same handlers** Vercel
runs as serverless functions, so dev and production behave identically.

### API surface

| Endpoint | Access | Purpose |
|---|---|---|
| `POST /api/auth/login` | public | email+password → JWT |
| `GET /api/auth/me` | token | current profile |
| `GET /api/images` | public (admins may see drafts) | `list_images()` filtered listing |
| `POST /api/images` | admin | create image + link tags |
| `GET /api/images/by-slug/:slug` | public | single image (drafts admin-only) |
| `GET/PATCH/DELETE /api/images/:id` | admin | edit-form fetch / update / delete + CDN cleanup |
| `POST /api/images/view` | public | deduped view counter |
| `POST /api/images/bulk` | admin | bulk publish/feature/move/tag |
| `GET /api/taxonomy/:table` | public | categories/tags/authors/albums with counts (`?plain=1` = dropdown list) |
| `POST /api/taxonomy/:table` | admin | create |
| `GET /api/taxonomy/:table/slug/:slug` | public | lookup by slug |
| `PATCH/DELETE /api/taxonomy/:table/:id` | admin | update / delete |
| `GET/PATCH /api/settings` | public / admin | site settings |
| `GET /api/stats` | admin | dashboard stats (incl. reel counters) |
| `GET /api/activity` | admin | recent activity log |
| `POST /api/cloudinary/sign` · `/delete` | admin | signed upload / asset destroy (`resource_type=video` for reels) |
| `GET /api/reels` | public (admins may see drafts) | `list_reels()` filtered listing |
| `POST /api/reels` | admin | create reel |
| `GET /api/reels/by-slug/:slug` | public | single reel (drafts admin-only) |
| `GET/PATCH/DELETE /api/reels/:id` | admin | edit-form fetch / update / delete + CDN video cleanup |
| `POST /api/reels/view` | public | deduped reel view counter |

---

## 7. Production build & Vercel deployment

### 7.1 Local build

```bash
npm run build
```

### 7.2 Deploy to Vercel

1. Push the repo to GitHub.
2. In Vercel: **Add New Project → Import** the repo.
3. Framework preset: **Vite** (auto-detected). Build command `npm run build`,
   output `dist/`.
4. Add all environment variables from `.env.example` in
   **Project → Settings → Environment Variables**. Remove any old
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
   entries — they do nothing now.
5. Deploy. `vercel.json` maps `/api/*` to the functions and everything else
   to the SPA (`index.html`).

### 7.3 Post-deploy checks

- [ ] Public pages render (no draft images leak)
- [ ] `/admin/login` works with your admin account
- [ ] Upload, edit, replace, delete work end-to-end
- [ ] Search, filters, pagination, lightbox work

---

## 8. Security notes

- Secrets never reach the browser (only `VITE_*` are compiled in).
- JWTs are signed with `JWT_SECRET` (HS256, 7-day expiry); the profile row is
  re-resolved from PostgreSQL on every request, so deleted/demoted users lose
  access immediately.
- Taxonomy table names in dynamic routes are validated against a whitelist
  before touching SQL.
- Uploads are signed server-side; the Cloudinary API secret stays server-side.
- File type + size validated (JPEG/PNG/WebP/AVIF/GIF, ≤ 15 MB).
- All forms validated with Zod; destructive actions require confirmation.
- View counts can only be incremented via `record_image_view` — never set by
  the client.
- Login responses are identical for unknown emails and wrong passwords.

---

## 9. Project structure

```
api/                    Vercel serverless functions (same code runs in dev)
  auth/                 login.js, me.js (JWT)
  images/               index, [id], by-slug/[slug], view, bulk
  reels/                index, [id], by-slug/[slug], view
  taxonomy/[table]/     index, slug/[slug], [id]
  settings/             index.js
  stats.js activity.js  dashboard stats / activity log
  cloudinary/           sign.js, delete.js (images + videos)
  _lib/                 auth (JWT), db (pg pool), jwt, env, http, slug, taxonomy, activity
aiven/migrations/       SQL schema + functions (run via npm run migrate:aiven)
server/index.js         Local Express API (mounts the same handlers)
scripts/                create-admin, apply-migrations, aiven checks, smoke
src/
  components/           ui, layout, gallery, filters, forms, admin, taxonomy
  contexts/             Auth (JWT-based), Theme, Toast
  hooks/                useImages, useDebounce, useDocumentTitle
  lib/                  env, api client, authToken, cloudinary URL builder
  pages/                public pages + admin pages
  routes/               ProtectedRoute (UX guard)
  schemas/              Zod schemas
  services/             auth, image, category, tag, author, album, settings, cloudinary, activity
  utils/                slugify, format, constants
```

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| "Backend not configured" banner | Fill `.env` and restart `npm run dev` |
| 503 "Database not configured" | Set `DATABASE_URL` + `JWT_SECRET` in `.env`, restart the API |
| "Cannot reach the API server" | `npm run dev` must run **both** Vite and the API (check port 3001) |
| Admin login fails | Re-run `npm run create-admin -- you@example.com "Password"` (also resets passwords) |
| Old Supabase env vars still in `.env` | Delete them — they are ignored; the app only uses `DATABASE_URL`/`JWT_SECRET` now |
| Upload returns 503 | Check `CLOUDINARY_API_KEY`/`SECRET` are set **on the server**, not just `VITE_` |
| `Invalid Signature` on upload | 1) Fully stop and re-run `npm run dev` (the API process doesn't hot-reload). 2) Run `node scripts/check-cloudinary.mjs` — it verifies your key/secret belong to your cloud and prints the exact expected signature |
| Upload fails validation | Use JPEG/PNG/WebP/AVIF/GIF ≤ 15 MB |
| Drafts visible publicly | Impossible without an admin JWT — check no admin token is stored in that browser |
| Cloudinary delete fails | Retry — the app reports the failure and lets you reconcile |
