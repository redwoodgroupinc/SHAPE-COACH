import { test } from 'node:test';
import assert from 'node:assert/strict';

import handler, { fingerprints, normalizeFingerprint, statements, PACKAGE_NAME, UPLOAD_KEY_SHA256 } from '../api/assetlinks.js';

const PLAY_KEY = 'A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90:01:12:23:34:45:56:67:78:89:9A:AB:BC:CD:DE:EF:F0';

test('the upload key is always listed for the app', () => {
  assert.deepEqual(statements({}), [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: PACKAGE_NAME, sha256_cert_fingerprints: [UPLOAD_KEY_SHA256] },
  }]);
});

test('the Play app signing key can be added from Vercel, pasted in any common form', () => {
  assert.deepEqual(fingerprints({ PLAY_APP_SIGNING_SHA256: PLAY_KEY }), [UPLOAD_KEY_SHA256, PLAY_KEY]);
  assert.deepEqual(fingerprints({ PLAY_APP_SIGNING_SHA256: ` SHA-256: ${PLAY_KEY.toLowerCase()}\n` }), [UPLOAD_KEY_SHA256, PLAY_KEY]);
  assert.deepEqual(fingerprints({ PLAY_APP_SIGNING_SHA256: PLAY_KEY.replace(/:/g, '') }), [UPLOAD_KEY_SHA256, PLAY_KEY]);
  assert.deepEqual(fingerprints({ PLAY_APP_SIGNING_SHA256: `${PLAY_KEY}, ${UPLOAD_KEY_SHA256}` }), [UPLOAD_KEY_SHA256, PLAY_KEY], 'no duplicates');
});

test('anything that is not a SHA-256 fingerprint is ignored', () => {
  assert.equal(normalizeFingerprint('B7:1B'), null);
  assert.equal(normalizeFingerprint('zz'.repeat(32)), null);
  assert.deepEqual(fingerprints({ PLAY_APP_SIGNING_SHA256: 'not a key' }), [UPLOAD_KEY_SHA256]);
});

test('the endpoint answers with JSON that Chrome and Google can read', () => {
  const res = { headers: {}, statusCode: 0, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  handler({ method: 'GET' }, res, { env: { PLAY_APP_SIGNING_SHA256: PLAY_KEY } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body[0].target.sha256_cert_fingerprints, [UPLOAD_KEY_SHA256, PLAY_KEY]);
});
