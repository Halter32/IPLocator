import { getClientIP, checkRateLimit } from './_rateLimit.js';

// 20 lookups per minute per IP
const RATE_LIMIT = 20;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const clientIP = getClientIP(req);
  const rate = checkRateLimit(clientIP, 'lookup', RATE_LIMIT);
  res.setHeader('X-RateLimit-Limit',     RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', rate.remaining);
  res.setHeader('X-RateLimit-Reset',     rate.resetIn);
  if (!rate.allowed) {
    return res.status(429).json({
      error: `Too many requests. Please wait ${rate.resetIn} seconds before trying again.`,
    });
  }

  let { ip } = req.query;

  if (!ip) {
    // Use the already-extracted client IP for auto-detect
    ip = clientIP;
  }

  // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:1.2.3.4 → 1.2.3.4)
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  // Fallback for local development (localhost resolves to loopback)
  if (!ip || ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {
    ip = '8.8.8.8';
  }

  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'IPLocator/1.0',
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Geolocation service unavailable. Try again later.' });
    }

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.reason || 'Invalid or reserved IP address.' });
    }

    return res.status(200).json({
      ip: data.ip,
      city: data.city || 'Unknown',
      region: data.region || 'Unknown',
      country: data.country_name || 'Unknown',
      country_code: data.country_code || '',
      isp: data.org || 'Unknown',
      timezone: data.timezone || 'Unknown',
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
