// Sulekha Scraper: High-precision local service lead extraction
// Uses Sulekha's native search API (azsearch.sulekha.com) to resolve canonical category slugs
// and extracts Schema.org ItemList JSON-LD with unmasked phone numbers and physical addresses.

import { sanitizeQuery, normalizeCity, cleanPhone, slugify } from '../utils/normalizer.js';

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
export async function scrapeSulekhaUrl(targetUrl, { relay, _relayed } = {}) {
  // If running in cloud and relay is configured, route via Indian relay to bypass Azure/IIS 403 block
  const activeRelay = relay || process.env.RELAY_URL;
  if (activeRelay && !_relayed) {
    try {
      const relayParams = new URLSearchParams({
        url: targetUrl
      });
      const relayUrl = `${activeRelay.replace(/\/+$/, '')}/api/debug?${relayParams.toString()}`;
      const relayResp = await fetch(relayUrl, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
          'User-Agent': 'Vyapar-API-Gateway/1.0'
        },
        signal: AbortSignal.timeout(20000)
      });
      if (relayResp.ok) {
        const debugData = await relayResp.json();
        if (debugData.status === 200) {
          // Parse HTML returned by relay
          return parseSulekhaHtml(debugData.bodyPreview || '', targetUrl);
        }
      }
    } catch (relayErr) {
      console.warn(`[Sulekha] Relay request failed: ${relayErr.message}`);
    }
  }

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
  return parseSulekhaHtml(html, targetUrl);
}

function parseSulekhaHtml(html, targetUrl) {
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
            const locality = addr.addressLocality || '';
            const region = addr.addressRegion || '';
            const postal = addr.postalCode || '';
            const fullAddress = [locality, region, postal].filter(Boolean).join(', ');

            leads.push({
              name: item.name.trim(),
              phone: phone || rawPhone,
              whatsapp: phone.length === 10 ? phone : '',
              whatsapp_link: phone.length === 10 ? `https://wa.me/91${phone}` : '',
              email: 'N/A',
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
 * High-level Sulekha search with native taxonomy resolution, sub-category pagination, and deduplication
 */
export async function searchSulekha({ city, query, limit = 50, relay, _relayed }) {
  const normCity = normalizeCity(city);
  const cleanQ = sanitizeQuery(query, city);
  const targetLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  // 1. Resolve exact category URLs using native search API
  const categoryUrls = await resolveSulekhaCategoryUrls(normCity, cleanQ);

  const allLeads = [];
  const seenPhones = new Set();
  const seenNames = new Set();

  for (const catUrl of categoryUrls) {
    try {
      const leads = await scrapeSulekhaUrl(catUrl, { relay, _relayed });

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

  return {
    source: 'sulekha',
    city: normCity,
    query: cleanQ,
    resolved_categories: categoryUrls,
    total_results: allLeads.length,
    results: allLeads
  };
}
