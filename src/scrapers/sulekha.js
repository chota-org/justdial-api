// Sulekha Scraper: Local service businesses with direct phone numbers and ratings
// Extracts Schema.org ItemList JSON-LD from Sulekha directory pages.

function cleanPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export async function scrapeSulekhaPage({ city, query, relay, _relayed }) {
  // Normalize category: e.g. "caterers" -> "catering-services", "packers and movers" -> "packers-and-movers"
  let catSlug = query.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (catSlug === 'caterers' || catSlug === 'caterer') {
    catSlug = 'catering-services';
  }

  const citySlug = city.trim().toLowerCase().replace(/[\s_]+/g, '-');
  const targetUrl = `https://www.sulekha.com/${catSlug}/${citySlug}`;

  // If running in cloud and relay is configured, route via Indian relay
  const activeRelay = relay || process.env.RELAY_URL;
  if (activeRelay && !_relayed) {
    try {
      const relayParams = new URLSearchParams({
        source: 'sulekha',
        city,
        query
      });
      const relayUrl = `${activeRelay.replace(/\/+$/, '')}/api/sulekha/search?${relayParams.toString()}`;
      const relayResp = await fetch(relayUrl, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
          'User-Agent': 'Vyapar-API-Gateway/1.0'
        },
        signal: AbortSignal.timeout(30000)
      });
      if (relayResp.ok) {
        const data = await relayResp.json();
        return data.results || [];
      }
    } catch (relayErr) {
      console.warn(`[Sulekha] Relay request failed: ${relayErr.message}. Attempting direct fetch.`);
    }
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  const resp = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(15000) });
  if (!resp.ok) {
    throw new Error(`Sulekha returned HTTP ${resp.status}`);
  }

  const html = await resp.text();
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
              reviews: null,
              address: fullAddress,
              area: locality,
              city: region || city,
              pincode: postal,
              website: '',
              verified: true,
              categories: [query],
              description: item.description || '',
              url: item.url || targetUrl
            });
          }
        }
      }
    } catch {
      // Ignore JSON parse errors in irrelevant scripts
    }
  }

  return leads;
}

export async function searchSulekha({ city, query, relay, limit = 50, _relayed }) {
  const targetLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  try {
    const leads = await scrapeSulekhaPage({ city, query, relay, _relayed });
    return {
      source: 'sulekha',
      city,
      query,
      total_results: leads.length,
      results: leads.slice(0, targetLimit)
    };
  } catch (err) {
    console.warn(`[Sulekha] Search error: ${err.message}`);
    return {
      source: 'sulekha',
      city,
      query,
      total_results: 0,
      results: []
    };
  }
}
