/**
 * Reverse-Engineered Justdial Scraper Engine
 * Uses Server-Side Rendered (SSR) Next.js __NEXT_DATA__ endpoints with canonical NCT resolution
 * Features Multi-Area Exhaustive Harvesting to overcome the single-category ~32 lead pagination ceiling
 * Extracts unmasked phone numbers, direct merchant emails, contact persons, ratings, addresses, and business details without a browser.
 * Supports HTTP/HTTPS/SOCKS proxies via undici ProxyAgent.
 */

import { ProxyAgent } from 'undici';
import { sanitizeQuery, normalizeCity, cleanPhone as cleanPhoneNumber, cleanEmail, slugify } from '../utils/normalizer.js';
import { getCityAreas } from '../utils/cityAreas.js';
import { getPopularCategory } from '../utils/categories.js';

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
  if (!html) return null;
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

// In-memory cache for resolved categories to avoid duplicate queries and rate limits
const categoryResolutionCache = new Map();

/**
 * Fetches category metadata and ncatid for a query slug with retry resilience and regex fallback
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

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, fetchOptions);
      if (!res.ok) {
        if (attempt === 0) { await sleep(300); continue; }
        return null;
      }

      const html = await res.text();
      const nextData = extractNextData(html);
      let ncatid = null;
      let city = citySlug;
      let search = querySlug;
      let area = '';
      let buildId = '';

      if (nextData) {
        const pp = nextData.props?.pageProps || {};
        ncatid = pp.ncatid || pp.query?.ncatid || null;
        city = pp.ct || citySlug;
        search = pp.search || querySlug;
        area = pp.resultsAreaInfo?.area || '';
        buildId = nextData.buildId || '';
      }

      // Robust regex fallback if JSON block was absent or truncated
      if (!ncatid) {
        const mNct = html.match(/\/nct-(\d+)/) || html.match(/"ncatid":\s*"?(\d+)"?/);
        if (mNct) ncatid = mNct[1];
      }

      if (ncatid) {
        const cleanNcatid = String(ncatid).replace(/^nct-/, '');
        return {
          city: city,
          search: search,
          ncatid: cleanNcatid,
          national_catid: `nct-${cleanNcatid}`,
          area: area,
          buildId: buildId
        };
      }
    } catch (err) {
      if (attempt === 0) { await sleep(300); continue; }
    }
  }
  return null;
}

/**
 * Step 1: Resolves category query to canonical search term and ncatid
 */
