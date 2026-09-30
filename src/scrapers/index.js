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
    description: 'Major B2B directory with verified manufacturers, exporters, direct mobile contacts, and GST details',
    unmasked_phones: true,
    whatsapp_ready: true,
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

import { sanitizeQuery, normalizeCity, cleanPhone, cleanEmail, detectIntent } from '../utils/normalizer.js';

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
  const startTime = Date.now();
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
    _relayed = false,
    has_phone = false,
    has_email = false,
    has_contact = false,
    only_contacts = false,
    has_whatsapp = false,
    verified_only = false,
    min_rating = null,
    enrich_emails = true
  } = options;

  if (!city || !query) {
    throw new Error('Both "city" and "query" parameters are required.');
  }

  const normCity = normalizeCity(city);
  const cleanQ = sanitizeQuery(query, city);

  const isMaxLimit = typeof limit === 'string' && (limit.toLowerCase() === 'max' || limit.toLowerCase() === 'all');
  const targetLimit = isMaxLimit ? 1000 : Math.min(Math.max(parseInt(limit, 10) || 50, 1), 1000);

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

  // Determine per-source limit
  const sourceLimit = isMaxLimit ? 'max' : Math.ceil(targetLimit * 1.2 / validSources.length);

  // Execute all scrapers concurrently with individual benchmarking timers
  const tasks = validSources.map(src => {
    const srcStart = Date.now();
    return searchSingleSource(src, {
      city: normCity,
      query: cleanQ,
      limit: sourceLimit,
      page,
      pages,
      proxy,
      relay,
      _relayed,
      enrich_emails,
      has_email
    }).then(res => ({
      source: src,
      success: true,
      duration_ms: Date.now() - srcStart,
      data: res.results || []
    })).catch(err => ({
      source: src,
      success: false,
      duration_ms: Date.now() - srcStart,
      error: err.message,
      data: []
    }));
  });

  const responses = await Promise.all(tasks);

  // Merge and deduplicate results
  // Mutually exclusive deduplication: primary key is 10-digit phone, secondary is verified email, tertiary is normalized name+city
  const leadMap = new Map();
  const sourceStats = {};

  for (const resp of responses) {
    sourceStats[resp.source] = {
      success: resp.success,
      count: resp.data.length,
      duration_ms: resp.duration_ms,
      ...(resp.error && { error: resp.error })
    };

    for (const item of resp.data) {
      const phone = cleanPhone(item.phone);
      const email = cleanEmail(item.email);
      const nameKey = (item.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const cityKey = (item.city || normCity || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

      let dedupKey;
      if (phone && phone.length === 10) {
        dedupKey = `p:${phone}`;
      } else if (email) {
        dedupKey = `e:${email}`;
      } else if (nameKey) {
        dedupKey = `n:${nameKey}_${cityKey}`;
      }

      if (!dedupKey || dedupKey.startsWith('n:_')) continue;

      if (!leadMap.has(dedupKey)) {
        leadMap.set(dedupKey, {
          name: item.name || '',
          phone: phone || item.phone || '',
          whatsapp: phone && phone.length === 10 ? phone : (item.whatsapp || ''),
          whatsapp_link: phone && phone.length === 10 ? `https://wa.me/91${phone}` : (item.whatsapp_link || ''),
          email: email || null,
          contact_person: item.contact_person || null,
          sources: [item.source || resp.source],
          primary_source: item.source || resp.source,
          rating: item.rating || null,
          reviews: item.reviews || 0,
          address: item.address || '',
          area: item.area || '',
          city: item.city || normCity,
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
        if (!existing.email && email) {
          existing.email = email;
        }
        if (!existing.contact_person && item.contact_person) {
          existing.contact_person = item.contact_person;
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

  const intent = detectIntent(query);

  let filteredLeads = Array.from(leadMap.values());

  // Contact filtering options (phone and email can be mutually exclusive)
  if (has_phone) {
    filteredLeads = filteredLeads.filter(l => l.phone && l.phone.length === 10);
  }
  if (has_email) {
    filteredLeads = filteredLeads.filter(l => l.email && l.email.includes('@'));
  }
  if (has_contact || only_contacts) {
    filteredLeads = filteredLeads.filter(l => (l.phone && l.phone.length === 10) || (l.email && l.email.includes('@')));
  }
  if (has_whatsapp) {
    filteredLeads = filteredLeads.filter(l => l.whatsapp && l.whatsapp.length === 10);
  }
  if (verified_only) {
    filteredLeads = filteredLeads.filter(l => l.verified);
  }
  if (min_rating && !isNaN(parseFloat(min_rating))) {
    const minR = parseFloat(min_rating);
    filteredLeads = filteredLeads.filter(l => (l.rating || 0) >= minR);
  }

  // Sort leads: leads with active contact (phone OR email) prioritized first, then verified, then highest rating
  const mergedLeads = filteredLeads.sort((a, b) => {
    const aHasContact = (a.phone && a.phone.length === 10) || a.email ? 1 : 0;
    const bHasContact = (b.phone && b.phone.length === 10) || b.email ? 1 : 0;
    if (aHasContact !== bHasContact) return bHasContact - aHasContact;

    const aVerified = a.verified ? 1 : 0;
    const bVerified = b.verified ? 1 : 0;
    if (aVerified !== bVerified) return bVerified - aVerified;

    return (b.rating || 0) - (a.rating || 0);
  });

  const finalResults = isMaxLimit ? mergedLeads : mergedLeads.slice(0, targetLimit);
  const totalDurationMs = Date.now() - startTime;

  return {
    city: normCity,
    query: cleanQ,
    original_query: query,
    intent,
    benchmark: {
      total_duration_ms: totalDurationMs,
      limit_requested: limit || 50,
      limit_applied: isMaxLimit ? 'max' : targetLimit,
      sources: sourceStats
    },
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

