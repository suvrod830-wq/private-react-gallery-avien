# Supabase → Aiven migration: everything that was broken, and the fixes

You had finished the **database** side of the migration (Aiven migrations,
`pg` pool, helper scripts) — but the **application** was still wired to
Supabase end-to-end, which is why the dev server kept using it. This document
lists every problem found and what changed.

---

## Why it was "still using Supabase"

The browser never talked to your new database at all. Every read/write went
straight from React to Supabase over `supabase-js`, bypassing the Express API
completely:

```
BEFORE:  Browser ──supabase-js──► Supabase (auth + data)
         Browser ──/api─────────► Express ──► only Cloudinary signing
                                             (and even that demanded Supabase env vars!)

AFTER:   Browser ──/api (JWT)──► Express/Vercel ──pg──► Aiven PostgreSQL
         Browser ──────────────► Cloudinary CDN (signed uploads, as before)
```

## The problems (all fixed)

### 1. Frontend data layer still 100% Supabase
- `src/lib/supabase.js` created a Supabase client. **Deleted.**
- `src/lib/env.js` read `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` and
  gated the whole app on them. **Rewritten** — only Cloudinary public config
  remains; exports `isConfigured`.
- `src/lib/api.js` attached the Supabase session token. **Rewritten** —
  attaches the JWT from `localStorage`, auto sign-out on 401.
- **All services rewritten onto `/api`** (same function names, so pages/hooks
  are untouched): `authService`, `imageService` (was 559 lines of direct
  `supabase.from()`/`.rpc()` calls), `taxonomyService`, `settingsService`,
  `cloudinaryService`, `activityService` (now a no-op stub — the server logs
  activity itself), `notConfigured`.
- New: `src/lib/authToken.js` (JWT storage).

### 2. Auth was Supabase Auth
- Login, sessions, password reset all used Supabase Auth. **Replaced** with
  `POST /api/auth/login` (bcrypt check vs `profiles.password_hash`) issuing a
  7-day HS256 JWT, plus `GET /api/auth/me`.
- `AuthContext.jsx` now restores the session from the stored JWT and listens
  for token expiry (auto sign-out).
- "Forgot password" email flow is gone (it was a Supabase feature) — the
  login page now points to `npm run create-admin -- email "newPassword"`,
  which resets passwords.

### 3. The API had no database endpoints
`server/index.js` mounted **only** `/api/cloudinary/sign|delete` + health.
**Added the full REST surface** (each file is also a Vercel serverless
function — same code runs in dev and prod):

```
api/auth/login.js               POST  login → JWT
api/auth/me.js                  GET   current profile
api/images/index.js             GET   list_images() filtered listing / POST create
api/images/[id].js              GET + PATCH + DELETE (admin)
api/images/by-slug/[slug].js    GET   public single image (drafts admin-only)
api/images/view.js              POST  deduped view counter
api/images/bulk.js              POST  bulk publish/feature/move/tag
api/taxonomy/[table]/index.js   GET (counts | ?plain=1) / POST create
api/taxonomy/[table]/slug/[slug].js  GET by slug
api/taxonomy/[table]/[id].js    PATCH + DELETE
api/settings/index.js           GET public / PATCH admin
api/stats.js                    GET   dashboard_stats()
api/activity.js                 GET   recent activity log
```

### 4. Server libs still required Supabase
- `api/_lib/env.js` demanded `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  — so **even Cloudinary signing returned 503** without Supabase. **Rewritten**
  to require `DATABASE_URL` + `JWT_SECRET` + Cloudinary vars.
- `api/_lib/auth.js` verified Supabase tokens via the service-role client.
  **Rewritten** — JWT verification, and the profile row is re-resolved from
  Postgres on every request (demoted/deleted users lose access immediately).
- `api/_lib/supabase.js` **deleted**.
- `api/_lib/db.js` now creates the pool lazily: the dev server boots (and
  answers clean 503s) even before `DATABASE_URL` is set. Also registers a
  `bigint → Number` parser so counters/sizes arrive as numbers like they did
  from Supabase's REST layer.
- New helpers: `api/_lib/jwt.js`, `slug.js`, `taxonomy.js` (table whitelist —
  dynamic `[table]` route params are validated before ever touching SQL),
  `activity.js`.

### 5. `scripts/create-admin.mjs` used the Supabase Admin API
**Rewritten** — inserts/updates `profiles` via `pg` with a bcrypt hash.
Re-running it for an existing email resets the password (your recovery path).

### 6. Leftover Supabase artifacts
- `@supabase/supabase-js` removed from `package.json`; `bcryptjs` +
  `jsonwebtoken` added.
- `supabase/` folder (migrations + `.temp` CLI state) **deleted** — schema
  lives in `aiven/migrations/`.
- `vite.config.js` no longer builds a `supabase` vendor chunk.
- `vercel.json` now covers all `api/**` functions.
- Every UI string/banner that said "Connect Supabase…" rewritten.
- `.env.example` and `README.md` rewritten for Aiven + JWT.

---

## What YOU need to do now

1. **Update your local `.env`** — this is the #1 reason it looked like
   Supabase was still in use; your `.env` almost certainly still has the old
   vars. Use this shape (see `.env.example`):

   ```bash
   DATABASE_URL=postgres://avnadmin:PASSWORD@HOST:PORT/defaultdb?sslmode=require
   JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
   VITE_CLOUDINARY_CLOUD_NAME=...
   VITE_CLOUDINARY_UPLOAD_FOLDER=personal-gallery
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...
   PORT=3001
   # DELETE every VITE_SUPABASE_* / SUPABASE_* line
   ```

2. `npm install` (deps changed), then apply schema + create your admin:

   ```bash
   npm run migrate:aiven      # safe to re-run
   npm run create-admin -- you@example.com "YourPassword123!"
   ```

3. `npm run dev` → sign in at `/admin/login`.

4. Optional sanity checks: `npm run test:aiven`, `npm run check:schema`,
   `npm run test:aiven:functions`, `npm run smoke`.

5. **Vercel:** set the same env vars in the project settings and remove the
   old Supabase ones. Redeploy.

6. ⚠ **Security:** `access.md` in this repo contains (partially masked)
   Cloudinary credentials, and an earlier commit leaked the real ones
   (noted in `.env.example`). **Rotate the Cloudinary API key/secret now**
   and consider removing `access.md` from the repo + history.

## Supabase data → Aiven

If your Supabase project has existing rows you care about, export each table
(`profiles`, `categories`, `tags`, `authors`, `albums`, `images`,
`image_tags`, `settings`) to CSV/SQL and import into Aiven; add a bcrypt
`password_hash` for the admin profile (or just re-run `create-admin`). The
Cloudinary `public_id`s carry over unchanged.
