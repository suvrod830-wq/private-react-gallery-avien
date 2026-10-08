// THE single Vercel Serverless Function for the whole API.
//
// The Hobby plan allows at most 12 functions per deployment, and every
// file under api/ used to count as one. This catch-all keeps the count at
// exactly ONE while the real logic lives in api/_lib/handlers/* (files that
// start with an underscore are never deployed as routes by Vercel).
//
// Local development uses the identical dispatcher via server/index.js.

import { dispatch } from './_lib/router.js';

export default function handler(req, res) {
  return dispatch(req, res);
}
