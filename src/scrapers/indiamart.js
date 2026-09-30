// IndiaMART Scraper: Fast mobile web extraction of verified suppliers and phone numbers
// Uses server-rendered mobile cards on m.indiamart.com with direct unmasked seller contacts.

import { sanitizeQuery, normalizeCity, cleanPhone } from '../utils/normalizer.js';

export async function scrapeIndiaMartPage({ city = '', query, page = 1 }) {
  const normCity = normalizeCity(city);
  const cleanQ = sanitizeQuery(query, city);

  const params = new URLSearchParams({
    s: cleanQ || query.trim(),
    ...(normCity && { city: normCity }),
    ...(page > 1 && { page: String(page) })
  });

  const url = `https://m.indiamart.com/isearch.php?${params.toString()}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!resp.ok) {
    if (resp.status === 404) return { source: 'indiamart', city: normCity, query: cleanQ, page, count: 0, leads: [] };
    throw new Error(`IndiaMART returned HTTP ${resp.status}`);
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
    } catch (err) {
      console.warn(`[IndiaMART] Page ${p} error: ${err.message}`);
      break;
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

