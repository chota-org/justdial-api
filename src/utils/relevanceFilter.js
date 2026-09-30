// Semantic Business Name & Query Relevance Engine
// Analyzes listing names, categories, and query intent to filter out irrelevant or contradictory results
// (e.g. guarantees medical shops, pharmacies, or hardware stores do not pollute restaurant searches).

import { slugify } from './normalizer.js';

// Domain-specific keywords and negative conflict triggers
const DOMAIN_RULES = [
  {
    domain: 'dining_food',
    triggers: [
      'restaurant', 'restaurants', 'cafe', 'cafes', 'coffee', 'dhaba', 'eatery', 'bistro', 'dining',
      'biryani', 'bakery', 'bakeries', 'pizza', 'burger', 'bar', 'pub', 'caterer', 'catering',
      'food', 'foods', 'tiffin', 'canteen', 'chaat', 'ice cream', 'sweets', 'mithai', 'mess', 'hotel'
    ],
    positiveKeywords: [
      'restaurant', 'cafe', 'dhaba', 'eatery', 'bistro', 'dining', 'biryani', 'bakery', 'bake',
      'pizza', 'burger', 'bar', 'pub', 'caterer', 'catering', 'food', 'foods', 'tiffin', 'canteen',
      'chaat', 'ice cream', 'sweets', 'mithai', 'mess', 'kitchen', 'delight', 'tandoor', 'grill',
      'bawarchi', 'curry', 'rolls', 'dosa', 'idli', 'thali', 'meals', 'snack', 'snacks', 'treats'
    ],
    negativeClashes: [
      'medical', 'medicals', 'chemist', 'chemists', 'pharmacy', 'pharmacies', 'diagnostic', 'diagnostics',
      'pathology', 'pathlab', 'hospital', 'hospitals', 'clinic', 'clinics', 'nursing home',
      'dental', 'dentist', 'eye care', 'optical', 'opticians', 'hardware', 'sanitary', 'plywood',
      'timber', 'cement', 'scrap', 'pest control', 'car repair', 'mechanic', 'garage', 'tyre', 'battery'
    ]
  },
  {
    domain: 'medical_healthcare',
    triggers: [
      'medical', 'medicals', 'chemist', 'chemists', 'pharmacy', 'pharmacies', 'doctor', 'doctors',
      'clinic', 'clinics', 'hospital', 'hospitals', 'diagnostic', 'diagnostics', 'dental', 'dentist', 'dentists',
      'pathology', 'health', 'healthcare', 'ayurvedic', 'homeopathy'
    ],
    positiveKeywords: [
      'medical', 'chemist', 'pharmacy', 'doctor', 'clinic', 'hospital', 'diagnostic', 'dental',
      'dentist', 'orthodontic', 'pathology', 'healthcare', 'ayurved', 'homeo', 'pharma', 'cure', 'wellness',
      'medicine', 'medicines', 'dr', 'lab', 'labs', 'care', 'dispensary', 'oral', 'smile', 'tooth'
    ],
    negativeClashes: [
      'bar', 'pub', 'liquor', 'wine', 'beer', 'restaurant', 'dhaba', 'biryani', 'bakery',
      'scrap dealer', 'car repair', 'garage', 'tyres', 'welding',
      'textile', 'textiles', 'fabrics', 'impex', 'garment', 'garments', 'apron', 'aprons',
      'uniform', 'uniforms', 'machinery', 'packaging'
    ]
  },
  {
    domain: 'pet_animal',
    triggers: [
      'pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'puppy', 'puppies', 'aquarium', 'aquariums',
      'fish', 'fishes', 'bird', 'birds', 'kennel', 'kennels', 'veterinary', 'vet', 'animal'
    ],
    positiveKeywords: [
      'pet', 'pets', 'dog', 'dogs', 'cat', 'cats', 'puppy', 'aquarium', 'fish', 'bird', 'kennel',
      'vet', 'veterinary', 'animal', 'paws', 'scrub', 'canine', 'feline', 'tails', 'aquatics'
    ],
    negativeClashes: [
      'human hospital', 'car repair', 'mechanic', 'automobile', 'saree', 'jewellers', 'jewelry',
      'hardware', 'plywood', 'cement', 'sanitaryware'
    ]
  },
  {
    domain: 'hostel_stay',
    triggers: [
      'hostel', 'hostels', 'pg', 'paying guest', 'lodge', 'lodging', 'dormitory', 'dormitories',
      'co living', 'coliving', 'accommodation'
    ],
    positiveKeywords: [
      'hostel', 'pg', 'paying guest', 'lodge', 'lodging', 'dormitory', 'co living', 'coliving',
      'mansion', 'residency', 'stay', 'stays', 'rooms', 'living'
    ],
    negativeClashes: [
      'pharmacy', 'chemist', 'diagnostic', 'pathology', 'hardware', 'fabrication', 'welding',
      'timber', 'plywood', 'cement', 'mechanic', 'car service'
    ]
  },
  {
    domain: 'cinema_entertainment',
    triggers: [
      'theatre', 'theatres', 'theater', 'theaters', 'cinema', 'cinemas', 'multiplex', 'multiplexes',
      'talkies', 'imax', 'movie'
    ],
    positiveKeywords: [
      'theatre', 'theater', 'cinema', 'multiplex', 'talkies', 'imax', 'screen', 'screens', 'films',
      'picture palace', 'entertainment'
    ],
    negativeClashes: [
      'pharmacy', 'chemist', 'medical', 'hardware', 'plywood', 'clinic', 'hospital', 'diagnostic'
    ]
  },
  {
    domain: 'automobile_repair',
    triggers: [
      'mechanic', 'mechanics', 'car repair', 'bike repair', 'garage', 'garages', 'auto service',
      'car service', 'bike service', 'wheel alignment', 'dent repair', 'motor repair'
    ],
    positiveKeywords: [
      'mechanic', 'garage', 'auto', 'motors', 'motor', 'service', 'automobiles', 'car', 'bike',
      'wheel', 'tyre', 'tyres', 'denting', 'painting', 'repairs', 'repair'
    ],
    negativeClashes: [
      'medical', 'pharmacy', 'chemist', 'bakery', 'sweet', 'mithai', 'restaurant', 'cafe'
    ]
  }
];

