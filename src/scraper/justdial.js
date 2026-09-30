/**
 * Reverse-Engineered Justdial Scraper Engine
 * Uses Server-Side Rendered (SSR) Next.js __NEXT_DATA__ endpoints with canonical NCT resolution
 * Extracts unmasked phone numbers, ratings, addresses, and business details without a browser.
 * Supports HTTP/HTTPS/SOCKS proxies via undici ProxyAgent.
 */

import { ProxyAgent } from 'undici';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getHeaders() {
  return {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };
}

function slugify(text) {
  return text
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Global cache for ProxyAgent instances to reuse connections
const proxyAgents = new Map();

function getDispatcher(proxyUrl) {
  const targetProxy = proxyUrl || process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  if (!targetProxy) return undefined;

  if (!proxyAgents.has(targetProxy)) {
    proxyAgents.set(targetProxy, new ProxyAgent(targetProxy));
  }
  return proxyAgents.get(targetProxy);
}

/**
 * Extracts JSON data from Next.js __NEXT_DATA__ script block
 */
function extractNextData(html) {
  const marker = '<script id="__NEXT_DATA__"';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const start2 = html.indexOf('>', start) + 1;
  const end = html.indexOf('</script>', start2);
  if (end === -1) return null;
  try {
    return JSON.parse(html.slice(start2, end));
  } catch (err) {
    return null;
  }
}

/**
 * Clean phone number: converts 09845239283 to 9845239283 or validates 10 digits
 */
function cleanPhoneNumber(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.substring(1);
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.substring(2);
  }
  if (digits.length === 10) {
    return digits;
  }
  return digits.length > 0 ? digits : null;
}

/**
 * Step 1: Resolves category query to canonical search term and ncatid
 */
export async function resolveCategory(city, query, proxyUrl = null) {
  const citySlug = slugify(city);
  const querySlug = slugify(query);

  if (process.env.RELAY_URL && !proxyUrl) {
    try {
      const relayUrl = `${process.env.RELAY_URL.replace(/\/+$/, '')}/api/resolve?city=${encodeURIComponent(city)}&query=${encodeURIComponent(query)}`;
      const relayResp = await fetch(relayUrl, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
        signal: AbortSignal.timeout(15000)
      });
      if (relayResp.ok) {
        const json = await relayResp.json();
        if (json.data && json.data.ncatid) {
          return json.data;
        }
      }
    } catch (e) {
      console.warn(`[Resolve Relay Failed]: ${e.message}. Falling back.`);
    }
  }

  const url = `https://www.justdial.com/${encodeURIComponent(citySlug)}/${encodeURIComponent(querySlug)}`;
  const dispatcher = getDispatcher(proxyUrl);

  const fetchOptions = {
    headers: getHeaders(),
    redirect: 'follow'
  };
  if (dispatcher) {
    fetchOptions.dispatcher = dispatcher;
  }

  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    throw new Error(`Failed to resolve category at ${url} (HTTP ${res.status}). If running in a datacenter (like AWS/Render US), configure a residential or Indian proxy via PROXY_URL.`);
  }

  const html = await res.text();
  const nextData = extractNextData(html);
  if (!nextData) {
    throw new Error(`Failed to parse Next.js metadata from ${url}`);
  }

  const pp = nextData.props?.pageProps || {};
  return {
    city: pp.ct || citySlug,
    search: pp.search || querySlug,
    ncatid: pp.ncatid || null,
    national_catid: pp.query?.ncatid || null,
    area: pp.resultsAreaInfo?.area || '',
    buildId: nextData.buildId || ''
  };
}

/**
 * Step 2: Fetches single page of listings via canonical NCT endpoint
 */