export async function resolveCategory(city, query, proxyUrl = null) {
  const normCity = normalizeCity(city);
  const cleanQ = sanitizeQuery(query, city);
  const citySlug = slugify(normCity);
  const cacheKey = `${citySlug}:${slugify(cleanQ || query)}`;

  if (categoryResolutionCache.has(cacheKey)) {
    return categoryResolutionCache.get(cacheKey);
  }

  // 1. Instant dictionary resolution for popular categories (0ms, 100% reliable)
  const popular = getPopularCategory(cleanQ) || getPopularCategory(query);
  if (popular) {
    const meta = {
      city: citySlug,
      search: popular.search,
      ncatid: popular.ncatid,
      national_catid: `nct-${popular.ncatid}`,
      area: '',
      buildId: ''
    };
    categoryResolutionCache.set(cacheKey, meta);
    return meta;
  }

  // 2. Relay resolution if configured
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
          categoryResolutionCache.set(cacheKey, json.data);
          return json.data;
        }
      }
    } catch (e) {
      console.warn(`[Resolve Relay Failed]: ${e.message}. Falling back.`);
    }
  }

  // 3. Native category metadata candidate probes
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
        categoryResolutionCache.set(cacheKey, meta);
        return meta;
      }
    } catch (err) {
      console.warn(`[Justdial] Candidate ${candidate} failed: ${err.message}`);
    }
  }

  // 4. DuckDuckGo search dorking fallback (as specified in guidelines)
  try {
    const dorkUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:justdial.com/${citySlug} ${cleanQ} nct-`)}`;
    const dorkResp = await fetch(dorkUrl, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Referer': 'https://www.google.com/'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (dorkResp.ok) {
      const dorkHtml = await dorkResp.text();
      const m = dorkHtml.match(/justdial\.com\/[^\/]+\/([a-zA-Z0-9\-]+)\/nct-(\d+)/);
      if (m && m[1] && m[2]) {
        const dorkMeta = {
          city: citySlug,
          search: m[1],
          ncatid: m[2],
          national_catid: `nct-${m[2]}`,
          area: '',
          buildId: ''
        };
        categoryResolutionCache.set(cacheKey, dorkMeta);
        return dorkMeta;
      }
    }
  } catch (err) {
    console.warn(`[Justdial] Search dorking fallback failed: ${err.message}`);
  }

  // Fallback: return default slug even if ncatid is null
  const fallback = {
    city: citySlug,
    search: slugify(cleanQ || query),
    ncatid: null,
    national_catid: null,
    area: '',
    buildId: ''
  };
  return fallback;
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
    redirect: 'follow',
    signal: AbortSignal.timeout(15000)
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
      listings: [],
      nextdocid: listData?.nextdocid || ''
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
    const whatsapp = whatsappExplicit || phone;
    const whatsappLink = whatsapp ? `https://wa.me/91${whatsapp}` : null;
    const ratingRaw = getCol(row, 'compRating');
    const reviewsRaw = getCol(row, 'totalReviews');
    const categoriesRaw = getCol(row, 'type');
    const weburl = getCol(row, 'weburl');
    const docid = getCol(row, 'docid') || '';

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
      docid: docid,
      url: weburl ? (weburl.startsWith('http') ? weburl : `https://www.justdial.com/${weburl}`) : (docid ? `https://www.justdial.com/${citySlug}/Biz/${docid.replace(/\./g, '-')}_BZDET` : '')
    };
  });

  return {
    total,
    listings,
    nextdocid: listData.nextdocid || ''
  };
}

/**
 * Step 3: Fetches SSR detail page for a specific docid
 * Extracts verified merchant emails, contact persons, unmasked phone numbers, and full addresses
 */
