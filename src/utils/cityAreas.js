// Canonical Top Localities & Areas for Indian Metropolitan & Tier-2 Cities
// Enables exhaustive multi-area Justdial search to bypass the ~32 lead pagination ceiling

export const CITY_AREAS = {
  'hyderabad': [
    'Kukatpally', 'Banjara Hills', 'Jubilee Hills', 'Secunderabad', 'Madhapur',
    'Gachibowli', 'Begumpet', 'Ameerpet', 'Dilsukhnagar', 'LB Nagar',
    'Miyapur', 'Nizampet', 'Manikonda', 'Uppal', 'Kondapur',
    'Attapur', 'Tarnaka', 'Alwal', 'Sainikpuri', 'Chanda Nagar',
    'Hitech City', 'Somajiguda', 'Malakpet', 'Mehdipatnam', 'Abids',
    'Himayat Nagar', 'Kothapet', 'Nagole', 'Bowenpally', 'Kompally',
    'Nampally', 'Saidabad', 'Masab Tank', 'Sanjeeva Reddy Nagar', 'Moosapet',
    'Hayath Nagar', 'Safilguda', 'ECIL', 'Malkajgiri', 'Tolichowki',
    'Charminar', 'Kacheguda', 'Lingampally', 'Shamshabad', 'Rajendra Nagar',
    'AS Rao Nagar', 'Nallagandla', 'Tellapur', 'Bachupally', 'Hafeezpet',
    'Jeedimetla', 'Balanagar', 'Sanathnagar', 'Cherlapally', 'Nacharam',
    'Kattedan', 'Patancheru', 'Medchal'
  ],
  'bangalore': [
    'Koramangala', 'Indiranagar', 'Whitefield', 'HSR Layout', 'Jayanagar',
    'JP Nagar', 'Electronic City', 'Marathahalli', 'BTM Layout', 'Hebbal',
    'Malleshwaram', 'Banashankari', 'Rajajinagar', 'Yelahanka', 'Bellandur',
    'Sarjapur Road', 'Kalyan Nagar', 'Vijayanagar', 'Basavanagudi', 'RT Nagar',
    'Richmond Town', 'Domlur', 'Ulsoor', 'Frazer Town', 'Bannerghatta Road',
    'Harlur', 'Kasavanahalli', 'Kengeri', 'KR Puram', 'Mahadevapura',
    'Vidyaranyapura', 'Thanisandra', 'Begur', 'Bommanahalli', 'Nagarbhavi',
    'Peenya', 'Bommasandra', 'Jigani', 'Bidadi'
  ],
  'mumbai': [
    'Andheri West', 'Andheri East', 'Bandra West', 'Bandra East', 'Borivali West',
    'Borivali East', 'Malad West', 'Malad East', 'Kandivali West', 'Kandivali East',
    'Goregaon West', 'Goregaon East', 'Juhu', 'Santacruz', 'Khar',
    'Powai', 'Ghatkopar', 'Mulund', 'Thane West', 'Navi Mumbai',
    'Vashi', 'Dadar', 'Worli', 'Lower Parel', 'Colaba',
    'Chembur', 'Kurla', 'Bhandup', 'Mira Road', 'Dahisar',
    'Bhayandar', 'Panvel', 'Nerul', 'Belapur', 'Kharghar',
    'Bhiwandi', 'Turbhe', 'Rabale', 'Mahape', 'Taloja'
  ],
  'delhi': [
    'Connaught Place', 'Karol Bagh', 'Lajpat Nagar', 'South Extension', 'Rohini',
    'Pitampura', 'Dwarka', 'Janakpuri', 'Saket', 'Hauz Khas',
    'Greater Kailash', 'Vasant Kunj', 'Nehru Place', 'Laxmi Nagar', 'Preet Vihar',
    'Chandni Chowk', 'Rajouri Garden', 'Punjabi Bagh', 'Paschim Vihar', 'Shahdara',
    'Malviya Nagar', 'Defence Colony', 'Mayur Vihar', 'Okhla', 'Patel Nagar',
    'Kalkaji', 'Green Park', 'Model Town', 'Shalimar Bagh', 'Tilak Nagar',
    'Mayapuri', 'Wazirpur', 'Naraina', 'Bawana', 'Kirti Nagar'
  ],
  'chennai': [
    'T Nagar', 'Anna Nagar', 'Velachery', 'Adyar', 'Mylapore',
    'Nungambakkam', 'Guindy', 'Porur', 'Tambaram', 'Thiruvanmiyur',
    'Besant Nagar', 'Kodambakkam', 'Alwarpet', 'Kilpauk', 'Royapettah',
    'Chromepet', 'Vadapalani', 'Perambur', 'Sholinganallur', 'OMR',
    'Medavakkam', 'Pallavaram', 'Ashok Nagar', 'Mogappair', 'Kolathur',
    'Ambattur', 'Avadi', 'Poonamallee', 'Sriperumbudur'
  ],
  'kolkata': [
    'Park Street', 'Salt Lake', 'New Town', 'Ballygunge', 'Gariahat',
    'Behala', 'Dum Dum', 'Howrah', 'Jadavpur', 'Tollygunge',
    'Alipore', 'Bhowanipore', 'Shyambazar', 'Kankurgachi', 'Rajarhat',
    'Lake Town', 'Kasba', 'Baguiati', 'Barasat', 'Garia',
    'Jorasanko', 'Sealdah', 'Esplanade', 'Rash Behari', 'Ultadanga',
    'Taratala', 'Cossipore'
  ],
  'pune': [
    'Kothrud', 'Viman Nagar', 'Baner', 'Wakad', 'Hinjawadi',
    'Koregaon Park', 'Kalyani Nagar', 'Aundh', 'Hadapsar', 'Pimpri',
    'Chinchwad', 'Magarpatta', 'Shivaji Nagar', 'Camp', 'Bibwewadi',
    'Sinhagad Road', 'Kharadi', 'Bavdhan', 'Wanowrie', 'Vishrantwadi',
    'Dhanori', 'Pimple Saudagar', 'Nigdi', 'Bhosari', 'Katraj',
    'Chakan', 'Talawade'
  ],
  'ahmedabad': [
    'Navrangpura', 'SG Highway', 'Satellite', 'Vastrapur', 'Bodakdev',
    'Maninagar', 'Prahlad Nagar', 'Chandkheda', 'Bopal', 'Thaltej',
    'Paldi', 'Naranpura', 'Ghatlodia', 'Ranip', 'Ellis Bridge',
    'Gurukul', 'Memnagar', 'Nikol', 'Naroda', 'C G Road',
    'Motera', 'Sabarmati', 'Gota', 'Isanpur', 'Odhav'
  ],
  'jaipur': [
    'Malviya Nagar', 'Vaishali Nagar', 'Mansarovar', 'C Scheme', 'Raja Park',
    'Tonk Road', 'Vidhyadhar Nagar', 'Jagatpura', 'Ajmer Road', 'Gopalpura',
    'Sodala', 'Bani Park', 'Jhotwara', 'Sanganer', 'MI Road'
  ],
  'lucknow': [
    'Gomti Nagar', 'Hazratganj', 'Alambagh', 'Indira Nagar', 'Mahanagar',
    'Aliganj', 'Jankipuram', 'Aminabad', 'Chowk', 'Ashiyana',
    'Rajajipuram', 'Vikas Nagar', 'Faizabad Road', 'Kanpur Road', 'Telibagh'
  ],
  'chandigarh': [
    'Sector 17', 'Sector 35', 'Sector 22', 'Sector 8', 'Sector 9',
    'Sector 26', 'Sector 34', 'Sector 43', 'Sector 7', 'Mohali',
    'Panchkula', 'Manimajra', 'Zirakpur', 'Kharar', 'Industrial Area'
  ],
  'coimbatore': [
    'RS Puram', 'Gandhipuram', 'Peelamedu', 'Saibaba Colony', 'Saravanampatti',
    'Ramanathapuram', 'Singanallur', 'Ganapathy', 'Town Hall', 'Race Course'
  ],
  'surat': [
    'Adajan', 'Vesu', 'Piplod', 'Varachha', 'Katargam',
    'Rander', 'Ghod Dod Road', 'City Light', 'Majura Gate', 'Athwa'
  ],
  'indore': [
    'Vijay Nagar', 'Palasia', 'Rajwada', 'Bhanwarkuan', 'AB Road',
    'Sapna Sangeeta', 'Annapurna', 'Saket', 'Bengali Square', 'Rau'
  ],
  'kochi': [
    'MG Road', 'Edappally', 'Kakkanad', 'Palarivattom', 'Marine Drive',
    'Kaloor', 'Fort Kochi', 'Vyttila', 'Panampilly Nagar', 'Aluva'
  ]
};

const DEFAULT_AREAS = [
  'Central', 'North', 'South', 'East', 'West',
  'Market', 'Main Road', 'Station Road', 'City Center', 'Industrial Area'
];

/**
 * Returns canonical list of major localities for a given normalized city
 */
export function getCityAreas(city) {
  if (!city) return DEFAULT_AREAS;
  const key = String(city).trim().toLowerCase();
  return CITY_AREAS[key] || DEFAULT_AREAS;
}