export async function fetchNctPage(city, search, ncatid, page = 1, proxyUrl = null) {
  const citySlug = slugify(city);
  const searchSlug = slugify(search);
  const url = `https://www.justdial.com/${encodeURIComponent(citySlug)}/${encodeURIComponent(searchSlug)}/nct-${ncatid}?page=${page}`;
  const dispatcher = getDispatcher(proxyUrl);

  const fetchOptions = {
    headers: getHeaders(),
    redirect: 'follow'
  };
  if (dispatcher) {
    fetchOptions.dispatcher = dispatcher;
  }

  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    throw new Error(`Failed to fetch NCT page ${page} at ${url} (HTTP ${res.status})`);
  }

  const html = await res.text();
  const nextData = extractNextData(html);
  if (!nextData) {
    throw new Error(`Failed to extract data for page ${page} at ${url}`);
  }

  const listData = nextData.props?.pageProps?.listData;
  if (!listData?.results?.data || !listData?.results?.columns) {
    return {
      total: 0,
      listings: []
    };
  }

  const { data: rows, columns } = listData.results;
  const total = parseInt(listData.totalNumberofResults, 10) || 0;

  const colIndex = {};
  columns.forEach((col, idx) => {
    colIndex[col] = idx;
  });

  const getCol = (row, name) => {
    const idx = colIndex[name];
    return idx !== undefined && row[idx] !== undefined ? row[idx] : null;
  };

  const listings = rows.map(row => {
    const rawPhone = getCol(row, 'VNumber');
    const phone = cleanPhoneNumber(rawPhone);
    const rawWp = getCol(row, 'wpnumber');
    const whatsapp = cleanPhoneNumber(Array.isArray(rawWp) ? rawWp[0] : rawWp);
    const ratingRaw = getCol(row, 'compRating');
    const reviewsRaw = getCol(row, 'totalReviews');
    const categoriesRaw = getCol(row, 'type');
    const weburl = getCol(row, 'weburl');

    return {
      name: getCol(row, 'name') || '',
      phone: phone,
      raw_phone: rawPhone || '',
      whatsapp: whatsapp,
      rating: ratingRaw ? parseFloat(ratingRaw) : null,
      reviews: reviewsRaw ? parseInt(String(reviewsRaw).replace(/\D/g, ''), 10) : 0,
      address: getCol(row, 'NewAddress') || '',
      area: getCol(row, 'area') || '',
      city: getCol(row, 'city') || city,
      pincode: getCol(row, 'pincode') || '',
      lat: getCol(row, 'lat') || '',
      lon: getCol(row, 'lon') || '',
      verified: getCol(row, 'verified') === 1 || getCol(row, 'verified') === '1',
      paid: getCol(row, 'paidStatus') === 1 || getCol(row, 'paidStatus') === '1',
      categories: categoriesRaw ? categoriesRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
      docid: getCol(row, 'docid') || '',
      url: weburl ? (weburl.startsWith('http') ? weburl : `https://www.justdial.com/${weburl}`) : ''
    };
  });

  return {
    total,
    listings
  };
}

/**
 * High-level search function: Resolves category, paginates, deduplicates, and limits
 */
export async function searchJustdial(options = {}) {
  const {
    city,
    query,
    pages = 3,
    limit = 50,
    delayMs = 400,
    proxy = null
  } = options;

  if (!city || !query) {
    throw new Error('Both "city" and "query" parameters are required.');
  }

  const maxPages = Math.min(Math.max(1, parseInt(pages, 10) || 1), 10);
  const maxLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);

  if (process.env.RELAY_URL && !options._relayed && !proxy) {
    try {
      const relayParams = new URLSearchParams({
        city,
        query,
        ...(pages && { pages }),
        ...(limit && { limit })
      });
      const relayUrl = `${process.env.RELAY_URL.replace(/\/+$/, '')}/api/search?${relayParams.toString()}`;
      const relayResp = await fetch(relayUrl, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
          'User-Agent': 'Justdial-API-Gateway/1.0'
        },
        signal: AbortSignal.timeout(45000)
      });
      if (relayResp.ok) {
        const json = await relayResp.json();
        if (json.success && json.results) {
          return {
            query: json.query,
            meta: json.meta,
            results: json.results
          };
        }
      }
    } catch (e) {
      console.warn(`[Search Relay Failed]: ${e.message}. Falling back to direct scraping.`);
    }
  }

  // 1. Resolve category & ncatid
  const resolution = await resolveCategory(city, query, proxy);
  if (!resolution.ncatid) {
    throw new Error(`Could not resolve a valid category ID (ncatid) for "${query}" in "${city}".`);
  }

  const allLeads = [];
  const seenIds = new Set();
  let totalAvailable = 0;

  // 2. Fetch pages
  for (let p = 1; p <= maxPages; p++) {
    try {
      const pageData = await fetchNctPage(resolution.city, resolution.search, resolution.ncatid, p, proxy);
      if (pageData.total > totalAvailable) {
        totalAvailable = pageData.total;
      }

      if (pageData.listings.length === 0) {
        break;
      }

      for (const lead of pageData.listings) {
        const dedupKey = lead.docid || lead.phone || lead.name;
        if (!seenIds.has(dedupKey)) {
          seenIds.add(dedupKey);
          allLeads.push(lead);
          if (allLeads.length >= maxLimit) break;
        }
      }

      if (allLeads.length >= maxLimit) break;
      if (p < maxPages && delayMs > 0) {
        await sleep(delayMs);
      }
    } catch (err) {
      if (allLeads.length === 0) {
        throw err;
      }
      break;
    }
  }

  return {
    query: {
      city: resolution.city,
      search: resolution.search,
      ncatid: resolution.ncatid,
      pages_requested: maxPages,
      limit: maxLimit
    },
    meta: {
      total_available: totalAvailable,
      count: allLeads.length,
      with_phone_count: allLeads.filter(l => l.phone).length,
      with_whatsapp_count: allLeads.filter(l => l.whatsapp).length
    },
    results: allLeads
  };
}
