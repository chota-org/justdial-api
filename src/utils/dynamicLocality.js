// Dynamic Locality Discovery & Snowball Queue Engine
// Enables autonomous self-discovery of micro-localities, wards, and industrial clusters directly
// from search results, page props, and HTML facets across all lead platforms (Justdial, Grotal, IndiaMART, TradeIndia, Sulekha).
// Only falls back to static city directory when dynamic discovery yields insufficient areas.

import { slugify } from './normalizer.js';

/**
 * Clean and normalize a raw area/address string into a canonical locality name.
 * Strips noise, parent city suffixes, pincodes, and landmark prefixes.
 */
export function normalizeAreaName(rawArea, parentCity = '') {
  if (!rawArea || typeof rawArea !== 'string') return null;

  let clean = rawArea
    .replace(/<[^>]+>/g, '') // remove HTML tags if any
    .replace(/[,\t\r\n]+/g, ', ') // normalize punctuation
    .trim();

  // Remove trailing pincodes (e.g. "Kukatpally 500072" -> "Kukatpally")
  clean = clean.replace(/\b\d{6}\b/g, '').trim();

  // If address contains commas, prioritize the first 1-2 locality components
  const parts = clean.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length > 0) {
    clean = parts[0];
    // If the first part is a house number or flat (e.g., "Flat 302" or "Plot 14"), prefer the second part
    if (/^(plot|flat|h\.?no|shop|door|bldg|building|opp|near|behind|beside)\b/i.test(clean) && parts.length > 1) {
      clean = parts[1];
    }
  }

  // Remove city suffix if included (e.g. "Kukatpally Hyderabad" -> "Kukatpally")
  if (parentCity) {
    const cityRegex = new RegExp(`\\b${parentCity.trim()}\\b`, 'gi');
    clean = clean.replace(cityRegex, '').trim();
  }

  // Strip non-word / non-space / non-hyphen chars
  clean = clean.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();

  // Discard if too short or generic junk
  if (clean.length < 3) return null;
  const lower = clean.toLowerCase();
  const junkPatterns = [
    /^(road|street|main road|cross|phase|block|sector|lane|nagar|colony|market|bazaar|near|opp|behind)$/i,
    /^\d+$/,
    /^(india|telangana|maharashtra|karnataka|tamil nadu|delhi|uttar pradesh|gujarat|rajasthan)$/i
  ];
  if (junkPatterns.some(rx => rx.test(lower))) return null;

  return clean;
}

/**
 * Extracts sub-localities from composite area names (e.g. "Owaisipura Masab Tank" -> ["Masab Tank", "Owaisipura"])
 */
export function extractSubLocalities(areaName) {
  if (!areaName) return [];
  const words = areaName.split(/\s+/).filter(Boolean);
  const subs = [];
  if (words.length >= 3) {
    // Last 2 words often form the primary hub (e.g. "Masab Tank" or "Cyber City")
    const mainHub = words.slice(-2).join(' ');
    if (mainHub.length >= 3) subs.push(mainHub);
  }
  return subs;
}

/**
 * Autonomous Dynamic Locality Discovery Queue
 * Provides snowball crawling across discovered areas with optional fallback provider.
 */
export class DynamicLocalityQueue {
  constructor({ city = '', fallbackProvider = null, maxDynamicAreas = 80 } = {}) {
    this.city = String(city).trim();
    this.fallbackProvider = fallbackProvider;
    this.maxDynamicAreas = maxDynamicAreas;

    this.queue = [];
    this.seenSlugs = new Set();
    this.visitedSlugs = new Set();
    this.dynamicDiscoveredCount = 0;
    this.fallbackUsed = false;
  }

