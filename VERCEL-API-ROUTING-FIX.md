# Vercel API routing fix

## What changed

`api/_lib/router.js` now resolves the catch-all path from `req.query.route` when Vercel invokes `api/[...route].js` without leaving the original API path in `req.url`. The original URL remains the primary source, and the existing API handlers, database access, authentication, and frontend are unchanged.

## Deploy

1. Replace `api/_lib/router.js` with the version in this archive (or replace the whole project with this archive).
2. Commit and push the changes to the branch connected to Vercel.
3. In Vercel, open Deployments and confirm a new deployment completed.
4. Test `https://YOUR-DOMAIN/api/health` — expected response: `{"ok":true}`.
5. Test `https://YOUR-DOMAIN/api/taxonomy/categories` — if routing is fixed, it should no longer return the dispatcher's `{"error":"Not found."}`. It may return a database/configuration error such as HTTP 503 if required environment variables are missing, which is a separate issue.

Keep the existing Vercel environment variables configured; do not commit `.env` or secrets.
