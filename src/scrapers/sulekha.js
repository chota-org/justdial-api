// Sulekha Scraper: High-precision local service lead extraction
// Uses Sulekha's native search API (azsearch.sulekha.com) to resolve canonical category slugs
// and extracts Schema.org ItemList JSON-LD with unmasked phone numbers and physical addresses.

import { sanitizeQuery, normalizeCity, cleanPhone, cleanEmail, slugify } from '../utils/normalizer.js';
import { getCityAreas } from '../utils/cityAreas.js';
import { DynamicLocalityQueue } from '../utils/dynamicLocality.js';

/**
 * Native Search: Queries Sulekha's search service to find exact canonical category URLs
 */
export async function resolveSulekhaCategoryUrls(city, query) {
  const normCity = normalizeCity(city);
  const cleanQ = sanitizeQuery(query, city);

  try {
    const searchUrl = `https://azsearch.sulekha.com/api/search/home-common-search-v2?cityName=${encodeURIComponent(normCity)}&query=${encodeURIComponent(cleanQ)}&wt=json`;
    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (resp.ok) {
      const data = await resp.json();
      const urls = (data.result || [])
        .map(r => r.url)
        .filter(u => typeof u === 'string' && u.startsWith('http'));

      if (urls.length > 0) {
        return [...new Set(urls)];
      }
    }
  } catch (err) {
    console.warn(`[Sulekha] Native search resolve error: ${err.message}`);
  }

  // Fallback: Construct standard category slug
  const fallbackCat = slugify(cleanQ || query);
  const fallbackCity = slugify(normCity);
  return [`https://www.sulekha.com/${fallbackCat}/${fallbackCity}`];
}

/**
 * Extracts leads from a specific Sulekha category page
 */
export async function scrapeSulekhaUrl(targetUrl, fallbackArea = '') {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  const resp = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(15000) });
  if (!resp.ok) {
    if (resp.status === 404) {
      return []; // Return clean empty array on 404
    }
    throw new Error(`Sulekha returned HTTP ${resp.status}`);
  }

  const html = await resp.text();
  return parseSulekhaHtml(html, targetUrl, fallbackArea);
}

function parseSulekhaHtml(html, targetUrl, fallbackArea = '') {
  const leads = [];
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;

  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    try {
      const json = JSON.parse(scriptMatch[1].trim());
      const graph = json['@graph'] || (Array.isArray(json) ? json : [json]);

      for (const node of graph) {
        if (node['@type'] === 'ItemList' && Array.isArray(node.itemListElement)) {
          for (const itemWrapper of node.itemListElement) {
            const item = itemWrapper.item || itemWrapper;
            if (!item || !item.name) continue;

            const rawPhone = item.telephone || '';
            const phone = cleanPhone(rawPhone);
            const addr = item.address || {};
            const locality = addr.addressLocality || fallbackArea;
            const region = addr.addressRegion || '';
            const postal = addr.postalCode || '';
            const fullAddress = [locality, region, postal].filter(Boolean).join(', ');

            leads.push({
              name: item.name.trim(),
              phone: phone || rawPhone,
              whatsapp: phone.length === 10 ? phone : '',
              whatsapp_link: phone.length === 10 ? `https://wa.me/91${phone}` : '',
              email: cleanEmail(item.email) || null,
              source: 'sulekha',
              rating: null,
              reviews: 0,
              address: fullAddress,
              area: locality,
              city: region,
              pincode: postal,
              website: '',
              verified: true,
              categories: [item.name],
              description: item.description || '',
              url: item.url || targetUrl
            });
          }
        }
      }
    } catch {
      // Ignore JSON parse errors in non-target scripts
    }
  }

  return leads;
}

/**
 * Concurrently enrich Sulekha profile leads with verified merchant mailto emails and phones
 */
export async function enrichSulekhaLeads(leads, { maxEnrich = 15, concurrency = 5 } = {}) {
  const targetLeads = leads.slice(0, maxEnrich);
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  for (let i = 0; i < targetLeads.length; i += concurrency) {
    const chunk = targetLeads.slice(i, i + concurrency);
    await Promise.all(chunk.map(async lead => {
      if (!lead.url || (!lead.url.includes('/profile/') && !lead.url.includes('contact-address'))) return;
      try {
        const res = await fetch(lead.url, { headers, signal: AbortSignal.timeout(6000) });
        if (!res.ok) return;
        const html = await res.text();

        const mailtoMatch = html.match(/href=["']mailto:([^"'?>]+)["']/i);
        if (mailtoMatch && mailtoMatch[1] && !lead.email) {
          const email = cleanEmail(mailtoMatch[1]);
          if (email) lead.email = email;
        }

        // If lead had no phone, check profile JSON-LD telephone
        if (!lead.phone) {
          const telMatch = html.match(/"telephone":"([^"]+)"/);
          if (telMatch && telMatch[1]) {
            const p = cleanPhone(telMatch[1]);
            if (p && p.length === 10) {
              lead.phone = p;
              lead.whatsapp = p;
              lead.whatsapp_link = `https://wa.me/91${p}`;
            }
          }
        }
      } catch {
        // Non-blocking enrichment failure
      }
    }));
  }

  return leads;
}

