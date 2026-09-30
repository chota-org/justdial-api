// Grotal Scraper: High-precision local business lead extraction with unmasked phone numbers
// Uses Grotal's native AutoSuggest API (SearchAutoSuggest.ashx) to resolve canonical category taxonomy
// and extracts Schema.org LocalBusiness JSON-LD with unmasked phone numbers and physical addresses.

import { sanitizeQuery, normalizeCity, cleanPhone, cleanEmail, slugify } from '../utils/normalizer.js';

const CITY_ID_CACHE = {
  'delhi': '44', 'new delhi': '44', 'ncr': '44', 'noida': '44', 'gurgaon': '44', 'faridabad': '44', 'ghaziabad': '44',
  'mumbai': '45', 'navi mumbai': '45', 'thane': '45',
  'kolkata': '46',
  'chennai': '47',
  'bangalore': '67', 'bengaluru': '67',
  'hyderabad': '70', 'secunderabad': '70',
  'ahmedabad': '71',
  'pune': '66',
  'chandigarh': '64', 'mohali': '64', 'panchkula': '64',
  'jaipur': '193',
  'lucknow': '86',
  'kanpur': '87',
  'nagpur': '104',
  'indore': '97',
  'bhopal': '96',
  'patna': '138',
  'vadodara': '72', 'baroda': '72',
  'surat': '73',
  'ludhiana': '49',
  'agra': '85',
  'nashik': '106',
  'amritsar': '50',
  'varanasi': '89',
  'meerut': '90',
  'rajkot': '74',
  'jabalpur': '98',
  'coimbatore': '165',
  'madurai': '166',
  'visakhapatnam': '124', 'vizag': '124',
  'vijayawada': '125',
  'gwalior': '99',
  'jodhpur': '194',
  'raipur': '225',
  'kota': '195',
  'guwahati': '219',
  'dehradun': '92',
  'ranchi': '141',
  'jamshedpur': '142',
  'mysore': '149',
  'kochi': '155', 'cochin': '155',
  'trivandrum': '156', 'thiruvananthapuram': '156',
  'mangalore': '150',
  'bhubaneswar': '187',
  'cuttack': '188',
  'aurangabad': '107',
  'solapur': '108',
  'jalandhar': '51',
  'tiruchirappalli': '167', 'trichy': '167',
  'salem': '168',
  'aligarh': '143',
  'bareilly': '91',
  'moradabad': '93',
  'gorakhpur': '94',
  'bikaner': '196',
  'amravati': '201',
  'udaipur': '197',
  'ajmer': '193'
};

async function getCityId(city) {
  const normalized = normalizeCity(city);
  if (CITY_ID_CACHE[normalized]) {
    return CITY_ID_CACHE[normalized];
  }

  try {
    const res = await fetch('https://www.grotal.com/Handler/ajax.ashx?CountryId=1', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });
    const xml = await res.text();
    const regex = /<City name="([^"]+)" id="([^"]+)"/gi;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      CITY_ID_CACHE[match[1].toLowerCase()] = match[2];
    }
    return CITY_ID_CACHE[normalized] || '0';
  } catch (err) {
    console.warn(`[Grotal] Failed to dynamically fetch city id: ${err.message}`);
    return '0';
  }
}

/**
 * Native Search: Queries Grotal's AutoSuggest API to find exact canonical category slugs
 */