  /**
   * Safely enqueues a locality if not previously seen or visited
   */
  queueArea(rawArea) {
    if (this.queue.length >= this.maxDynamicAreas) return false;
    const clean = normalizeAreaName(rawArea, this.city);
    if (!clean) return false;

    const slug = slugify(clean);
    if (!slug || slug.length < 3 || this.seenSlugs.has(slug)) return false;

    this.seenSlugs.add(slug);
    this.queue.push(clean);
    this.dynamicDiscoveredCount++;

    // Also queue composite sub-localities
    const subs = extractSubLocalities(clean);
    for (const sub of subs) {
      const subSlug = slugify(sub);
      if (subSlug && subSlug.length >= 3 && !this.seenSlugs.has(subSlug) && this.queue.length < this.maxDynamicAreas) {
        this.seenSlugs.add(subSlug);
        this.queue.push(sub);
        this.dynamicDiscoveredCount++;
      }
    }
    return true;
  }

  /**
   * Batch extracts localities from lead listings (uses lead.area, lead.address, lead.locality)
   */
  queueFromListings(listings = []) {
    if (!Array.isArray(listings)) return;
    for (const lead of listings) {
      if (lead.area) this.queueArea(lead.area);
      if (lead.address && (!lead.area || lead.area === this.city)) {
        this.queueArea(lead.address);
      }
    }
  }

  /**
   * Harvests locality links, facet buttons, and Next.js state from HTML
   */
  queueFromHtml(html = '') {
    if (!html || typeof html !== 'string') return;

    // 1. Justdial / Sulekha / Grotal href patterns:
    // e.g. /{city}/{search}-in-{area} or /{category}/{area}-{city} or /{city}/{slug}-in-{area}-C...
    const areaUrlRegex = /\/(?:[a-zA-Z0-9_-]+)-in-([a-zA-Z0-9_-]+)(?:\/|\?|")/gi;
    let m;
    while ((m = areaUrlRegex.exec(html)) !== null) {
      const areaSlug = m[1];
      if (areaSlug && areaSlug.length >= 3) {
        const areaName = areaSlug.replace(/-/g, ' ');
        this.queueArea(areaName);
      }
    }

    // 2. Sulekha pattern: /category/area-city
    const sulekhaRegex = /\/([a-zA-Z0-9_-]+)-([a-zA-Z0-9_-]+)(?:#|\?|"|')/gi;
    // Look for explicit locality facets in JSON-LD or script tags
    const localityFacetRegex = /"(?:area|locality|location|areaname|sub_locality)"\s*:\s*"([^"]+)"/gi;
    while ((m = localityFacetRegex.exec(html)) !== null) {
      this.queueArea(m[1]);
    }
  }

  /**
   * Returns next available area, or triggers fallback provider if queue is empty
   */
  nextArea() {
    // 1. Pop from dynamic queue first
    while (this.queue.length > 0) {
      const area = this.queue.shift();
      const slug = slugify(area);
      if (!this.visitedSlugs.has(slug)) {
        this.visitedSlugs.add(slug);
        return area;
      }
    }

    // 2. If dynamic queue is exhausted, activate fallback list if available
    if (!this.fallbackUsed && typeof this.fallbackProvider === 'function') {
      this.fallbackUsed = true;
      const fallbackList = this.fallbackProvider(this.city) || [];
      for (const fbArea of fallbackList) {
        const slug = slugify(fbArea);
        if (!this.seenSlugs.has(slug) && !this.visitedSlugs.has(slug)) {
          this.seenSlugs.add(slug);
          this.queue.push(fbArea);
        }
      }

      if (this.queue.length > 0) {
        const area = this.queue.shift();
        this.visitedSlugs.add(slugify(area));
        return area;
      }
    }

    return null;
  }

  /**
   * Checks if more areas are available (either dynamic or fallback)
   */
  hasMore() {
    if (this.queue.length > 0) return true;
    if (!this.fallbackUsed && typeof this.fallbackProvider === 'function') {
      const fallbackList = this.fallbackProvider(this.city) || [];
      return fallbackList.some(a => !this.visitedSlugs.has(slugify(a)));
    }
    return false;
  }

  /**
   * Current stats for debugging and reporting
   */
  stats() {
    return {
      queued: this.queue.length,
      visited: this.visitedSlugs.size,
      dynamicallyDiscovered: this.dynamicDiscoveredCount,
      fallbackUsed: this.fallbackUsed
    };
  }
}
