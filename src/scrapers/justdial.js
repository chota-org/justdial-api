/**
 * Reverse-Engineered Justdial Scraper Engine
 * Uses Server-Side Rendered (SSR) Next.js __NEXT_DATA__ endpoints with canonical NCT resolution
 * Extracts unmasked phone numbers, ratings, addresses, and business details without a browser.
 * Supports HTTP/HTTPS/SOCKS proxies via undici ProxyAgent.
 */

import { ProxyAgent } from 'undici';
import { sanitizeQuery, normalizeCity, cleanPhone as cleanPhoneNumber, cleanEmail, slugify } from '../utils/normalizer.js';

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
async function fetchCategoryMetadata(citySlug, querySlug, proxyUrl = null) {
  const url = `https://www.justdial.com/${encodeURIComponent(citySlug)}/${encodeURIComponent(querySlug)}`;
  const dispatcher = getDispatcher(proxyUrl);

  const fetchOptions = {
    headers: getHeaders(),
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
  };
  if (dispatcher) {
    fetchOptions.dispatcher = dispatcher;
  }

  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    return null;
  }

  const html = await res.text();
  const nextData = extractNextData(html);
  if (!nextData) return null;

  const pp = nextData.props?.pageProps || {};
  return {
    city: pp.ct || citySlug,
    search: pp.search || querySlug,
    ncatid: pp.ncatid || pp.query?.ncatid || null,
    national_catid: pp.query?.ncatid || (pp.ncatid ? `nct-${pp.ncatid}` : null),
    area: pp.resultsAreaInfo?.area || '',
    buildId: nextData.buildId || ''
  };
}

/**
 * Step 1: Resolves category query to canonical search term and ncatid
 */
