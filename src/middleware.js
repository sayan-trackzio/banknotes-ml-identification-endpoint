import crypto from 'crypto';

const HMAC_ENABLED = process.env.HMAC_ENABLED === 'true';  // feature flag
const HMAC_SHARED_SECRET = process.env.HMAC_SHARED_SECRET; // must match EC2

export function verifyHmacSignature(req, res, next) {
  if (!HMAC_ENABLED) {
    // Skip verification for local/dev
    return next();
  }

  const { e: expires, s: sig } = req.query;
  if (!expires || !sig) {
    return res.status(403).json({ error: true, reason: 'Invalid or missing signature' });
  }

  const expiresNum = Number(expires);
  if (!Number.isFinite(expiresNum)) {
    return res.status(403).json({ error: true, reason: 'Invalid or missing signature' });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > expiresNum) {
    return res.status(403).json({ error: true, reason: 'Signature Expired' });
  }

  // Reconstruct payload exactly as on EC2
  const payload = `${expires}`;
  const expectedSig = crypto.createHmac('sha256', HMAC_SHARED_SECRET)
                            .update(payload)
                            .digest('hex');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return res.status(403).json({ error: true, reason: 'Invalid or missing signature' });
    }
  } catch {
    // timingSafeEqual throws if buffer lengths mismatch
    return res.status(403).json({ error: true, reason: 'Invalid or missing signature' });
  }

  // Verified!
  next();
}