/**
 * High-level Sulekha search with native taxonomy resolution, sub-category pagination, and deduplication
 */
export async function searchSulekha(options = {}) {
  const startTime = Date.now();
  const {
    city,
    query,
    limit = 50,
    relay,
    _relayed,
    enrich_emails = true,
    has_email = false
  } = options;

  const normCity = normalizeCity(city);
  const cleanQ = sanitizeQuery(query, city);

  const isMaxLimit = typeof limit === 'string' && (limit.toLowerCase() === 'max' || limit.toLowerCase() === 'all');
  const targetLimit = isMaxLimit ? 1000 : Math.min(Math.max(parseInt(limit, 10) || 50, 1), 1000);

  // If running in cloud and relay is configured, delegate search to Indian residential relay
  const activeRelay = relay || process.env.RELAY_URL;
  if (activeRelay && !_relayed) {
    try {
      const relayParams = new URLSearchParams({
        city: normCity,
        query: cleanQ,
        limit: isMaxLimit ? 'max' : targetLimit
      });
      const relayUrl = `${activeRelay.replace(/\/+$/, '')}/api/sulekha/search?${relayParams.toString()}`;
      const relayResp = await fetch(relayUrl, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
          'User-Agent': 'Vyapar-API-Gateway/1.0'
        },
        signal: AbortSignal.timeout(35000)
      });
      if (relayResp.ok) {
        const json = await relayResp.json();
        if (json.success && Array.isArray(json.results)) {
          return {
            ...json,
            execution_time_ms: Date.now() - startTime
          };
        }
      }
    } catch (relayErr) {
      console.warn(`[Sulekha] Relay search failed: ${relayErr.message}. Falling back to direct.`);
    }
  }

  // 1. Resolve exact category URLs using native search API
  const categoryUrls = await resolveSulekhaCategoryUrls(normCity, cleanQ);

  const allLeads = [];
  const seenPhones = new Set();
  const seenNames = new Set();

  for (const catUrl of categoryUrls) {
    try {
      const leads = await scrapeSulekhaUrl(catUrl);

      for (const lead of leads) {
        const phoneKey = lead.phone ? lead.phone.toLowerCase() : null;
        const nameKey = lead.name.toLowerCase();

        if (phoneKey && seenPhones.has(phoneKey)) continue;
        if (nameKey && seenNames.has(nameKey)) continue;

        if (phoneKey) seenPhones.add(phoneKey);
        if (nameKey) seenNames.add(nameKey);

        allLeads.push(lead);
        if (allLeads.length >= targetLimit) break;
      }

      if (allLeads.length >= targetLimit) break;
    } catch (err) {
      console.warn(`[Sulekha] Error scraping ${catUrl}: ${err.message}`);
    }
  }

  // 2. Exhaustive Multi-Area Locality Expansion with dynamic snowball discovery & fallback
  if ((isMaxLimit || allLeads.length < targetLimit) && categoryUrls.length > 0) {
    let catSlug = '';
    try {
      const parsed = new URL(categoryUrls[0]);
      catSlug = parsed.pathname.split('/').filter(Boolean)[0] || '';
    } catch {
      catSlug = slugify(cleanQ || query);
    }
    if (!catSlug) catSlug = slugify(cleanQ || query);

    const localityQueue = new DynamicLocalityQueue({
      city: normCity,
      fallbackProvider: getCityAreas,
      maxDynamicAreas: isMaxLimit ? 80 : 35
    });
    // Dynamically harvest localities from page 1..N leads
    localityQueue.queueFromListings(allLeads);

    const areaBatchSize = 5;
    const maxAreas = isMaxLimit ? 45 : Math.min(Math.ceil((targetLimit - allLeads.length) / 8), 30);
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
        const areaSlug = slugify(areaName);
        const areaUrl = `https://www.sulekha.com/${catSlug}/${areaSlug}-${slugify(normCity)}`;
        try {
          return await scrapeSulekhaUrl(areaUrl, areaName);
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
        await new Promise(r => setTimeout(r, 80));
      }
    }
  }

  // Enrich top leads with mailto emails from merchant profiles
  const shouldEnrich = enrich_emails !== false && (has_email || enrich_emails === true || targetLimit <= 30 || isMaxLimit);
  if (shouldEnrich && allLeads.length > 0) {
    const enrichLimit = isMaxLimit ? 20 : Math.min(allLeads.length, 20);
    await enrichSulekhaLeads(allLeads, { maxEnrich: enrichLimit });
  }

  return {
    source: 'sulekha',
    city: normCity,
    query: cleanQ,
    resolved_categories: categoryUrls,
    total_results: allLeads.length,
    execution_time_ms: Date.now() - startTime,
    results: allLeads
  };
}

