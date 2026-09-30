// Pre-seeded canonical category metadata for high-frequency Indian business categories
// Guarantees 0ms resolution and 100% reliability even when native resolution or search engines rate-limit

export const POPULAR_CATEGORIES = {
  // Pet & Veterinary
  'pet shop': { search: 'Pet-Shops', ncatid: '10360322' },
  'pet shops': { search: 'Pet-Shops', ncatid: '10360322' },
  'pet store': { search: 'Pet-Shops', ncatid: '10360322' },
  'pet clinic': { search: 'Veterinary-Doctors', ncatid: '10520635' },
  'veterinary clinic': { search: 'Veterinary-Doctors', ncatid: '10520635' },
  'veterinary doctor': { search: 'Veterinary-Doctors', ncatid: '10520635' },
  'dog kennel': { search: 'Dog-Kennel-Dealers', ncatid: '11273538' },
  'aquarium': { search: 'Aquarium-Dealers', ncatid: '10019253' },

  // Food & Meat Retail
  'chicken centre': { search: 'Chicken-Centres', ncatid: '10096644' },
  'chicken centres': { search: 'Chicken-Centres', ncatid: '10096644' },
  'chicken shop': { search: 'Chicken-Centres', ncatid: '10096644' },
  'mutton shop': { search: 'Mutton-Retailers', ncatid: '10331070' },
  'fish market': { search: 'Fish-Retailers', ncatid: '10207399' },
  'bakery': { search: 'Bakeries', ncatid: '10038890' },
  'bakeries': { search: 'Bakeries', ncatid: '10038890' },
  'cake shop': { search: 'Cake-Shops', ncatid: '10079975' },
  'restaurant': { search: 'Restaurants', ncatid: '10408936' },
  'restaurants': { search: 'Restaurants', ncatid: '10408936' },
  'caterer': { search: 'Caterers', ncatid: '10103762' },
  'caterers': { search: 'Caterers', ncatid: '10103762' },

  // Accommodation & Real Estate
  'hostel': { search: 'Hostels', ncatid: '10253730' },
  'hostels': { search: 'Hostels', ncatid: '10253730' },
  'pg': { search: 'Paying-Guest-Accommodations', ncatid: '10356502' },
  'paying guest': { search: 'Paying-Guest-Accommodations', ncatid: '10356502' },
  'hotel': { search: 'Hotels', ncatid: '10253818' },
  'hotels': { search: 'Hotels', ncatid: '10253818' },
  'estate agent': { search: 'Estate-Agents', ncatid: '10191834' },

  // Entertainment
  'movie theatre': { search: 'Cinema-Halls', ncatid: '10115383' },
  'movie theatres': { search: 'Cinema-Halls', ncatid: '10115383' },
  'theatre': { search: 'Cinema-Halls', ncatid: '10115383' },
  'theatres': { search: 'Cinema-Halls', ncatid: '10115383' },
  'cinema': { search: 'Cinema-Halls', ncatid: '10115383' },
  'cinema halls': { search: 'Cinema-Halls', ncatid: '10115383' },

  // Medical & Healthcare
  'dentist': { search: 'Dentists', ncatid: '10156641' },
  'dentists': { search: 'Dentists', ncatid: '10156641' },
  'hospital': { search: 'Hospitals', ncatid: '10253735' },
  'hospitals': { search: 'Hospitals', ncatid: '10253735' },
  'chemist': { search: 'Chemists', ncatid: '10113824' },
  'chemists': { search: 'Chemists', ncatid: '10113824' },
  'pharmacy': { search: 'Chemists', ncatid: '10113824' },
  'diagnostic centre': { search: 'Diagnostic-Centres', ncatid: '10161474' },

  // Home & Construction Services
  'electrician': { search: 'Electricians', ncatid: '10182412' },
  'electricians': { search: 'Electricians', ncatid: '10182412' },
  'plumber': { search: 'Plumbers', ncatid: '10372339' },
  'plumbers': { search: 'Plumbers', ncatid: '10372339' },
  'carpenter': { search: 'Carpenters', ncatid: '10102604' },
  'carpenters': { search: 'Carpenters', ncatid: '10102604' },
  'painter': { search: 'Painters', ncatid: '10345479' },
  'pest control': { search: 'Pest-Control-Services', ncatid: '10359873' },
  'interior designer': { search: 'Interior-Designers', ncatid: '10266014' },
  'interior designers': { search: 'Interior-Designers', ncatid: '10266014' },
  'packers and movers': { search: 'Packers-And-Movers', ncatid: '10344565' },

  // Energy & Industrial
  'solar panel': { search: 'Solar-Panel-Dealers', ncatid: '10444390' },
  'solar panel dealers': { search: 'Solar-Panel-Dealers', ncatid: '10444390' },
  'solar panels': { search: 'Solar-Panel-Dealers', ncatid: '10444390' },
  'battery dealers': { search: 'Battery-Dealers', ncatid: '10041857' },

  // Personal Care & Fitness
  'gym': { search: 'Gyms', ncatid: '10237722' },
  'gyms': { search: 'Gyms', ncatid: '10237722' },
  'beauty parlour': { search: 'Beauty-Parlours', ncatid: '10044558' },
  'beauty parlours': { search: 'Beauty-Parlours', ncatid: '10044558' },
  'salon': { search: 'Salons', ncatid: '10423023' },
  'spa': { search: 'Spas', ncatid: '10447363' },

  // Automotive & Travel
  'car rental': { search: 'Car-Rental', ncatid: '10100414' },
  'car hire': { search: 'Car-Rental', ncatid: '10100414' },
  'travel agency': { search: 'Travel-Agents', ncatid: '10499641' },
  'travel agents': { search: 'Travel-Agents', ncatid: '10499641' },
  'driving school': { search: 'Motor-Training-Schools', ncatid: '10324866' }
};

/**
 * Fast lookup for popular Indian business categories
 */
export function getPopularCategory(cleanQuery) {
  if (!cleanQuery) return null;
  const key = String(cleanQuery).trim().toLowerCase();
  return POPULAR_CATEGORIES[key] || null;
}
