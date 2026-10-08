// POST /api/cloudinary/sign
// Returns signed upload parameters so the browser can upload directly to
// Cloudinary WITHOUT ever seeing the API secret. Admin-only.
//
// Response shape:
//   { cloud_name, api_key, timestamp, signature, folder, resource_type }
// The frontend POSTs these + the file as multipart/form-data to
//   https://api.cloudinary.com/v1_1/<cloud>/image/upload

import { requireAdmin } from '../_lib/auth.js';
import { json, readJsonBody, route } from '../_lib/http.js';
import { cloudinary } from '../_lib/cloudinary.js';
import { serverEnv, serverReady, serverEnvErrors } from '../_lib/env.js';

const handler = route(async (req, res) => {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.error });

  if (!serverReady()) {
    const vars = serverEnvErrors();
    return json(res, 503, {
      error: `Missing server environment variables: ${vars.join(', ')}. Add these to your .env or Vercel project settings, then restart the API.`,
    });
  }

  const body = await readJsonBody(req);
  const folder =
    typeof body.folder === 'string' && body.folder.trim()
      ? body.folder.trim().replace(/^\/+|\/+$/g, '')
      : 'personal-gallery';

  // Images keep the historic signature shape ({timestamp, folder}) so
  // existing uploads are unaffected. Videos opt in with resource_type.
  const resourceType = body.resource_type === 'video' ? 'video' : 'image';

  // IMPORTANT: resource_type must NOT be part of the signature. Cloudinary
  // derives the resource type from the upload URL path (/video/upload) and
  // excludes it from the signed string — signing it causes "Invalid
  // Signature". Only folder + timestamp are signed, for images and videos.
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = { timestamp, folder };

  // api_sign_request sorts + hashes the params with the secret server-side.
  const signature = cloudinary.utils.api_sign_request(paramsToSign, serverEnv.cloudinaryApiSecret);

  json(res, 200, {
    cloud_name: serverEnv.cloudinaryCloudName,
    api_key: serverEnv.cloudinaryApiKey,
    timestamp,
    signature,
    folder,
    resource_type: resourceType,
  });
});

export default handler;
