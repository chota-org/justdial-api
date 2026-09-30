// Normalizer & Sanitizer Utilities for Multi-Platform Lead Scraping

const CITY_ALIASES = {
  'bengaluru': 'bangalore',
  'new delhi': 'delhi',
  'ncr': 'delhi',
  'delhi ncr': 'delhi',
  'gurugram': 'gurgaon',
  'calcutta': 'kolkata',
  'bombay': 'mumbai',
  'navi mumbai': 'mumbai',
  'madras': 'chennai',
  'poona': 'pune',
  'baroda': 'vadodara',
  'cochin': 'kochi',
  'trivandrum': 'thiruvananthapuram',
  'vizag': 'visakhapatnam',
  'trichy': 'tiruchirappalli',
  'banaras': 'varanasi',
  'kashi': 'varanasi',
  'prayagraj': 'allahabad',
  'secunderabad': 'hyderabad',
  'mohali': 'chandigarh',
  'panchkula': 'chandigarh'
};

const STOP_MODIFIERS = [
  'best', 'top', 'cheap', 'cheapest', 'good', 'affordable', 'budget',
  'emergency', '24x7', '24 hours', 'near me', 'nearby', 'quotes', 'online',
  'low cost', 'famous', 'popular', 'trusted', 'verified', 'urgent'
];

/**
 * Normalizes city names to standard canonical format
 */
export function normalizeCity(rawCity) {
  if (!rawCity || typeof rawCity !== 'string') return 'Delhi';
  const clean = rawCity.trim().toLowerCase().replace(/[^a-z\s]/g, '');
  return CITY_ALIASES[clean] || clean;
}

/**
 * Sanitizes user query by stripping conversational fillers, city names, and quality adjectives
 * e.g. "cheap caterers in delhi" -> "caterers"
 * e.g. "best solar panel dealers near me" -> "solar panel dealers"
 */
export function sanitizeQuery(rawQuery, city = '') {
  if (!rawQuery || typeof rawQuery !== 'string') return '';
  let text = rawQuery.trim().toLowerCase();

  // Strip all known cities and city aliases from query
  for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
    text = text.replace(new RegExp(`\\b(in|at|near|around)\\s+${alias}\\b`, 'gi'), '');
    text = text.replace(new RegExp(`\\b${alias}\\b`, 'gi'), '');
    text = text.replace(new RegExp(`\\b(in|at|near|around)\\s+${canonical}\\b`, 'gi'), '');
    text = text.replace(new RegExp(`\\b${canonical}\\b`, 'gi'), '');
  }

  // Strip digits that stand alone like "top 10", "top 5"
  text = text.replace(/\b\d+\b/g, '');

  // Strip common conversational modifier words
  for (const mod of STOP_MODIFIERS) {
    text = text.replace(new RegExp(`\\b${mod}\\b`, 'gi'), '');
  }

  // Clean extra whitespace and punctuation
  text = text.replace(/[^a-z0-9\s&-]/gi, ' ').replace(/\s+/g, ' ').trim();

  // If cleaning emptied the query, fallback to the raw input
  return text || rawQuery.trim();
}

/**
 * Robust Indian phone cleaner: extracts valid 10-digit number
 */
export function cleanPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return digits.length >= 7 ? digits : '';
}

/**
 * Clean slugify string for URLs
 */
export function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