export async function resolveGrotalSlugs(query, cityId) {
  try {
    const url = `https://www.grotal.com/js/SearchAutoSuggest.ashx?txt=${encodeURIComponent(query)}&city=${cityId}&area=0&Country=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const text = await res.text();
      const suggestions = [...text.matchAll(/GetTxt\("([^"]+)"/g)].map(m => m[1]);
      if (suggestions.length > 0) {
        return suggestions;
      }
    }
  } catch (err) {
    console.warn(`[Grotal] AutoSuggest resolve error: ${err.message}`);
  }

  // Fallback to formatted slug
  const fallback = query.trim().replace(/[\s_]+/g, '-');
  return [fallback];
}

/**
 * Scrapes a single page for a given slug on Grotal
 */
export async function scrapeGrotalPage({ formattedCity, cityId, slug, page = 1 }) {
  const url = cityId !== '0'
    ? `https://www.grotal.com/${formattedCity}/${slug}-C${cityId}A0P${page}A0/`
    : `https://www.grotal.com/India/${slug}-0A0P${page}/`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!resp.ok) {
    return []; // Return empty on non-200 / 404
  }

  const html = await resp.text();
  // Check if Grotal returned an internal ASP.NET FileNotFound
  if (html.includes('FileNotFound.aspx') || html.includes('The resource cannot be found')) {
    return [];
  }

  const leads = [];
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;

  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(scriptMatch[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];

      for (const item of items) {
        if (item['@type'] === 'LocalBusiness' && item.name) {
          const rawPhone = item.telephone || '';
          const phone = cleanPhone(rawPhone);
          const addr = item.address || {};
          const street = addr.streetAddress || '';
          const locality = addr.addressLocality || formattedCity;
          const region = addr.addressRegion || '';
          const postal = addr.postalCode || '';
          const fullAddress = [street, locality, region, postal].filter(Boolean).join(', ');

          leads.push({
            name: item.name.trim(),
            phone: phone || rawPhone,
            whatsapp: phone.length === 10 ? phone : '',
            whatsapp_link: phone.length === 10 ? `https://wa.me/91${phone}` : '',
            email: cleanEmail(item.email) || null,
            source: 'grotal',
            rating: null,
            reviews: 0,
            address: fullAddress,
            area: street,
            city: locality,
            pincode: postal,
            website: '',
            verified: true,
            categories: [slug.replace(/-/g, ' ')],
            url: item.url || url
          });
        }
      }
    } catch {
      // Ignore JSON parse errors in non-target scripts
    }
  }

  return leads;
}

/**
 * High-level search: Resolves canonical taxonomy via native search, paginates, and handles edge cases
 */
export async function searchGrotal({ city, query, page, pages, limit = 50 }) {
  const startTime = Date.now();
  const normCity = normalizeCity(city);
  const cleanQ = sanitizeQuery(query, city);
  const cityId = await getCityId(normCity);
  const formattedCity = normCity.charAt(0).toUpperCase() + normCity.slice(1).toLowerCase();

  const isMaxLimit = typeof limit === 'string' && (limit.toLowerCase() === 'max' || limit.toLowerCase() === 'all');
  const targetLimit = isMaxLimit ? 1000 : Math.min(Math.max(parseInt(limit, 10) || 50, 1), 1000);

  // 1. Resolve canonical slugs using Grotal's native AutoSuggest API
  const slugs = await resolveGrotalSlugs(cleanQ, cityId);
  const primarySlug = slugs[0];

  // Specific single page requested
  if (page !== undefined && page !== null && page !== '') {
    const singlePage = Math.max(parseInt(page, 10) || 1, 1);
    const leads = await scrapeGrotalPage({ formattedCity, cityId, slug: primarySlug, page: singlePage });
    return {
      source: 'grotal',
      city: normCity,
      query: cleanQ,
      resolved_slug: primarySlug,
      page: singlePage,
      total_results: leads.length,
      execution_time_ms: Date.now() - startTime,
      results: leads.slice(0, targetLimit)
    };
  }

  // Auto-pagination: 20 leads per page
  const maxPagesToFetch = pages
    ? Math.min(Math.max(parseInt(pages, 10) || 1, 1), 50)
    : (isMaxLimit ? 25 : Math.min(Math.ceil(targetLimit / 20), 25));

  const allLeads = [];
  const seenPhones = new Set();
  const seenNames = new Set();
  let pagesFetched = 0;

  for (let p = 1; p <= maxPagesToFetch; p++) {
    try {
      pagesFetched++;
      const leads = await scrapeGrotalPage({ formattedCity, cityId, slug: primarySlug, page: p });
      if (leads.length === 0) break; // Reached end of category

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
      console.warn(`[Grotal] Page ${p} error: ${err.message}`);
      break;
    }
  }

  // If primary slug yielded fewer leads than requested and other subcategories exist, fetch from next subcategory
  if (allLeads.length < targetLimit && slugs.length > 1) {
    for (let i = 1; i < Math.min(slugs.length, 3); i++) {
      const altSlug = slugs[i];
      try {
        const leads = await scrapeGrotalPage({ formattedCity, cityId, slug: altSlug, page: 1 });
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
        console.warn(`[Grotal] Alt slug error: ${err.message}`);
      }
    }
  }

  return {
    source: 'grotal',
    city: normCity,
    query: cleanQ,
    resolved_slug: primarySlug,
    total_pages_fetched: pagesFetched,
    total_results: allLeads.length,
    execution_time_ms: Date.now() - startTime,
    results: allLeads
  };
}

