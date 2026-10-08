// Local development API server (Express).
// Mounts the exact same handlers that Vercel runs as serverless functions
// under /api, so behaviour is identical in dev and production.
//
// During development Vite proxies /api → this server (see vite.config.js).
// If a production build exists in dist/, it is also served here so you can
// run the full app with `npm run build && node server/index.js`.

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

// Auth (JWT — replaces Supabase Auth)
import loginHandler from '../api/auth/login.js';
import meHandler from '../api/auth/me.js';

// Images (Aiven PostgreSQL via list_images / get_image_by_slug / record_image_view)
import imagesIndexHandler from '../api/images/index.js';
import imageByIdHandler from '../api/images/[id].js';
import imageBySlugHandler from '../api/images/by-slug/[slug].js';
import imageViewHandler from '../api/images/view.js';
import imagesBulkHandler from '../api/images/bulk.js';

// Reels (short videos — same pattern as images)
import reelsIndexHandler from '../api/reels/index.js';
import reelByIdHandler from '../api/reels/[id].js';
import reelBySlugHandler from '../api/reels/by-slug/[slug].js';
import reelViewHandler from '../api/reels/view.js';

// Taxonomies (categories / tags / authors / albums)
import taxonomyIndexHandler from '../api/taxonomy/[table]/index.js';
import taxonomyBySlugHandler from '../api/taxonomy/[table]/slug/[slug].js';
import taxonomyByIdHandler from '../api/taxonomy/[table]/[id].js';

// Settings, stats, activity
import settingsHandler from '../api/settings/index.js';
import statsHandler from '../api/stats.js';
import activityHandler from '../api/activity.js';

// Cloudinary (signed uploads + deletes)
import signHandler from '../api/cloudinary/sign.js';
import deleteHandler from '../api/cloudinary/delete.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(express.json({ limit: '1mb' }));

// Vercel puts dynamic route segments on req.query; Express puts them on
// req.params. Merge them so a handler behaves identically on both runtimes.
const wrap = (handler) => (req, res) => {
  Object.assign(req.query, req.params);
  return handler(req, res);
};

// --- Health ---
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Auth ---
app.post('/api/auth/login', loginHandler);
app.get('/api/auth/me', meHandler);

// --- Images (static segments BEFORE :id) ---
app.post('/api/images/view', imageViewHandler);
app.post('/api/images/bulk', imagesBulkHandler);
app.get('/api/images/by-slug/:slug', wrap(imageBySlugHandler));
app.get('/api/images', imagesIndexHandler);
app.post('/api/images', imagesIndexHandler);
app.get('/api/images/:id', wrap(imageByIdHandler));
app.patch('/api/images/:id', wrap(imageByIdHandler));
app.delete('/api/images/:id', wrap(imageByIdHandler));

// --- Reels (static segments BEFORE :id) ---
app.post('/api/reels/view', reelViewHandler);
app.get('/api/reels/by-slug/:slug', wrap(reelBySlugHandler));
app.get('/api/reels', reelsIndexHandler);
app.post('/api/reels', reelsIndexHandler);
app.get('/api/reels/:id', wrap(reelByIdHandler));
app.patch('/api/reels/:id', wrap(reelByIdHandler));
app.delete('/api/reels/:id', wrap(reelByIdHandler));

// --- Taxonomies (slug route BEFORE :id) ---
app.get('/api/taxonomy/:table/slug/:slug', wrap(taxonomyBySlugHandler));
app.get('/api/taxonomy/:table', wrap(taxonomyIndexHandler));
app.post('/api/taxonomy/:table', wrap(taxonomyIndexHandler));
app.patch('/api/taxonomy/:table/:id', wrap(taxonomyByIdHandler));
app.delete('/api/taxonomy/:table/:id', wrap(taxonomyByIdHandler));

// --- Settings / stats / activity ---
app.get('/api/settings', settingsHandler);
app.patch('/api/settings', settingsHandler);
app.get('/api/stats', statsHandler);
app.get('/api/activity', activityHandler);

// --- Cloudinary ---
app.post('/api/cloudinary/sign', signHandler);
app.post('/api/cloudinary/delete', deleteHandler);

// --- Serve the production build (optional; Vite serves dev) ---
const dist = path.resolve(__dirname, '../dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[api] listening on http://0.0.0.0:${PORT}`);
  if (!process.env.DATABASE_URL) {
    console.warn('[api] WARNING: DATABASE_URL is not set — database endpoints will answer 503.');
  }
  if (!process.env.JWT_SECRET) {
    console.warn('[api] WARNING: JWT_SECRET is not set — auth endpoints will answer 503.');
  }
});