export async function resolveCategory(city, query, proxyUrl = null) {
  const normCity = normalizeCity(city);
  const cleanQ = sanitizeQuery(query, city);
  const citySlug = slugify(normCity);

  if (process.env.RELAY_URL && !proxyUrl) {
    try {
      const relayUrl = `${process.env.RELAY_URL.replace(/\/+$/, '')}/api/resolve?city=${encodeURIComponent(normCity)}&query=${encodeURIComponent(cleanQ)}`;
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

  // Candidate slugs to test in order of relevance
  const candidates = [
    slugify(cleanQ),
    slugify(query),
    `${slugify(cleanQ)}s`,
    `${slugify(cleanQ)}-dealers`,
    `${slugify(cleanQ)}-services`
  ];

  for (const candidate of [...new Set(candidates)]) {
    if (!candidate) continue;
    try {
      const meta = await fetchCategoryMetadata(citySlug, candidate, proxyUrl);
      if (meta && meta.ncatid) {
        return meta;
      }
    } catch (err) {
      console.warn(`[Justdial] Candidate ${candidate} failed: ${err.message}`);
    }
  }

  // Fallback: return default slug even if ncatid is null
  return {
    city: citySlug,
    search: slugify(cleanQ || query),
    ncatid: null,
    national_catid: null,
    area: '',
    buildId: ''
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
    const whatsappExplicit = cleanPhoneNumber(Array.isArray(rawWp) ? rawWp[0] : rawWp);
    // In India, direct business mobile numbers are almost universally active on WhatsApp
    const whatsapp = whatsappExplicit || phone;
    const whatsappLink = whatsapp ? `https://wa.me/91${whatsapp}` : null;
    const ratingRaw = getCol(row, 'compRating');
    const reviewsRaw = getCol(row, 'totalReviews');
    const categoriesRaw = getCol(row, 'type');
    const weburl = getCol(row, 'weburl');

    return {
      name: getCol(row, 'name') || '',
      phone: phone,
      raw_phone: rawPhone || '',
      whatsapp: whatsapp,
      whatsapp_link: whatsappLink,
      email: null,
      contact_person: null,
      source: 'justdial',
      website: '',
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
 * Concurrently enrich Justdial listings with verified merchant emails and contact persons from SSR detail pages
 */
export async function enrichJustdialLeadsWithEmails(leads, { maxEnrich = 20, concurrency = 5, proxyUrl = null } = {}) {
  const targetLeads = leads.slice(0, maxEnrich);
  const dispatcher = getDispatcher(proxyUrl);

  for (let i = 0; i < targetLeads.length; i += concurrency) {
    const chunk = targetLeads.slice(i, i + concurrency);
    await Promise.all(chunk.map(async lead => {
      if (!lead.url || lead.email) return;
      try {
        const fetchOptions = {
          headers: getHeaders(),
          redirect: 'follow',
          signal: AbortSignal.timeout(6000)
        };
        if (dispatcher) fetchOptions.dispatcher = dispatcher;

        const res = await fetch(lead.url, fetchOptions);
        if (!res.ok) return;

        const html = await res.text();
        const emailMatch = html.match(/"email":"([^"]+)"/);
        if (emailMatch && emailMatch[1]) {
          const validEmail = cleanEmail(emailMatch[1]);
          if (validEmail) lead.email = validEmail;
        }

        const cpMatch = html.match(/"contactperson":"([^"]+)"/);
        if (cpMatch && cpMatch[1]) {
          lead.contact_person = cpMatch[1].trim();
        }

        const webMatch = html.match(/"website":"([^"]+)"/);
        if (webMatch && webMatch[1] && !lead.website) {
          const rawWeb = webMatch[1].split(',')[0].trim();
          if (rawWeb && !rawWeb.includes('justdial')) {
            lead.website = rawWeb.startsWith('http') ? rawWeb : `https://${rawWeb}`;
          }
        }
      } catch (err) {
        // Non-blocking detail enrichment failure
      }
    }));
  }

  return leads;
}

/**
 * High-level search function: Resolves category, paginates, deduplicates, and limits
 */
export async function searchJustdial(options = {}) {
  const startTime = Date.now();
  const {
    city,
    query,
    page = null,
    pages = null,
    limit = null,
    delayMs = 200,
    proxy = null,
    enrich_emails = true,
    has_email = false
  } = options;

  if (!city || !query) {
    throw new Error('Both "city" and "query" parameters are required.');
  }

  // 1. Determine requested lead limit (supports limit=max or 1..1000)
  const isMaxLimit = typeof limit === 'string' && (limit.toLowerCase() === 'max' || limit.toLowerCase() === 'all');
  const maxLimit = isMaxLimit ? 1000 : (limit ? Math.min(Math.max(1, parseInt(limit, 10) || 50), 1000) : 50);

  // 2. Determine starting page (default: 1)
  const startPage = page ? Math.max(1, parseInt(page, 10) || 1) : 1;

  // 3. Determine how many pages to iterate
  let totalPagesToFetch;
  if (pages) {
    totalPagesToFetch = Math.min(Math.max(1, parseInt(pages, 10) || 1), 50);
  } else if (isMaxLimit) {
    totalPagesToFetch = 30; // Up to 300 leads across 30 NCT pages
  } else if (limit) {
    totalPagesToFetch = Math.min(Math.ceil(maxLimit / 10), 30);
  } else {
    totalPagesToFetch = 3;
  }

  const endPage = startPage + totalPagesToFetch - 1;

  if (process.env.RELAY_URL && !options._relayed && !proxy) {
    try {
      const relayParams = new URLSearchParams({
        city,
        query,
        ...(page && { page }),
        pages: totalPagesToFetch,
        limit: isMaxLimit ? 'max' : maxLimit
      });
      const relayUrl = `${process.env.RELAY_URL.replace(/\/+$/, '')}/api/search?${relayParams.toString()}`;
      const relayResp = await fetch(relayUrl, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
          'User-Agent': 'Justdial-API-Gateway/1.0'
        },
        signal: AbortSignal.timeout(60000)
      });
      if (relayResp.ok) {
        const json = await relayResp.json();
        if (json.success && json.results) {
          return {
            query: json.query,
            meta: {
              ...json.meta,
              execution_time_ms: Date.now() - startTime
            },
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
  let pagesFetched = 0;

  // 2. Fetch pages starting from startPage up to endPage
  for (let p = startPage; p <= endPage; p++) {
    try {
      const pageData = await fetchNctPage(resolution.city, resolution.search, resolution.ncatid, p, proxy);
      pagesFetched++;
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
      if (p < endPage && delayMs > 0) {
        await sleep(delayMs);
      }
    } catch (err) {
      if (allLeads.length === 0) {
        throw err;
      }
      break;
    }
  }

  // 3. Enrich top leads with direct merchant emails & contact person from detail SSR
  const shouldEnrich = enrich_emails !== false && (has_email || enrich_emails === true || maxLimit <= 30 || isMaxLimit);
  if (shouldEnrich && allLeads.length > 0) {
    const enrichLimit = isMaxLimit ? 25 : Math.min(allLeads.length, 30);
    await enrichJustdialLeadsWithEmails(allLeads, { maxEnrich: enrichLimit, proxyUrl: proxy });
  }

  return {
    query: {
      city: resolution.city,
      search: resolution.search,
      ncatid: resolution.ncatid,
      start_page: startPage,
      end_page: startPage + pagesFetched - 1,
      pages_fetched: pagesFetched,
      limit: isMaxLimit ? 'max' : maxLimit
    },
    meta: {
      total_available: totalAvailable,
      count: allLeads.length,
      with_phone_count: allLeads.filter(l => !!l.phone).length,
      with_whatsapp_count: allLeads.filter(l => !!l.whatsapp).length,
      with_email_count: allLeads.filter(l => !!l.email).length,
      execution_time_ms: Date.now() - startTime
    },
    results: allLeads
  };
}

