#!/usr/bin/env node
/**
 * Diagnose Cloudinary "Invalid Signature" problems.
 *
 * Usage:
 *   node scripts/check-cloudinary.mjs
 *   node scripts/check-cloudinary.mjs <timestamp> [folder]
 *     → prints the exact signature the server SHOULD produce for that
 *       timestamp+folder, so you can compare with what the browser sent
 *       (DevTools → Network → sign request / upload request payload).
 *
 * Checks performed:
 *   1. All three env vars present (cloud name, api key, api secret).
 *   2. Secret sanity (length / accidental whitespace from .env).
 *   3. Local signature matches Cloudinary's spec
 *      (sha1("folder=…&timestamp=…" + secret) — resource_type excluded).
 *   4. Credentials actually accepted by Cloudinary (api.ping()).
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';

const cloud = (process.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
const key = (process.env.CLOUDINARY_API_KEY || '').trim();
const secret = (process.env.CLOUDINARY_API_SECRET || '').trim();

const mask = (s) =>
  !s ? '(missing)' : s.length <= 6 ? '****' : `${s.slice(0, 3)}…${s.slice(-3)} (${s.length} chars)`;

console.log('Cloudinary configuration found in environment:');
console.log(`  cloud name : ${cloud || '(missing)'}`);
console.log(`  api key    : ${mask(key)}`);
console.log(`  api secret : ${mask(secret)}`);

const missing = [];
if (!cloud) missing.push('VITE_CLOUDINARY_CLOUD_NAME');
if (!key) missing.push('CLOUDINARY_API_KEY');
if (!secret) missing.push('CLOUDINARY_API_SECRET');
if (missing.length) {
  console.error(`\n✖ Missing env vars: ${missing.join(', ')} — add them to .env and retry.`);
  process.exit(1);
}

// Cloudinary API secrets are 27 alphanumeric chars; keys are ~15 digits.
if (secret.length !== 27) {
  console.warn(`\n⚠ API secret is ${secret.length} chars — Cloudinary secrets are normally 27.`);
  console.warn('  Check .env for accidental quotes, spaces, or a truncated copy.');
}
if (process.env.CLOUDINARY_API_SECRET && process.env.CLOUDINARY_API_SECRET !== secret) {
  console.warn('⚠ CLOUDINARY_API_SECRET has leading/trailing whitespace in .env.');
}

// ---------------------------------------------------------------------------
// 1. Signature spec check — must equal sha1("folder=…&timestamp=…" + secret).
//    resource_type is NEVER part of the signed string.
// ---------------------------------------------------------------------------
const cliTs = process.argv[2];
const ts = cliTs ? Number(cliTs) : Math.round(Date.now() / 1000);
const folder = process.argv[3] || 'personal-gallery/reels';

const sdkSig = cloudinary.utils.api_sign_request({ timestamp: ts, folder }, secret);
const manualSig = crypto
  .createHash('sha1')
  .update(`folder=${folder}&timestamp=${ts}${secret}`)
  .digest('hex');

console.log(`\nSignature for folder="${folder}" timestamp=${ts}:`);
console.log(`  expected: ${manualSig}`);
console.log(`  sdk     : ${sdkSig}`);
console.log(`  ${sdkSig === manualSig ? '✔ local signing matches the Cloudinary spec' : '✖ SDK mismatch — this should never happen'}`);
console.log('\n  Compare "expected" with the signature your browser sent:');
console.log('  - DIFFERENT → the dev server is running OLD code (fully stop and');
console.log('    re-run `npm run dev`), or it reads a different secret than this script.');
console.log('  - IDENTICAL but Cloudinary still says Invalid Signature → your');
console.log('    CLOUDINARY_API_SECRET is not the one belonging to this cloud.');

// ---------------------------------------------------------------------------
// 2. Credentials check — prove the key/secret pair belongs to this cloud.
// ---------------------------------------------------------------------------
cloudinary.config({ cloud_name: cloud, api_key: key, api_secret: secret, secure: true });

try {
  const r = await cloudinary.api.ping();
  console.log(`\n✔ Cloudinary accepted your credentials (ping → ${r.status}).`);
  console.log('  If uploads still fail, the cause is stale server code — restart npm run dev.');
} catch (err) {
  const status = err?.http_code || err?.statusCode || '';
  const detail =
    typeof err?.message === 'string'
      ? err.message
      : err?.message?.error?.message || err?.name || 'request failed';
  console.error(`\n✖ Cloudinary REJECTED your credentials${status ? ` (HTTP ${status})` : ''}: ${detail}`);
  console.error(`  The API key/secret in .env do NOT belong to cloud "${cloud}".`);
  console.error('  Fix: https://console.cloudinary.com/settings/security → copy the');
  console.error('  API Key + API Secret for THIS cloud into .env, then restart npm run dev.');
  process.exitCode = 1;
}
