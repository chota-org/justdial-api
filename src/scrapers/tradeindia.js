// TradeIndia Scraper: High-density B2B suppliers, manufacturers and exporters
// Extracts Next.js SSR state (__NEXT_DATA__) with 28 listings per page.

import { sanitizeQuery, normalizeCity, cleanPhone, cleanEmail } from '../utils/normalizer.js';
import { getCityAreas } from '../utils/cityAreas.js';
import { DynamicLocalityQueue } from '../utils/dynamicLocality.js';

export async function scrapeTradeIndiaPage({ query, city = '', page = 1 }) {
  const normCity = normalizeCity(city);
  const cleanQ = sanitizeQuery(query, city);

  const params = new URLSearchParams({
    keyword: cleanQ || query.trim(),
    ...(normCity && { city: normCity }),
    ...(page > 1 && { page: String(page) })
  });

  const url = `https://www.tradeindia.com/search.html?${params.toString()}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!resp.ok) {
    if (resp.status === 404) return { source: 'tradeindia', city: normCity, query: cleanQ, page, count: 0, leads: [] };
    throw new Error(`TradeIndia returned HTTP ${resp.status}`);
  }

  const html = await resp.text();
  const leads = [];

  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!nextDataMatch) {
    return { source: 'tradeindia', city: normCity, query: cleanQ, page, count: 0, leads: [] };
  }

  try {
    const json = JSON.parse(nextDataMatch[1]);
    const listingData = json.props?.pageProps?.serverData?.searchListingData?.listing_data || [];

    for (const item of listingData) {
      const name = (item.co_name || item.initial_co_name || '').trim();
      if (!name) continue;

      const itemCity = item.city || normCity || '';
      const state = item.state || '';
      const country = item.country_name || 'India';
      const address = [itemCity, state, country].filter(Boolean).join(', ');

      const domain = item.catalog_private_domain || '';
      const website = domain ? (domain.startsWith('http') ? domain : `https://${domain}`) : '';
      const profileUrl = item.profile_url ? `https://www.tradeindia.com${item.profile_url}` : url;

      const rawPhone = item.display_original_mobile || item.default_mobile || item.phone_no || item.mobile || item.phone || '';
      const phone = cleanPhone(rawPhone);
      const isMobile = /^[6-9]\d{9}$/.test(phone);
      const whatsapp = isMobile ? phone : '';
      const whatsapp_link = whatsapp ? `https://wa.me/91${whatsapp}` : '';

      const rawEmail = item.email || item.company_email || item.user_email || '';
      const email = cleanEmail(rawEmail);

      leads.push({
        name,
        phone,
        whatsapp,
        whatsapp_link,
        email,
        source: 'tradeindia',
        rating: item.rating ? parseFloat(item.rating) : null,
        reviews: null,
        address,
        area: '',
        city: itemCity,
        pincode: '',
        website,
        verified: !!(item.has_trust_stamp || item.platinum_seller || item.super_seller || item.ifpaid),
        business_type: item.business_type || '',
        member_since_years: item.member_since || null,
        categories: [cleanQ || query, item.product_name].filter(Boolean),
        url: profileUrl
      });
    }
  } catch (err) {
    console.warn(`[TradeIndia] Error parsing NEXT_DATA: ${err.message}`);
  }

  return {
    source: 'tradeindia',
    city: normCity,
    query: cleanQ,
    page,
    count: leads.length,
    leads
  };
}

export async function searchTradeIndia({ city = '', query, page, pages, limit = 50 }) {
  const startTime = Date.now();
  const normCity = normalizeCity(city);
  const cleanQ = sanitizeQuery(query, city);

  const isMaxLimit = typeof limit === 'string' && (limit.toLowerCase() === 'max' || limit.toLowerCase() === 'all');
  const targetLimit = isMaxLimit ? 1000 : Math.min(Math.max(parseInt(limit, 10) || 50, 1), 1000);

  if (page !== undefined && page !== null && page !== '') {
    const singlePage = Math.max(parseInt(page, 10) || 1, 1);
    const { leads } = await scrapeTradeIndiaPage({ city: normCity, query: cleanQ, page: singlePage });
    return {
      source: 'tradeindia',
      city: normCity,
      query: cleanQ,
      page: singlePage,
      total_results: leads.length,
      execution_time_ms: Date.now() - startTime,
      results: leads.slice(0, targetLimit)
    };
  }

  // 28 leads per page
  const neededPages = pages
    ? Math.min(Math.max(parseInt(pages, 10) || 1, 1), 50)
    : (isMaxLimit ? 30 : Math.min(Math.ceil(targetLimit / 28), 30));

  const allLeads = [];
  const seenNames = new Set();
  let pagesFetched = 0;

  for (let p = 1; p <= neededPages; p++) {
    try {
      pagesFetched++;
      const { leads } = await scrapeTradeIndiaPage({ city: normCity, query: cleanQ, page: p });
      if (leads.length === 0) break;

      let newLeadsInPage = 0;
      for (const lead of leads) {
        const nameKey = lead.name.toLowerCase();
        if (seenNames.has(nameKey)) continue;
        seenNames.add(nameKey);

        allLeads.push(lead);
        newLeadsInPage++;
        if (allLeads.length >= targetLimit) break;
      }

      if (newLeadsInPage === 0 || allLeads.length >= targetLimit) break;
    } catch (err) {
      console.warn(`[TradeIndia] Page ${p} error: ${err.message}`);
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

    const maxAreas = isMaxLimit ? 35 : Math.min(Math.ceil((targetLimit - allLeads.length) / 10), 20);
    const areaBatchSize = 4;
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
          const areaQuery = `${cleanQ} ${areaName}`;
          const { leads } = await scrapeTradeIndiaPage({ city: normCity, query: areaQuery, page: 1 });
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
          const nameKey = lead.name.toLowerCase();
          if (seenNames.has(nameKey)) continue;
          seenNames.add(nameKey);

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

  return {
    source: 'tradeindia',
    city: normCity,
    query: cleanQ,
    total_pages_fetched: pagesFetched,
    total_results: allLeads.length,
    execution_time_ms: Date.now() - startTime,
    results: allLeads
  };
}