/**
 * Strips common stop words and punctuation from query and listing strings
 */
function cleanTokens(text) {
  if (!text || typeof text !== 'string') return [];
  const stopWords = new Set([
    'in', 'at', 'near', 'and', 'the', 'of', 'for', 'by', 'on', 'with', 'to', 'from',
    'hyderabad', 'delhi', 'mumbai', 'bangalore', 'chennai', 'pune', 'kolkata', 'ahmedabad',
    'pvt', 'ltd', 'limited', 'private', 'enterprises', 'enterprise', 'services', 'service',
    'co', 'company', 'center', 'centre', 'shop', 'store', 'agency', 'agencies'
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !stopWords.has(t));
}

/**
 * Validates whether a business listing actually satisfies the query.
 * Returns an object with:
 * - isRelevant: boolean (true if matches or passes, false if domain clash or zero relevance)
 * - score: float (0.0 to 1.0)
 * - reason: string (rationale for rejection or approval)
 */
export function validateLeadRelevance(lead, query) {
  if (!lead || !query) return { isRelevant: true, score: 0.5, reason: 'missing_input' };

  const name = String(lead.name || '').trim().toLowerCase();
  const categories = (Array.isArray(lead.categories) ? lead.categories.join(' ') : String(lead.categories || '')).toLowerCase();
  const queryLower = String(query).trim().toLowerCase();
  const fullLeadText = `${name} ${categories}`;

  // 1. Detect active domain rules for this query
  const queryTokens = cleanTokens(queryLower);
  let matchedRule = null;

  for (const rule of DOMAIN_RULES) {
    if (rule.triggers.some(t => queryLower.includes(t))) {
      matchedRule = rule;
      break;
    }
  }

  // 2. Apply Domain Conflict & Negative Clash Filter
  if (matchedRule) {
    const hasPositiveInName = matchedRule.positiveKeywords.some(pk => {
      const rx = new RegExp(`\\b${pk}\\b`, 'i');
      return rx.test(name);
    });

    const hasPositiveInCategories = matchedRule.positiveKeywords.some(pk => {
      const rx = new RegExp(`\\b${pk}\\b`, 'i');
      return rx.test(categories);
    });

    // Check if listing contains a severe negative clash in name
    const clashWord = matchedRule.negativeClashes.find(nc => {
      const rx = new RegExp(`\\b${nc}\\b`, 'i');
      return rx.test(name);
    });

    // If name contains a negative clash word AND name lacks any positive domain keywords, REJECT!
    if (clashWord && !hasPositiveInName) {
      return {
        isRelevant: false,
        score: 0.0,
        reason: `domain_clash: "${clashWord}" in name conflicts with "${matchedRule.domain}" query`
      };
    }

    if (hasPositiveInName || hasPositiveInCategories) {
      return {
        isRelevant: true,
        score: 0.95,
        reason: 'domain_positive_match'
      };
    }
  }

  // 3. General Token Overlap & Fuzzy Relevance for Niche / Unclassified Queries
  if (queryTokens.length > 0) {
    let tokenMatches = 0;
    for (const qToken of queryTokens) {
      // Check exact token word boundary in name or categories
      const rx = new RegExp(`\\b${qToken}`, 'i');
      if (rx.test(fullLeadText)) {
        tokenMatches++;
      }
    }

    const overlapRatio = tokenMatches / queryTokens.length;

    // If query has 1 token and matches, or query has multiple tokens and matches at least 1
    if (overlapRatio > 0) {
      return {
        isRelevant: true,
        score: Math.min(0.5 + overlapRatio * 0.5, 1.0),
        reason: 'token_overlap'
      };
    }
  }

  // 4. Fallback for broad queries or directory category matches
  // If the listing's categories array contains any query fragment
  if (categories.includes(queryLower) || queryLower.includes(categories)) {
    return {
      isRelevant: true,
      score: 0.7,
      reason: 'category_includes_query'
    };
  }

  // If name has at least 3 letters in common with query or is directory verified
  if (lead.verified && lead.phone) {
    return {
      isRelevant: true,
      score: 0.4,
      reason: 'verified_directory_lead'
    };
  }

  // If query is very specific and there is literally 0 token overlap and no category match, filter out
  if (queryTokens.length >= 2 && !matchedRule) {
    return {
      isRelevant: false,
      score: 0.1,
      reason: 'zero_token_overlap'
    };
  }

  return {
    isRelevant: true,
    score: 0.5,
    reason: 'default_allow'
  };
}

/**
 * Filter an array of leads, removing any contradictory or irrelevant listings
 */
export function filterRelevantLeads(leads, query) {
  if (!Array.isArray(leads)) return [];
  return leads.filter(lead => {
    const check = validateLeadRelevance(lead, query);
    lead._relevance_score = check.score;
    lead._relevance_reason = check.reason;
    return check.isRelevant;
  });
}
