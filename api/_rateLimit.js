// ── In-memory rate limiter ─────────────────────────────────────────
// Works within a single Vercel serverless function instance (warm).
// Limits are per client IP, per endpoint, per sliding window.

const WINDOW_MS = 60 * 1000; // 1 minute

// Separate stores per endpoint key so limits don't bleed across routes
const stores = {};

// Periodically remove expired entries to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const store of Object.values(stores)) {
    for (const [key, val] of store.entries()) {
      if (now - val.windowStart > WINDOW_MS) store.delete(key);
    }
  }
}, WINDOW_MS);

/**
 * Extract the real client IP from Vercel/proxy request headers.
 */
export function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  let ip = forwarded
    ? forwarded.split(',')[0].trim()
    : (req.headers['x-real-ip'] || req.socket?.remoteAddress || '');

  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (!ip || ip === '::1' || ip === '127.0.0.1') ip = 'localhost';
  return ip;
}

/**
 * Check rate limit for a given client IP and endpoint key.
 * @param {string} clientIP  - The requester's IP address
 * @param {string} endpoint  - A unique key per route (e.g. 'lookup', 'blacklist')
 * @param {number} max       - Max requests allowed per window
 * @returns {{ allowed: boolean, remaining: number, resetIn: number }}
 */
export function checkRateLimit(clientIP, endpoint, max) {
  if (!stores[endpoint]) stores[endpoint] = new Map();
  const store = stores[endpoint];
  const now   = Date.now();
  const record = store.get(clientIP);

  if (!record || now - record.windowStart > WINDOW_MS) {
    store.set(clientIP, { windowStart: now, count: 1 });
    return { allowed: true, remaining: max - 1, resetIn: 60 };
  }

  const resetIn = Math.ceil((record.windowStart + WINDOW_MS - now) / 1000);

  if (record.count >= max) {
    return { allowed: false, remaining: 0, resetIn };
  }

  record.count++;
  return { allowed: true, remaining: max - record.count, resetIn };
}
