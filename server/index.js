// Local development API server (Express).
// Uses the EXACT same dispatcher Vercel's single catch-all function runs
// (api/_lib/router.js), so behaviour is identical in dev and production.
//
// During development Vite proxies /api → this server (see vite.config.js).
// If a production build exists in dist/, it is also served here so you can
// run the full app with `npm run build && node server/index.js`.

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { dispatch } from '../api/_lib/router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

// The API: one catch-all, same router as Vercel.
app.all('/api', dispatch);
app.all('/api/*', dispatch);

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
