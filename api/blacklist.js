import { promises as dns } from 'dns';
import { getClientIP, checkRateLimit } from './_rateLimit.js';

// 20 blacklist checks per minute per IP
const RATE_LIMIT = 20;

const LISTS = [
  { name: 'SpamCop',    host: 'bl.spamcop.net',         desc: 'Known spam sources' },
  { name: 'SORBS',      host: 'dnsbl.sorbs.net',         desc: 'Spam & open proxies' },
  { name: 'Barracuda',  host: 'b.barracudacentral.org',  desc: 'Email spam' },
  { name: 'UCEPROTECT', host: 'dnsbl-1.uceprotect.net',  desc: 'Spam sources' },
];

// Reverse an IPv4 address for DNSBL query (1.2.3.4 → 4.3.2.1)
function reverseIPv4(ip) {
  return ip.split('.').reverse().join('.');
}

// Expand and reverse an IPv6 address for DNSBL query
function reverseIPv6(ip) {
  let groups;
  if (ip.includes('::')) {
    const [left, right] = ip.split('::');
    const leftParts  = left  ? left.split(':')  : [];
    const rightParts = right ? right.split(':') : [];
    const missing = 8 - leftParts.length - rightParts.length;
    groups = [...leftParts, ...Array(missing).fill('0'), ...rightParts];
  } else {
    groups = ip.split(':');
  }
  return groups
    .map(g => g.padStart(4, '0'))
    .join('')
    .split('')
    .reverse()
    .join('.');
}

async function checkList(reversedIP, list) {
  const query = `${reversedIP}.${list.host}`;
  // Race the DNS lookup against a 5s timeout
  const lookup = dns.resolve4(query);
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), 5000)
  );
  try {
    await Promise.race([lookup, timeout]);
    return { name: list.name, desc: list.desc, listed: true, error: false };
  } catch (err) {
    const clean = err.code === 'ENOTFOUND' || err.code === 'ENODATA';
    return { name: list.name, desc: list.desc, listed: false, error: !clean };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const clientIP = getClientIP(req);
  const rate = checkRateLimit(clientIP, 'blacklist', RATE_LIMIT);
  res.setHeader('X-RateLimit-Limit',     RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', rate.remaining);
  res.setHeader('X-RateLimit-Reset',     rate.resetIn);
  if (!rate.allowed) {
    return res.status(429).json({
      error: `Too many requests. Please wait ${rate.resetIn} seconds before trying again.`,
    });
  }

  const { ip } = req.query;
  if (!ip) {
    return res.status(400).json({ error: 'IP address is required' });
  }

  const isIPv6 = ip.includes(':');
  let reversedIP;
  try {
    reversedIP = isIPv6 ? reverseIPv6(ip) : reverseIPv4(ip);
  } catch {
    return res.status(400).json({ error: 'Invalid IP address format' });
  }

  const settled = await Promise.allSettled(
    LISTS.map(list => checkList(reversedIP, list))
  );

  const checks = settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { name: LISTS[i].name, desc: LISTS[i].desc, listed: false, error: true }
  );

  const listedCount = checks.filter(c => c.listed).length;

  return res.status(200).json({ checks, listedCount, total: LISTS.length });
}
