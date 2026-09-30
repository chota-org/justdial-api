// Grotal Scraper: High-speed local business lead extraction with unmasked phone numbers
// Uses schema.org LocalBusiness JSON-LD embedded on Grotal search pages.

const CITY_ID_CACHE = {
  'delhi': '44', 'new delhi': '44', 'noida': '44', 'gurgaon': '44', 'faridabad': '44', 'ghaziabad': '44',
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
  const normalized = city.trim().toLowerCase();
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

function cleanPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export async function scrapeGrotalPage({ city, query, page = 1 }) {
  const cityId = await getCityId(city);
  const formattedCity = city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
  const slug = query.trim().replace(/[\s_]+/g, '-');

  // URL pattern: https://www.grotal.com/{City}/{Query}-C{cityId}A0P{page}A0/
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
    throw new Error(`Grotal returned HTTP ${resp.status}`);
  }

  const html = await resp.text();
  const leads = [];

  // Parse schema.org JSON-LD
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
          const locality = addr.addressLocality || city;
          const region = addr.addressRegion || '';
          const postal = addr.postalCode || '';
          const fullAddress = [street, locality, region, postal].filter(Boolean).join(', ');

          leads.push({
            name: item.name.trim(),
            phone: phone || rawPhone,
            whatsapp: phone.length === 10 ? phone : '',
            whatsapp_link: phone.length === 10 ? `https://wa.me/91${phone}` : '',
            email: 'N/A',
            source: 'grotal',
            rating: null,
            reviews: null,
            address: fullAddress,
            area: street,
            city: locality,
            pincode: postal,
            website: '',
            verified: true,
            categories: [query],
            url: item.url || url
          });
        }
      }
    } catch {
      // Ignore JSON parse errors in non-target script tags
    }
  }

  return {
    source: 'grotal',
    city,
    query,
    page,
    count: leads.length,
    leads
  };
}

export async function searchGrotal({ city, query, page, pages, limit = 50 }) {
  const targetLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  // If a specific single page is requested
  if (page !== undefined && page !== null && page !== '') {
    const singlePage = Math.max(parseInt(page, 10) || 1, 1);
    const { leads } = await scrapeGrotalPage({ city, query, page: singlePage });
    return {
      source: 'grotal',
      city,
      query,
      page: singlePage,
      total_results: leads.length,
      results: leads.slice(0, targetLimit)
    };
  }

  // Auto-pagination: 20 leads per page
  const neededPages = pages 
    ? Math.min(Math.max(parseInt(pages, 10) || 1, 1), 10)
    : Math.min(Math.ceil(targetLimit / 20), 10);

  const allLeads = [];
  const seenPhones = new Set();
  const seenNames = new Set();

  for (let p = 1; p <= neededPages; p++) {
    try {
      const { leads } = await scrapeGrotalPage({ city, query, page: p });
      if (leads.length === 0) break;

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

  return {
    source: 'grotal',
    city,
    query,
    total_pages_fetched: neededPages,
    total_results: allLeads.length,
    results: allLeads
  };
}
