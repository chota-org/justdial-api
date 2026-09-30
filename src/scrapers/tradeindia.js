// TradeIndia Scraper: High-density B2B suppliers, manufacturers and exporters
// Extracts Next.js SSR state (__NEXT_DATA__) with 28 listings per page.

export async function scrapeTradeIndiaPage({ query, city = '', page = 1 }) {
  const params = new URLSearchParams({
    keyword: query.trim(),
    ...(city && { city: city.trim() }),
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
    throw new Error(`TradeIndia returned HTTP ${resp.status}`);
  }

  const html = await resp.text();
  const leads = [];

  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!nextDataMatch) {
    return { source: 'tradeindia', city, query, page, count: 0, leads: [] };
  }

  try {
    const json = JSON.parse(nextDataMatch[1]);
    const listingData = json.props?.pageProps?.serverData?.searchListingData?.listing_data || [];

    for (const item of listingData) {
      const name = (item.co_name || item.initial_co_name || '').trim();
      if (!name) continue;

      const itemCity = item.city || city || '';
      const state = item.state || '';
      const country = item.country_name || 'India';
      const address = [itemCity, state, country].filter(Boolean).join(', ');

      const domain = item.catalog_private_domain || '';
      const website = domain ? (domain.startsWith('http') ? domain : `https://${domain}`) : '';
      const profileUrl = item.profile_url ? `https://www.tradeindia.com${item.profile_url}` : url;

      leads.push({
        name,
        phone: item.mobile || item.phone || '',
        whatsapp: '',
        whatsapp_link: '',
        email: 'N/A',
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
        categories: [query, item.product_name].filter(Boolean),
        url: profileUrl
      });
    }
  } catch (err) {
    console.warn(`[TradeIndia] Error parsing NEXT_DATA: ${err.message}`);
  }

  return {
    source: 'tradeindia',
    city,
    query,
    page,
    count: leads.length,
    leads
  };
}

export async function searchTradeIndia({ city = '', query, page, pages, limit = 50 }) {
  const targetLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  if (page !== undefined && page !== null && page !== '') {
    const singlePage = Math.max(parseInt(page, 10) || 1, 1);
    const { leads } = await scrapeTradeIndiaPage({ city, query, page: singlePage });
    return {
      source: 'tradeindia',
      city,
      query,
      page: singlePage,
      total_results: leads.length,
      results: leads.slice(0, targetLimit)
    };
  }

  // 28 leads per page
  const neededPages = pages
    ? Math.min(Math.max(parseInt(pages, 10) || 1, 1), 10)
    : Math.min(Math.ceil(targetLimit / 28), 10);

  const allLeads = [];
  const seenNames = new Set();

  for (let p = 1; p <= neededPages; p++) {
    try {
      const { leads } = await scrapeTradeIndiaPage({ city, query, page: p });
      if (leads.length === 0) break;

      for (const lead of leads) {
        const nameKey = lead.name.toLowerCase();
        if (seenNames.has(nameKey)) continue;
        seenNames.add(nameKey);

        allLeads.push(lead);
        if (allLeads.length >= targetLimit) break;
      }

      if (allLeads.length >= targetLimit) break;
    } catch (err) {
      console.warn(`[TradeIndia] Page ${p} error: ${err.message}`);
      break;
    }
  }

  return {
    source: 'tradeindia',
    city,
    query,
    total_pages_fetched: neededPages,
    total_results: allLeads.length,
    results: allLeads
  };
}
