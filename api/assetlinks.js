// Vercel serverless function served at /.well-known/assetlinks.json (see vercel.json).
// Digital Asset Links tell Chrome that the ShapeCoach Android app may show this site full
// screen and use Google Play Billing. Chrome only trusts apps signed with a listed key.
//
// The upload key is always listed. After the first upload, Google Play re-signs the app with its
// own app signing key: paste that key's SHA-256 fingerprint (Play Console › Test and release ›
// App integrity › App signing) into the Vercel environment variable PLAY_APP_SIGNING_SHA256 and
// redeploy. Several fingerprints can be separated by commas or spaces.

export const PACKAGE_NAME = 'net.shapecoach.app';
export const UPLOAD_KEY_SHA256 = 'B7:1B:1C:01:5D:47:F6:C7:15:56:BE:95:AD:A9:3D:82:51:39:E5:B2:0D:60:E3:07:E2:5C:E8:9E:69:C6:BF:FD';

/** "b71b1c…" or "B7:1B:…" → "B7:1B:…"; null if it isn't a SHA-256 fingerprint. */
export function normalizeFingerprint(value) {
  const hex = String(value).replace(/:/g, '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hex)) return null;
  return hex.match(/../g).join(':');
}

/** The upload key plus every valid fingerprint in PLAY_APP_SIGNING_SHA256; other words are ignored. */
export function fingerprints(env = {}) {
  const extra = String(env.PLAY_APP_SIGNING_SHA256 ?? '')
    .split(/[\s,;]+/)
    .map(normalizeFingerprint)
    .filter(Boolean);
  return [...new Set([UPLOAD_KEY_SHA256, ...extra])];
}

export function statements(env = {}) {
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: PACKAGE_NAME, sha256_cert_fingerprints: fingerprints(env) },
  }];
}

export default function handler(req, res, { env = process.env } = {}) {
  res.setHeader('cache-control', 'public, max-age=300');
  return res.status(200).json(statements(env));
}
