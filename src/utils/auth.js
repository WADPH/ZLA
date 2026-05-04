const crypto = require('crypto');

function extractPcTag(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const match = text.match(/\bPC-\d{5}\b/i);
  return match ? match[0].toUpperCase() : null;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return value;
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function parseSignatureHeader(signatureHeader) {
  if (!signatureHeader) {
    return null;
  }
  const value = String(signatureHeader).trim();
  if (!value) {
    return null;
  }

  if (value.startsWith('sha1=')) {
    return value.slice('sha1='.length).trim();
  }

  return value;
}

function verifyZammadWebhookSignature(req, secret) {
  const signatureHeader =
    req.headers['x-hub-signature'] ||
    req.headers['x-zammad-signature'] ||
    req.headers['x-signature'];

  const provided = parseSignatureHeader(signatureHeader);
  if (!provided) {
    return { ok: false, reason: 'signature header is missing' };
  }

  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  const ok = timingSafeEqualHex(provided.toLowerCase(), expected.toLowerCase());

  return ok ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}

function isBearerAuthorized(req, expectedToken) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = String(authHeader).split(' ');
  if (scheme !== 'Bearer' || !token) {
    return false;
  }
  return token === expectedToken;
}

module.exports = {
  extractPcTag,
  requireEnv,
  verifyZammadWebhookSignature,
  isBearerAuthorized
};
