// GET /api/auth/me
// Returns the profile belonging to the presented JWT. Used by the frontend on
// page load to restore the signed-in session.

import { requireAuth } from '../_lib/auth.js';
import { json, route } from '../_lib/http.js';

const handler = route(async (req, res) => {
  if (req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.error });

  json(res, 200, { profile: auth.profile });
});

export default handler;