export async function fetchDocidDetail(city, docid, proxyUrl = null) {
  if (!docid) return null;
  const citySlug = slugify(city);
  const cleanDocid = String(docid).replace(/\./g, '-');
  const url = `https://www.justdial.com/${encodeURIComponent(citySlug)}/Biz/${encodeURIComponent(cleanDocid)}_BZDET`;
  const dispatcher = getDispatcher(proxyUrl);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fetchOptions = {
        headers: getHeaders(),
        redirect: 'follow',
        signal: AbortSignal.timeout(8000)
      };
      if (dispatcher) fetchOptions.dispatcher = dispatcher;

      const res = await fetch(url, fetchOptions);
      if (res.status === 403 || res.status === 429) {
        if (attempt === 0) {
          await sleep(500);
          continue;
        }
        return null;
      }
      if (!res.ok) return null;

      const html = await res.text();
      const nextData = extractNextData(html);
      if (!nextData) return null;

      const inner = nextData.props?.pageProps?.results?.results || {};
      if (!inner.name && !inner.comp_name && !inner.compName) return null;

      let phone = cleanPhoneNumber(inner.VNumber) || cleanPhoneNumber(inner.mobile) || cleanPhoneNumber(inner.phone) || cleanPhoneNumber(inner.contact);
      let whatsappNum = null;
      if (inner.msg_num) {
        try {
          const parsed = typeof inner.msg_num === 'string' ? JSON.parse(inner.msg_num) : inner.msg_num;
          const wup = parsed?.wup?.[0];
          if (wup) {
            const cleanWup = cleanPhoneNumber(wup);
            if (cleanWup) {
              whatsappNum = cleanWup;
              if (!phone) phone = cleanWup;
            }
          }
        } catch (e) {}
      }

      const rawWp = Array.isArray(inner.wpnumber) ? inner.wpnumber[0] : inner.wpnumber;
      const explicitWp = cleanPhoneNumber(rawWp);
      const whatsapp = explicitWp || whatsappNum || phone;
      const whatsappLink = whatsapp ? `https://wa.me/91${whatsapp}` : null;
      const email = cleanEmail(inner.email);
      const contactPerson = inner.contactperson ? String(inner.contactperson).trim() : null;

      let website = '';
      if (inner.website && typeof inner.website === 'string' && !inner.website.includes('justdial')) {
        const rawWeb = inner.website.split(',')[0].trim();
        if (rawWeb) website = rawWeb.startsWith('http') ? rawWeb : `https://${rawWeb}`;
      }

      const ratingRaw = inner.rating || inner.comprating;
      const reviewsRaw = inner.totalReviews || inner.totJdReviews;

      let categories = [];
      if (Array.isArray(inner.AlsoListedIn)) {
        categories = inner.AlsoListedIn.map(s => (typeof s === 'object' && s ? (s.category || s.categoryln || '') : String(s)).trim()).filter(Boolean);
      } else if (typeof inner.AlsoListedIn === 'string') {
        categories = inner.AlsoListedIn.split(',').map(s => s.trim()).filter(Boolean);
      }

      const fullAddress = inner.address || [inner.building, inner.street, inner.area, inner.city, inner.pincode].filter(Boolean).join(', ');

      return {
        name: inner.name || inner.comp_name || inner.compName || '',
        phone: phone || '',
        raw_phone: inner.VNumber || inner.mobile || '',
        whatsapp: whatsapp || '',
        whatsapp_link: whatsappLink,
        email: email,
        contact_person: contactPerson,
        source: 'justdial',
        website: website,
        rating: ratingRaw ? parseFloat(ratingRaw) : null,
        reviews: reviewsRaw ? parseInt(String(reviewsRaw).replace(/\D/g, ''), 10) : 0,
        address: fullAddress,
        area: inner.area || '',
        city: inner.city || city,
        pincode: inner.pincode ? String(inner.pincode).trim() : '',
        lat: inner.complat || inner.startlat || '',
        lon: inner.complong || inner.startlong || '',
        verified: inner.verified === 1 || inner.verified === '1' || inner.verified === true,
        paid: inner.paidstatus === 1 || inner.paidstatus === '1' || inner.paidstatus === true,
        categories: categories,
        docid: inner.docid || cleanDocid,
        url: url
      };
    } catch (err) {
      if (attempt === 0) {
        await sleep(500);
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Concurrently enrich Justdial listings with verified merchant emails and contact persons from SSR detail pages
 */
export async function enrichJustdialLeadsWithEmails(leads, { maxEnrich = 40, concurrency = 10, proxyUrl = null } = {}) {
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
        const nextData = extractNextData(html);
        if (nextData) {
          const inner = nextData.props?.pageProps?.results?.results || {};
          if (inner.email) {
            const vEmail = cleanEmail(inner.email);
            if (vEmail) lead.email = vEmail;
          }
          if (inner.contactperson && !lead.contact_person) {
            lead.contact_person = String(inner.contactperson).trim();
          }
          if (!lead.phone) {
            const p = cleanPhoneNumber(inner.VNumber) || cleanPhoneNumber(inner.mobile);
            if (p) {
              lead.phone = p;
              if (!lead.whatsapp) {
                lead.whatsapp = p;
                lead.whatsapp_link = `https://wa.me/91${p}`;
              }
            }
          }
          if (!lead.website && inner.website && !inner.website.includes('justdial')) {
            const rawWeb = inner.website.split(',')[0].trim();
            if (rawWeb) lead.website = rawWeb.startsWith('http') ? rawWeb : `https://${rawWeb}`;
          }
        } else {
          // Fast fallback regex
          const emailMatch = html.match(/"email":"([^"]+)"/);
          if (emailMatch && emailMatch[1]) {
            const validEmail = cleanEmail(emailMatch[1]);
            if (validEmail) lead.email = validEmail;
          }
          const cpMatch = html.match(/"contactperson":"([^"]+)"/);
          if (cpMatch && cpMatch[1] && !lead.contact_person) {
            lead.contact_person = cpMatch[1].trim();
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
 * High-level search function: Resolves category, expands multi-area when limit > 50 or limit=max, deduplicates, and enriches
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

  // 2. Relay delegation if configured
  if (process.env.RELAY_URL && !options._relayed && !proxy) {
    try {
      const relayParams = new URLSearchParams({
        city,
        query,
        ...(page && { page }),
        limit: isMaxLimit ? 'max' : maxLimit
      });
      const relayUrl = `${process.env.RELAY_URL.replace(/\/+$/, '')}/api/search?source=justdial&${relayParams.toString()}`;
      const relayResp = await fetch(relayUrl, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
          'User-Agent': 'Justdial-API-Gateway/1.0'
        },
        signal: AbortSignal.timeout(90000)
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

  // 3. Resolve category & ncatid
  const resolution = await resolveCategory(city, query, proxy);
  if (!resolution.ncatid) {
    throw new Error(`Could not resolve a valid category ID (ncatid) for "${query}" in "${city}".`);
  }

  const allLeads = [];
  const seenKeys = new Set();
  let totalAvailable = 0;

  // 4. Exhaustive Multi-Area Harvesting Mode when limit > 50 or limit === 'max'
  if (isMaxLimit || maxLimit > 50) {
    const areas = getCityAreas(resolution.city || city);
    const collectedDocids = new Set();
    const directLeads = [];

    // Query canonical base NCT page first
    try {
      const basePage = await fetchNctPage(resolution.city, resolution.search, resolution.ncatid, 1, proxy);
      if (basePage.total > totalAvailable) totalAvailable = basePage.total;
      for (const lead of basePage.listings) {
        const key = lead.docid || lead.phone || lead.name;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          directLeads.push(lead);
        }
      }
      if (basePage.nextdocid) {
        basePage.nextdocid.split(',').filter(Boolean).forEach(id => {
          const cleanId = id.replace(/\./g, '-');
          if (!seenKeys.has(cleanId)) collectedDocids.add(cleanId);
        });
      }
    } catch (e) {}

    // Concurrently harvest area endpoints to canvas the metropolitan area
    const areaBatchSize = 6;
    for (let i = 0; i < areas.length; i += areaBatchSize) {
      if (!isMaxLimit && collectedDocids.size >= Math.max(maxLimit * 2.5, 300)) break;
      const areaChunk = areas.slice(i, i + areaBatchSize);
      await Promise.all(areaChunk.map(async areaName => {
        try {
          const areaSlug = slugify(areaName);
          const areaUrl = `https://www.justdial.com/${encodeURIComponent(resolution.city)}/${encodeURIComponent(resolution.search)}-in-${encodeURIComponent(areaSlug)}/nct-${resolution.ncatid}`;
          const dispatcher = getDispatcher(proxy);
          const fetchOptions = {
            headers: getHeaders(),
            redirect: 'follow',
            signal: AbortSignal.timeout(10000)
          };
          if (dispatcher) fetchOptions.dispatcher = dispatcher;

          const res = await fetch(areaUrl, fetchOptions);
          if (!res.ok) return;

          const html = await res.text();
          const nextData = extractNextData(html);
          if (!nextData) return;

          const ld = nextData.props?.pageProps?.listData;
          if (!ld) return;

          const numTotal = parseInt(ld.totalNumberofResults, 10) || 0;
          if (numTotal > totalAvailable) totalAvailable = numTotal;

          // Parse direct listings if present in results.data
          if (ld.results?.data && ld.results?.columns) {
            const { data: rows, columns } = ld.results;
            const colIndex = {};
            columns.forEach((c, idx) => colIndex[c] = idx);
            const getCol = (row, name) => {
              const idx = colIndex[name];
              return idx !== undefined && row[idx] !== undefined ? row[idx] : null;
            };

            for (const row of rows) {
              const rawDocid = getCol(row, 'docid');
              const cleanDocid = rawDocid ? String(rawDocid).replace(/\./g, '-') : '';
              const name = getCol(row, 'name');
              const rawPhone = getCol(row, 'VNumber');
              const phone = cleanPhoneNumber(rawPhone);
              const key = cleanDocid || (phone ? `p:${phone}` : null) || (name ? `n:${slugify(name)}` : null);
              if (key && !seenKeys.has(key)) {
                seenKeys.add(key);
                if (cleanDocid) seenKeys.add(cleanDocid);
                const rawWp = getCol(row, 'wpnumber');
                const whatsapp = cleanPhoneNumber(Array.isArray(rawWp) ? rawWp[0] : rawWp) || phone;
                const categoriesRaw = getCol(row, 'type');
                directLeads.push({
                  name: name || '',
                  phone: phone,
                  raw_phone: rawPhone || '',
                  whatsapp: whatsapp,
                  whatsapp_link: whatsapp ? `https://wa.me/91${whatsapp}` : null,
                  email: null,
                  contact_person: null,
                  source: 'justdial',
                  website: '',
                  rating: getCol(row, 'compRating') ? parseFloat(getCol(row, 'compRating')) : null,
                  reviews: getCol(row, 'totalReviews') ? parseInt(String(getCol(row, 'totalReviews')).replace(/\D/g, ''), 10) : 0,
                  address: getCol(row, 'NewAddress') || '',
                  area: getCol(row, 'area') || areaName,
                  city: getCol(row, 'city') || resolution.city,
                  pincode: getCol(row, 'pincode') || '',
                  lat: getCol(row, 'lat') || '',
                  lon: getCol(row, 'lon') || '',
                  verified: getCol(row, 'verified') === 1 || getCol(row, 'verified') === '1',
                  paid: getCol(row, 'paidStatus') === 1 || getCol(row, 'paidStatus') === '1',
                  categories: categoriesRaw ? categoriesRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
                  docid: cleanDocid || rawDocid || '',
                  url: `https://www.justdial.com/${slugify(resolution.city)}/Biz/${cleanDocid || rawDocid}_BZDET`
                });
              }
            }
          }

          // Capture all nextdocid entries
          if (ld.nextdocid) {
            const ids = String(ld.nextdocid).split(',').filter(Boolean);
            ids.forEach(id => {
              const cleanId = id.replace(/\./g, '-');
              if (!seenKeys.has(cleanId) && !collectedDocids.has(cleanId)) {
                collectedDocids.add(cleanId);
              }
            });
          }
        } catch (e) {}
      }));
      await sleep(100);
    }

    // Add all direct leads harvested from area search pages
    allLeads.push(...directLeads);

    // Filter only unvisited docids
    const unvisitedDocids = Array.from(collectedDocids).filter(id => !seenKeys.has(id));
    const targetLeadCount = isMaxLimit ? (allLeads.length + unvisitedDocids.length) : Math.min(maxLimit, allLeads.length + unvisitedDocids.length);

    // Concurrently fetch detail pages with concurrency 12 and 80ms pacing until target count is satisfied
    const detailConcurrency = 12;
    for (let i = 0; i < unvisitedDocids.length; i += detailConcurrency) {
      if (allLeads.length >= targetLeadCount) break;
      const chunk = unvisitedDocids.slice(i, i + detailConcurrency);
      const detailedResults = await Promise.all(chunk.map(id => fetchDocidDetail(resolution.city, id, proxy)));
      for (const lead of detailedResults) {
        if (lead) {
          const cleanDocid = (lead.docid || '').replace(/\./g, '-');
          const key = cleanDocid || (lead.phone ? `p:${lead.phone}` : null) || (lead.name ? `n:${slugify(lead.name)}` : null);
          if (key && !seenKeys.has(key)) {
            seenKeys.add(key);
            if (cleanDocid) seenKeys.add(cleanDocid);
            allLeads.push(lead);
            if (allLeads.length >= targetLeadCount) break;
          }
        }
      }
      await sleep(80);
    }

    // Also enrich direct leads with merchant emails if requested
    const shouldEnrichDirect = enrich_emails !== false;
    if (shouldEnrichDirect && allLeads.length > 0) {
      const leadsWithoutEmail = allLeads.filter(l => !l.email).slice(0, isMaxLimit ? 60 : 30);
      if (leadsWithoutEmail.length > 0) {
        await enrichJustdialLeadsWithEmails(leadsWithoutEmail, { maxEnrich: leadsWithoutEmail.length, concurrency: 15, proxyUrl: proxy });
      }
    }

    return {
      query: {
        city: resolution.city,
        search: resolution.search,
        ncatid: resolution.ncatid,
        mode: 'multi_area_exhaustive',
        areas_canvassed: areas.length,
        limit: isMaxLimit ? 'max' : maxLimit
      },
      meta: {
        total_available: Math.max(totalAvailable, allLeads.length),
        count: allLeads.length,
        with_phone_count: allLeads.filter(l => !!l.phone).length,
        with_whatsapp_count: allLeads.filter(l => !!l.whatsapp).length,
        with_email_count: allLeads.filter(l => !!l.email).length,
        with_contact_person_count: allLeads.filter(l => !!l.contact_person).length,
        execution_time_ms: Date.now() - startTime
      },
      results: allLeads
    };
  }

  // 5. Standard Fast Path for limit <= 50 and single page queries
  const startPage = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
  const totalPagesToFetch = pages ? Math.min(Math.max(1, parseInt(pages, 10) || 1), 10) : Math.min(Math.ceil(maxLimit / 10), 5);
  const endPage = startPage + totalPagesToFetch - 1;
  let pagesFetched = 0;

  for (let p = startPage; p <= endPage; p++) {
    try {
      const pageData = await fetchNctPage(resolution.city, resolution.search, resolution.ncatid, p, proxy);
      pagesFetched++;
      if (pageData.total > totalAvailable) {
        totalAvailable = pageData.total;
      }

      if (pageData.listings.length === 0) break;

      for (const lead of pageData.listings) {
        const dedupKey = lead.docid || lead.phone || lead.name;
        if (!seenKeys.has(dedupKey)) {
          seenKeys.add(dedupKey);
          allLeads.push(lead);
          if (allLeads.length >= maxLimit) break;
        }
      }

      if (allLeads.length >= maxLimit) break;
      if (p < endPage && delayMs > 0) {
        await sleep(delayMs);
      }
    } catch (err) {
      if (allLeads.length === 0) throw err;
      break;
    }
  }

  // Enrich top leads with direct merchant emails & contact person from detail SSR
  const shouldEnrich = enrich_emails !== false && (has_email || enrich_emails === true || maxLimit <= 30);
  if (shouldEnrich && allLeads.length > 0) {
    const enrichLimit = Math.min(allLeads.length, 30);
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
      mode: 'standard',
      limit: maxLimit
    },
    meta: {
      total_available: totalAvailable,
      count: allLeads.length,
      with_phone_count: allLeads.filter(l => !!l.phone).length,
      with_whatsapp_count: allLeads.filter(l => !!l.whatsapp).length,
      with_email_count: allLeads.filter(l => !!l.email).length,
      with_contact_person_count: allLeads.filter(l => !!l.contact_person).length,
      execution_time_ms: Date.now() - startTime
    },
    results: allLeads
  };
}
