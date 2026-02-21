export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let { ip } = req.query;

  if (!ip) {
    // Extract the real client IP from Vercel/proxy forwarding headers
    const forwarded = req.headers['x-forwarded-for'];
    ip = forwarded
      ? forwarded.split(',')[0].trim()
      : (req.headers['x-real-ip'] || req.socket?.remoteAddress || '');
  }

  // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:1.2.3.4 → 1.2.3.4)
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  // Fallback for local development (localhost resolves to loopback)
  if (!ip || ip === '::1' || ip === '127.0.0.1') {
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
