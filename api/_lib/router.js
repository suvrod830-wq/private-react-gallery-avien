// Central API router.
//
// On Vercel (Hobby plan) each file under api/ = one Serverless Function, and
// the Hobby plan caps deployments at 12 functions. We now have far more
// endpoints than that, so instead of one file per route we expose a SINGLE
// catch-all function (api/[...route].js) that delegates to these handlers.
// The local Express server (server/index.js) uses the same dispatcher, so
// dev and production behave identically.
//
// Route patterns: segments prefixed with ':' capture into req.query.
// Order matters — static segments (view, bulk, by-slug, slug) are listed
// before the dynamic ':id' / ':table/:id' fallbacks.

import loginHandler from './handlers/auth/login.js';
import meHandler from './handlers/auth/me.js';

import imagesIndexHandler from './handlers/images/index.js';
import imageByIdHandler from './handlers/images/byId.js';
import imageBySlugHandler from './handlers/images/bySlug.js';
import imageViewHandler from './handlers/images/view.js';
import imagesBulkHandler from './handlers/images/bulk.js';

import reelsIndexHandler from './handlers/reels/index.js';
import reelByIdHandler from './handlers/reels/byId.js';
import reelBySlugHandler from './handlers/reels/bySlug.js';
import reelViewHandler from './handlers/reels/view.js';

import taxonomyIndexHandler from './handlers/taxonomy/index.js';
import taxonomyBySlugHandler from './handlers/taxonomy/bySlug.js';
import taxonomyByIdHandler from './handlers/taxonomy/byId.js';

import settingsHandler from './handlers/settings.js';
import statsHandler from './handlers/stats.js';
import activityHandler from './handlers/activity.js';

import signHandler from './handlers/cloudinary/sign.js';
import deleteHandler from './handlers/cloudinary/delete.js';

const ROUTES = [
  // auth
  { methods: ['POST'], seg: ['auth', 'login'], handler: loginHandler },
  { methods: ['GET'], seg: ['auth', 'me'], handler: meHandler },

  // images (static BEFORE dynamic)
  { methods: ['POST'], seg: ['images', 'view'], handler: imageViewHandler },
  { methods: ['POST'], seg: ['images', 'bulk'], handler: imagesBulkHandler },
  { methods: ['GET'], seg: ['images', 'by-slug', ':slug'], handler: imageBySlugHandler },
  { methods: ['GET', 'POST'], seg: ['images'], handler: imagesIndexHandler },
  { methods: ['GET', 'PATCH', 'DELETE'], seg: ['images', ':id'], handler: imageByIdHandler },

  // reels (static BEFORE dynamic)
  { methods: ['POST'], seg: ['reels', 'view'], handler: reelViewHandler },
  { methods: ['GET'], seg: ['reels', 'by-slug', ':slug'], handler: reelBySlugHandler },
  { methods: ['GET', 'POST'], seg: ['reels'], handler: reelsIndexHandler },
  { methods: ['GET', 'PATCH', 'DELETE'], seg: ['reels', ':id'], handler: reelByIdHandler },

  // taxonomy (slug BEFORE :id)
  { methods: ['GET'], seg: ['taxonomy', ':table', 'slug', ':slug'], handler: taxonomyBySlugHandler },
  { methods: ['GET', 'POST'], seg: ['taxonomy', ':table'], handler: taxonomyIndexHandler },
  { methods: ['PATCH', 'DELETE'], seg: ['taxonomy', ':table', ':id'], handler: taxonomyByIdHandler },

  // settings / stats / activity
  { methods: ['GET', 'PATCH'], seg: ['settings'], handler: settingsHandler },
  { methods: ['GET'], seg: ['stats'], handler: statsHandler },
  { methods: ['GET'], seg: ['activity'], handler: activityHandler },

  // cloudinary
  { methods: ['POST'], seg: ['cloudinary', 'sign'], handler: signHandler },
  { methods: ['POST'], seg: ['cloudinary', 'delete'], handler: deleteHandler },
];

function matchRoute(method, segments) {
  for (const r of ROUTES) {
    if (r.seg.length !== segments.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < r.seg.length; i++) {
      const want = r.seg[i];
      if (want.startsWith(':')) {
        params[want.slice(1)] = decodeURIComponent(segments[i]);
      } else if (want !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (ok && r.methods.includes(method)) {
      return { handler: r.handler, params };
    }
  }
  return null;
}

/**
 * Dispatch an incoming /api request to the right handler.
 * Works under both Vercel (req.query pre-populated) and Express (req.params).
 */
export function dispatch(req, res) {
  // Vercel normally provides the original URL in req.url. Depending on the
  // routing/rewrite path, however, a catch-all function can receive a URL
  // containing only the query string while the matched path is available in
  // req.query.route. Prefer the URL, then fall back to Vercel's catch-all
  // parameter so /api/taxonomy/* does not incorrectly become a 404.
  const rawPath = String(req.url || '').split('?')[0];
  let segments = rawPath.replace(/\/+$/, '').split('/').filter(Boolean);
  if (segments[0] === 'api') segments = segments.slice(1);

  const routeParam = req.query?.route;
  const routeSegments = Array.isArray(routeParam)
    ? routeParam.map(String).filter(Boolean)
    : typeof routeParam === 'string'
      ? routeParam.split('/').filter(Boolean)
      : [];

  // If the URL is empty or contains a framework placeholder (rather than the
  // original path), use Vercel's decoded catch-all parameter.
  if (segments.length === 0 && routeSegments.length > 0) {
    segments = routeSegments;
  }

  if (segments.length === 1 && segments[0] === 'health') {
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true }));
  }

  let match = matchRoute(req.method, segments);
  // Also retry the route parameter when req.url was populated with a rewrite
  // target/placeholder that is non-empty but does not match an API route.
  if (!match && routeSegments.length > 0) {
    match = matchRoute(req.method, routeSegments);
  }
  if (!match) {
    res.status(404);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Not found.' }));
  }

  // Expose dynamic params on req.query for the handlers (they read req.query).
  req.query = { ...req.query, ...match.params };
  return match.handler(req, res);
}
