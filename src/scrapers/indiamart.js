// IndiaMART Scraper: Fast mobile web extraction of verified suppliers and phone numbers
// Uses server-rendered mobile cards on m.indiamart.com with direct unmasked seller contacts.

import { sanitizeQuery, normalizeCity, cleanPhone } from '../utils/normalizer.js';
import { getCityAreas } from '../utils/cityAreas.js';
import { DynamicLocalityQueue } from '../utils/dynamicLocality.js';

const IM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.113 Mobile Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-IN,en-GB;q=0.9,en;q=0.8,hi;q=0.7',
  'Referer': 'https://m.indiamart.com/',
  'Sec-Ch-Ua': '"Chromium";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?1',
  'Sec-Ch-Ua-Platform': '"Android"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Upgrade-Insecure-Requests': '1'
};

let cachedCookie = 'lang=0; r=g;';

export async function scrapeIndiaMartPage({ city = '', query, page = 1 }, retries = 3) {
  const normCity = normalizeCity(city);
  const cleanQ = sanitizeQuery(query, city);

  const params = new URLSearchParams({
    s: cleanQ || query.trim(),
    ...(normCity && { city: normCity }),
    ...(page > 1 && { page: String(page) })
  });

  const url = `https://m.indiamart.com/isearch.php?${params.toString()}`;

  const headers = {
    ...IM_HEADERS,
    ...(cachedCookie && { Cookie: cachedCookie })
  };

  let resp;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      
      // Update session cookies if returned
      const setCookie = resp.headers.get('set-cookie');
      if (setCookie) {
        const parts = setCookie.split(';')[0];
        if (parts && !cachedCookie.includes(parts)) {
          cachedCookie = `${cachedCookie} ${parts};`;
        }
      }

      if (resp.status === 429) {
        if (attempt < retries) {
          const backoffMs = (Math.pow(2, attempt) * 1000) + Math.floor(Math.random() * 500);
          console.warn(`[IndiaMART] 429 rate limit hit, backing off ${backoffMs}ms (attempt ${attempt + 1}/${retries})...`);
          await new Promise(r => setTimeout(r, backoffMs));
          continue;
        }
        throw new Error('IndiaMART returned HTTP 429 (rate limit exceeded after retries)');
      }

      if (!resp.ok) {
        if (resp.status === 404) return { source: 'indiamart', city: normCity, query: cleanQ, page, count: 0, leads: [] };
        throw new Error(`IndiaMART returned HTTP ${resp.status}`);
      }
      break;
    } catch (err) {
      if (attempt < retries && (err.name === 'TimeoutError' || err.message.includes('429'))) {
        const backoffMs = (Math.pow(2, attempt) * 1000) + Math.floor(Math.random() * 500);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      throw err;
    }
  }

  const html = await resp.text();
  const leads = [];

  const articleRegex = /<article[^>]*class=["']ncui-tagcard-article["'][\s\S]*?<\/article>/gi;
  let artMatch;

  while ((artMatch = articleRegex.exec(html)) !== null) {
    const cardHtml = artMatch[0];

    // Phone from data-contact attribute
    const contactMatch = cardHtml.match(/data-contact=["']([^\s"']+)["']/i);
    const rawContact = contactMatch ? contactMatch[1] : '';
    const phone = cleanPhone(rawContact);

    // Company Name
    const compAttrMatch = cardHtml.match(/data-compname=["']([^"']+)["']/i);
    const compClassMatch = cardHtml.match(/class=["']ncui-company-name["'][^>]*>([\s\S]*?)<\/a>/i);
    const rawName = compAttrMatch ? compAttrMatch[1] : (compClassMatch ? compClassMatch[1] : '');
    const name = rawName.replace(/<[^>]+>/g, '').trim();

    if (!name && !phone) continue;

    // Location / Seller Meta (e.g. "Panvel • 8 yrs")
    const metaMatch = cardHtml.match(/class=["']ncui-seller-meta["'][^>]*>([\s\S]*?)<\/div>/i);
    const meta = metaMatch ? metaMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';

    // Product Title
    const prodMatch = cardHtml.match(/class=["']ncui-product-title["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const product = prodMatch ? prodMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // Price
    const priceMatch = cardHtml.match(/class=["']ncui-price-value["'][^>]*>([\s\S]*?)<\/span>/i);
    const price = priceMatch ? priceMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // Verified / TrustSeal
    const isVerified = cardHtml.includes('TrustSEAL') || cardHtml.includes('trust_bdg') || cardHtml.includes('newTS-trust-bdg');

    // Product URL
    const urlMatch = cardHtml.match(/href=["'](\/proddetail\/[^\s"']+)["']/i);
    const prodUrl = urlMatch ? `https://m.indiamart.com${urlMatch[1]}` : url;

    leads.push({
      name: name || 'Verified IndiaMART Supplier',
      phone: phone || rawContact,
      whatsapp: phone.length === 10 ? phone : '',
      whatsapp_link: phone.length === 10 ? `https://wa.me/91${phone}` : '',
      email: null,
      source: 'indiamart',
      rating: null,
      reviews: 0,
      address: [meta, normCity].filter(Boolean).join(', '),
      area: meta.split('•')[0]?.trim() || '',
      city: normCity || 'India',
      pincode: '',
      website: '',
      verified: isVerified,
      categories: [cleanQ || query, product].filter(Boolean),
      price: price || null,
      url: prodUrl
    });
  }

  return {
    source: 'indiamart',
    city: normCity,
    query: cleanQ,
    page,
    count: leads.length,
    leads
  };
}

export async function searchIndiaMart({ city = '', query, page, pages, limit = 50 }) {
  const startTime = Date.now();
  const normCity = normalizeCity(city);
  const cleanQ = sanitizeQuery(query, city);

  const isMaxLimit = typeof limit === 'string' && (limit.toLowerCase() === 'max' || limit.toLowerCase() === 'all');
  const targetLimit = isMaxLimit ? 1000 : Math.min(Math.max(parseInt(limit, 10) || 50, 1), 1000);

  if (page !== undefined && page !== null && page !== '') {
    const singlePage = Math.max(parseInt(page, 10) || 1, 1);
    const { leads } = await scrapeIndiaMartPage({ city: normCity, query: cleanQ, page: singlePage });
    return {
      source: 'indiamart',
      city: normCity,
      query: cleanQ,
      page: singlePage,
      total_results: leads.length,
      execution_time_ms: Date.now() - startTime,
      results: leads.slice(0, targetLimit)
    };
  }

  // 10 leads per page
  const neededPages = pages
    ? Math.min(Math.max(parseInt(pages, 10) || 1, 1), 50)
    : (isMaxLimit ? 30 : Math.min(Math.ceil(targetLimit / 10), 30));

  const allLeads = [];
  const seenPhones = new Set();
  const seenNames = new Set();
  let pagesFetched = 0;

  for (let p = 1; p <= neededPages; p++) {
    try {
      pagesFetched++;
      const { leads } = await scrapeIndiaMartPage({ city: normCity, query: cleanQ, page: p });
      if (leads.length === 0) break;

      let newLeadsInPage = 0;
      for (const lead of leads) {
        const phoneKey = lead.phone ? lead.phone.toLowerCase() : null;
        const nameKey = lead.name.toLowerCase();

        // Prevent repeated sponsored items from bloating the list
        if (phoneKey && seenPhones.has(phoneKey)) continue;
        if (nameKey && seenNames.has(nameKey)) continue;

        if (phoneKey) seenPhones.add(phoneKey);
        if (nameKey) seenNames.add(nameKey);

        allLeads.push(lead);
        newLeadsInPage++;
        if (allLeads.length >= targetLimit) break;
      }

      // If page had zero new leads (only duplicate sponsored ones), stop pagination
      if (newLeadsInPage === 0 || allLeads.length >= targetLimit) break;

      // Small jittered pause between pagination pages (150-300ms)
      if (p < neededPages) {
        await new Promise(r => setTimeout(r, 150 + Math.floor(Math.random() * 150)));
      }
    } catch (err) {
      console.warn(`[IndiaMART] Page ${p} error: ${err.message}`);
      break;
    }
  }

  // Multi-area locality expansion with dynamic snowball discovery & fallback
  if (isMaxLimit || allLeads.length < targetLimit) {
    const localityQueue = new DynamicLocalityQueue({
      city: normCity,
      fallbackProvider: getCityAreas,
      maxDynamicAreas: isMaxLimit ? 80 : 30
    });
    // Dynamically harvest localities from page 1..N leads
    localityQueue.queueFromListings(allLeads);

    const maxAreas = isMaxLimit ? 40 : Math.min(Math.ceil((targetLimit - allLeads.length) / 5), 25);
    const areaBatchSize = 2;
    let areasExplored = 0;

    while (localityQueue.hasMore() && areasExplored < maxAreas) {
      if (!isMaxLimit && allLeads.length >= targetLimit) break;
      const chunk = [];
      for (let b = 0; b < areaBatchSize && localityQueue.hasMore() && (areasExplored + chunk.length) < maxAreas; b++) {
        const nextA = localityQueue.nextArea();
        if (nextA) chunk.push(nextA);
      }
      if (chunk.length === 0) break;
      areasExplored += chunk.length;

      const chunkResults = await Promise.all(chunk.map(async areaName => {
        try {
          const areaQuery = `${cleanQ} in ${areaName}`;
          const { leads } = await scrapeIndiaMartPage({ city: normCity, query: areaQuery, page: 1 });
          leads.forEach(l => {
            if (!l.area) l.area = areaName;
          });
          return leads;
        } catch {
          return [];
        }
      }));

      for (const leads of chunkResults) {
        localityQueue.queueFromListings(leads); // Snowball discovery from area results
        for (const lead of leads) {
          const phoneKey = lead.phone ? lead.phone.toLowerCase() : null;
          const nameKey = lead.name.toLowerCase();

          if (phoneKey && seenPhones.has(phoneKey)) continue;
          if (nameKey && seenNames.has(nameKey)) continue;

          if (phoneKey) seenPhones.add(phoneKey);
          if (nameKey) seenNames.add(nameKey);

          allLeads.push(lead);
          if (!isMaxLimit && allLeads.length >= targetLimit) break;
        }
        if (!isMaxLimit && allLeads.length >= targetLimit) break;
      }

      if (areasExplored < maxAreas) {
        await new Promise(r => setTimeout(r, 200 + Math.floor(Math.random() * 200)));
      }
    }
  }

  return {
    source: 'indiamart',
    city: normCity,
    query: cleanQ,
    total_pages_fetched: pagesFetched,
    total_results: allLeads.length,
    execution_time_ms: Date.now() - startTime,
    results: allLeads
  };
}

