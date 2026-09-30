// Unified Lead Harvester Engine: Multi-platform aggregator & deduplicator
// Connects Justdial, Grotal, IndiaMART, TradeIndia, and Sulekha into a single API.

import { searchJustdial, resolveCategory } from './justdial.js';
import { searchGrotal } from './grotal.js';
import { searchIndiaMart } from './indiamart.js';
import { searchTradeIndia } from './tradeindia.js';
import { searchSulekha } from './sulekha.js';

export const SOURCES = {
  justdial: {
    id: 'justdial',
    name: 'Justdial',
    description: 'Premier Indian local business directory with verified contacts and reviews',
    unmasked_phones: true,
    whatsapp_ready: true,
    requires_relay: true, // Needs Indian residential/mobile IP to bypass Akamai cloud blocks
    rate_safe: true
  },
  grotal: {
    id: 'grotal',
    name: 'Grotal',
    description: 'High-speed local business directory with embedded Schema.org LocalBusiness phone numbers',
    unmasked_phones: true,
    whatsapp_ready: true,
    requires_relay: false, // Accessible directly from global cloud datacenters
    rate_safe: true
  },
  indiamart: {
    id: 'indiamart',
    name: 'IndiaMART',
    description: 'Largest B2B marketplace in India with direct mobile web seller contact cards and TrustSEAL verification',
    unmasked_phones: true,
    whatsapp_ready: true,
    requires_relay: false, // Accessible directly from global cloud datacenters
    rate_safe: true
  },
  tradeindia: {
    id: 'tradeindia',
    name: 'TradeIndia',
    description: 'Major B2B directory with verified manufacturers, exporters, private domain websites, and GST details',
    unmasked_phones: false,
    whatsapp_ready: false,
    requires_relay: false,
    rate_safe: true
  },
  sulekha: {
    id: 'sulekha',
    name: 'Sulekha',
    description: 'Local service professionals and catering/repair specialists with direct contact lines',
    unmasked_phones: true,
    whatsapp_ready: true,
    requires_relay: true,
    rate_safe: true
  }
};

/**
 * Clean and normalize 10-digit Indian phone number
 */
function cleanPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Execute search for a single designated source
 */
export async function searchSingleSource(source, options) {
  switch (source.toLowerCase()) {
    case 'justdial':
    case 'jd':
      return searchJustdial(options);

    case 'grotal':
      return searchGrotal(options);

    case 'indiamart':
    case 'im':
      return searchIndiaMart(options);

    case 'tradeindia':
    case 'ti':
      return searchTradeIndia(options);

    case 'sulekha':
      return searchSulekha(options);

    default:
      throw new Error(`Unsupported source: "${source}". Supported sources: ${Object.keys(SOURCES).join(', ')}, all`);
  }
}

/**
 * Execute concurrent search across multiple sources with smart deduplication and cross-enrichment
 */
export async function searchAllSources(options = {}) {
  const {
    city,
    query,
    source = 'all',
    sources = null,
    limit = 50,
    page = null,
    pages = null,
    proxy = null,
    relay = null,
    _relayed = false
  } = options;

  if (!city || !query) {
    throw new Error('Both "city" and "query" parameters are required.');
  }

  const targetLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

  // Parse requested source list
  let sourceList = [];
  if (sources && Array.isArray(sources)) {
    sourceList = sources;
  } else if (source && source !== 'all') {
    sourceList = source.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  } else {
    // Default 'all' query includes fast cloud-ready sources + relay-enabled sources
    sourceList = ['grotal', 'indiamart', 'justdial', 'tradeindia', 'sulekha'];
  }

  // Filter valid sources
  const validSources = sourceList.filter(s => SOURCES[s] || s === 'jd' || s === 'im' || s === 'ti');
  if (validSources.length === 0) {
    validSources.push('grotal', 'indiamart', 'justdial');
  }

  // Execute all scrapers concurrently
  const sourceLimit = Math.ceil(targetLimit * 1.2 / validSources.length);
  const tasks = validSources.map(src => {
    return searchSingleSource(src, {
      city,
      query,
      limit: sourceLimit,
      page,
      pages,
      proxy,
      relay,
      _relayed
    }).then(res => ({
      source: src,
      success: true,
      data: res.results || []
    })).catch(err => ({
      source: src,
      success: false,
      error: err.message,
      data: []
    }));
  });

  const responses = await Promise.all(tasks);

  // Merge and deduplicate results
  const leadMap = new Map(); // Key: 10-digit phone or normalized name
  const sourceStats = {};

  for (const resp of responses) {
    sourceStats[resp.source] = {
      success: resp.success,
      count: resp.data.length,
      ...(resp.error && { error: resp.error })
    };

    for (const item of resp.data) {
      const phone = cleanPhone(item.phone);
      const nameKey = (item.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const dedupKey = phone && phone.length === 10 ? `p:${phone}` : `n:${nameKey}`;

      if (!dedupKey || dedupKey === 'n:') continue;

      if (!leadMap.has(dedupKey)) {
        leadMap.set(dedupKey, {
          name: item.name || '',
          phone: phone || item.phone || '',
          whatsapp: phone && phone.length === 10 ? phone : (item.whatsapp || ''),
          whatsapp_link: phone && phone.length === 10 ? `https://wa.me/91${phone}` : (item.whatsapp_link || ''),
          email: item.email || 'N/A',
          sources: [item.source || resp.source],
          primary_source: item.source || resp.source,
          rating: item.rating || null,
          reviews: item.reviews || 0,
          address: item.address || '',
          area: item.area || '',
          city: item.city || city,
          pincode: item.pincode || '',
          website: item.website || '',
          verified: !!item.verified,
          categories: Array.isArray(item.categories) ? [...item.categories] : [query],
          url: item.url || ''
        });
      } else {
        // Cross-enrich existing lead with new source attributes
        const existing = leadMap.get(dedupKey);
        if (!existing.sources.includes(item.source || resp.source)) {
          existing.sources.push(item.source || resp.source);
        }
        if (!existing.phone && phone) {
          existing.phone = phone;
          existing.whatsapp = phone;
          existing.whatsapp_link = `https://wa.me/91${phone}`;
        }
        if (!existing.website && item.website) {
          existing.website = item.website;
        }
        if (!existing.address && item.address) {
          existing.address = item.address;
        }
        if (!existing.rating && item.rating) {
          existing.rating = item.rating;
        }
        if (item.verified) {
          existing.verified = true;
        }
        if (Array.isArray(item.categories)) {
          for (const c of item.categories) {
            if (!existing.categories.includes(c)) {
              existing.categories.push(c);
            }
          }
        }
      }
    }
  }

  // Sort leads: verified & phone-ready first, then by rating
  const mergedLeads = Array.from(leadMap.values()).sort((a, b) => {
    const aHasPhone = a.phone && a.phone.length === 10 ? 1 : 0;
    const bHasPhone = b.phone && b.phone.length === 10 ? 1 : 0;
    if (aHasPhone !== bHasPhone) return bHasPhone - aHasPhone;

    const aVerified = a.verified ? 1 : 0;
    const bVerified = b.verified ? 1 : 0;
    if (aVerified !== bVerified) return bVerified - aVerified;

    return (b.rating || 0) - (a.rating || 0);
  });

  const finalResults = mergedLeads.slice(0, targetLimit);

  return {
    city,
    query,
    requested_sources: validSources,
    sources_status: sourceStats,
    total_deduplicated: finalResults.length,
    results: finalResults
  };
}

export {
  searchJustdial,
  resolveCategory,
  searchGrotal,
  searchIndiaMart,
  searchTradeIndia,
  searchSulekha
};
