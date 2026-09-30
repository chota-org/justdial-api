# Vyapar Leads API — Official API Documentation 🇮🇳

> **Version:** `2.0.0`  
> **Status:** `Production Live`  
> **Service Architecture:** Multi-Platform Browserless Lead Harvester Engine  
> **Target Geographic Coverage:** All 28 States & 8 Union Territories of India (230+ cities)

---

## 1. Overview & Architecture

The **Vyapar Leads API** is an enterprise-grade, browserless HTTP engine designed to discover, extract, and normalize verified business leads from major Indian commercial directories:
- **Justdial** (Retail, services, hospitality, healthcare)
- **IndiaMART** (B2B, industrial suppliers, manufacturers, wholesale)
- **Grotal** (Local stores, catering, event planners, household services)
- **TradeIndia** (Exporters, large-scale manufacturers, traders)
- **Sulekha** (Specialist contractors, domestic and event services)

### Key Architectural Strengths:
1. **Zero Browser Overhead:** Pure HTTP, Server-Side Rendered (SSR) hydration, and JSON-LD extraction. No Chromium, Puppeteer, or Playwright in production.
2. **Unmasked Contact Numbers:** Bypasses client-side click-to-reveal phone masking mechanisms to deliver direct 10-digit mobile and telephone contacts.
3. **Direct WhatsApp Links:** Automatically creates `https://wa.me/91XXXXXXXXXX` dispatch links ready for 1-click customer outreach.
4. **Cross-Source Deduplication & Enrichment:** When querying multiple directories simultaneously (`source=all`), the engine merges matching phone numbers into an enriched lead record, combining reviews from Justdial, websites from TradeIndia, and trust badges from IndiaMART.
5. **Multi-Region Failover:** Hosted across US (Oregon) and Asia (Singapore) clusters with automated upstream relay integration.

---

## 2. Base URLs & Environments

| Environment | Base URL | Region | Typical Latency |
| :--- | :--- | :--- | :--- |
| **Production (US Primary)** | `https://justdial-api.onrender.com` | Oregon, USA (`us-west`) | ~800ms – 1.8s |
| **Production (Asia Secondary)**| `https://justdial-api-sg.onrender.com` | Singapore (`ap-southeast-1`)| ~250ms – 900ms |
| **Local Development** | `http://127.0.0.1:10000` | Localhost | ~150ms – 500ms |

---

## 3. Authentication & Security

All `/api/*` routes are protected with API key authentication and rate limiting.

### Providing the API Key:
You can pass the API key using any of the following three methods:

1. **HTTP Header (Recommended):**
   ```http
   x-api-key: jd_sec_9b2e71f4
   ```
2. **Bearer Token:**
   ```http
   Authorization: Bearer jd_sec_9b2e71f4
   ```
3. **Query Parameter:**
   ```text
   ?api_key=jd_sec_9b2e71f4
   ```

### Rate Limiting:
- **Default Limit:** `60 requests per minute` per client IP.
- **Window:** 60 seconds rolling window.
- **Rate Limit Headers Included in Every Response:**
  - `RateLimit-Limit`: Maximum requests allowed in current window (`60`).
  - `RateLimit-Remaining`: Requests remaining in current window.
  - `RateLimit-Reset`: Seconds remaining until the quota resets.
- When exceeded, the server returns HTTP `429 Too Many Requests`.

---

## 4. Unified Lead Data Schema

Every lead returned by the API—regardless of which platform or platforms it originated from—strictly conforms to the following schema:

```json
{
  "name": "Sony Caterers",
  "phone": "9999577392",
  "whatsapp": "9999577392",
  "whatsapp_link": "https://wa.me/919999577392",
  "email": "sonycaterers@gmail.com",
  "contact_person": "Mr. Rajiv Sony (Proprietor)",
  "sources": ["grotal", "justdial"],
  "primary_source": "grotal",
  "rating": 4.5,
  "reviews": 12,
  "address": "Vinod Nagar, Delhi, 110092",
  "area": "Vinod Nagar",
  "city": "Delhi",
  "pincode": "110092",
  "website": "https://sonycaterers.in",
  "verified": true,
  "categories": ["Caterers", "Wedding Services"],
  "url": "https://www.grotal.com/Delhi/Caterers-C44A0P1A0/"
}
```

### Field Definitions:

| Field | Type | Description |
| :--- | :--- | :--- |
| `name` | `string` | Trade or business entity name. |
| `phone` | `string` | Cleaned 10-digit primary phone number without country code or spaces. |
| `whatsapp` | `string` | Direct WhatsApp-compatible number (identical to mobile phone). |
| `whatsapp_link`| `string` | Direct URL format (`https://wa.me/91{phone}`) for 1-click dispatch. |
| `email` | `string \| null` | Verified merchant email address extracted from SSR detail profiles, or `null`. |
| `contact_person`| `string \| null` | Name and designation of the business owner, proprietor, or manager. |
| `sources` | `string[]` | Array of platforms where this merchant was verified. |
| `primary_source`| `string` | Platform that provided the initial or highest-fidelity record. |
| `rating` | `number \| null` | Aggregate customer rating score (e.g. `4.5` out of 5). |
| `reviews` | `number` | Total number of verified customer reviews. |
| `address` | `string` | Complete physical street address. |
| `area` | `string` | Locality, neighborhood, or industrial sector name. |
| `city` | `string` | City or municipal region. |
| `pincode` | `string` | 6-digit Indian Postal PIN code. |
| `website` | `string` | Direct merchant website URL if listed. |
| `verified` | `boolean` | Trust status (e.g., IndiaMART TrustSEAL, Justdial Verified, Grotal Verified). |
| `categories` | `string[]` | Business categories or goods dealt in. |
| `url` | `string` | Source directory listing profile URL. |


---

## 5. API Endpoints Reference

### 5.1 System Health
```http
GET /health
```
Public endpoint (does not require an API key). Used by load balancers and monitoring agents.

#### Response Example (`200 OK`):
```json
{
  "status": "ok",
  "uptime": 1240.52,
  "timestamp": "2026-09-30T13:40:00.000Z",
  "auth_required": true,
  "rate_limit_max": 60,
  "proxy_configured": false,
  "relay_configured": true,
  "sources_available": ["justdial", "grotal", "indiamart", "tradeindia", "sulekha"]
}
```

---

### 5.2 Supported Sources Catalog
```http
GET /api/sources
```
Returns capabilities, data formats, unmasking reliability, and connection modes for every integrated platform.

#### Response Example (`200 OK`):
```json
{
  "success": true,
  "total": 5,
  "sources": [
    {
      "id": "justdial",
      "name": "Justdial",
      "description": "Premier Indian local business directory with verified contacts and reviews",
      "unmasked_phones": true,
      "whatsapp_ready": true,
      "requires_relay": true,
      "rate_safe": true
    },
    {
      "id": "grotal",
      "name": "Grotal",
      "description": "High-speed local business directory with embedded Schema.org LocalBusiness phone numbers",
      "unmasked_phones": true,
      "whatsapp_ready": true,
      "requires_relay": false,
      "rate_safe": true
    },
    {
      "id": "indiamart",
      "name": "IndiaMART",
      "description": "Largest B2B marketplace in India with direct mobile web seller contact cards and TrustSEAL verification",
      "unmasked_phones": true,
      "whatsapp_ready": true,
      "requires_relay": false,
      "rate_safe": true
    },
    {
      "id": "tradeindia",
      "name": "TradeIndia",
      "description": "Major B2B directory with verified manufacturers, exporters, direct mobile contacts, and GST details",
      "unmasked_phones": true,
      "whatsapp_ready": true,
      "requires_relay": false,
      "rate_safe": true
    },
    {
      "id": "sulekha",
      "name": "Sulekha",
      "description": "Local service professionals and catering/repair specialists with direct contact lines",
      "unmasked_phones": true,
      "whatsapp_ready": true,
      "requires_relay": true,
      "rate_safe": true
    }
  ]
}
```

---

### 5.3 Unified Lead Search
```http
GET /api/search
```
The primary lead generation endpoint. Queries either all platforms simultaneously or a customized subset, deduplicating records by phone number and business name.

#### Query Parameters:

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `city` | `string` | **Yes** | — | Target city (e.g. `Delhi`, `Mumbai`, `Bangalore`, `Pune`, `Jaipur`, `Ahmedabad`, `Kolkata`, `Hyderabad`, `Chennai`) |
| `query` | `string` | **Yes** | — | Category or keyword (e.g. `Caterers`, `solar panel`, `pet-shop`, `packers and movers`) |
| `source` | `string` | No | `all` | Platform selector: `all`, `justdial`, `grotal`, `indiamart`, `tradeindia`, `sulekha`, or comma-separated list (`grotal,indiamart`) |
| `limit` | `number \| string`| No | `50` | Maximum deduplicated leads to return: integer (1 to 1000) or `"max"` / `"all"` to extract the maximum directory capacity. Auto-paginates upstream pages to fulfill requested quota. |
| `has_phone` | `boolean` | No | `false` | When `true`, filters results to only return leads with a verified 10-digit phone number. |
| `has_email` | `boolean` | No | `false` | When `true`, filters results to only return leads with a verified merchant email address. |
| `has_contact` | `boolean` | No | `false` | Mutually exclusive contact filter: when `true`, returns leads having **either** a valid phone OR an email address. |
| `enrich_emails`| `boolean` | No | `true` | Concurrently fetches merchant SSR detail profiles on Justdial and Sulekha to enrich listings with direct emails and contact persons. |
| `page` | `number` | No | `1` | Specific single page number to fetch (disables auto-pagination). |
| `pages` | `number` | No | Auto | Explicit number of pages to iterate per platform (1 to 50). |
| `has_whatsapp` | `boolean` | No | `false` | When `true`, filters results to only return leads with WhatsApp capability. |
| `verified` | `boolean` | No | `false` | When `true`, returns only verified/TrustSEAL merchants. |
| `min_rating` | `number` | No | — | Minimum customer review score filter (e.g. `4.0`). |

#### Request Example:
```bash
curl -s -H "x-api-key: jd_sec_9b2e71f4" \
  "https://justdial-api.onrender.com/api/search?city=Hyderabad&query=pet%20shops&source=all&limit=max"
```

#### Response Example (`200 OK`):
```json
{
  "success": true,
  "city": "Hyderabad",
  "query": "pet shops",
  "original_query": "pet shops",
  "intent": "local_services",
  "benchmark": {
    "total_duration_ms": 28209,
    "limit_requested": "max",
    "limit_applied": "max",
    "sources": {
      "indiamart": { "success": true, "count": 6, "duration_ms": 694 },
      "grotal": { "success": true, "count": 37, "duration_ms": 1138 },
      "tradeindia": { "success": true, "count": 84, "duration_ms": 2292 },
      "sulekha": { "success": true, "count": 92, "duration_ms": 9013 },
      "justdial": { "success": true, "count": 32, "duration_ms": 28086 }
    }
  },
  "requested_sources": ["grotal", "indiamart", "justdial", "tradeindia", "sulekha"],
  "sources_status": {
    "grotal": { "success": true, "count": 37, "duration_ms": 1138 },
    "indiamart": { "success": true, "count": 6, "duration_ms": 694 },
    "tradeindia": { "success": true, "count": 84, "duration_ms": 2292 },
    "sulekha": { "success": true, "count": 92, "duration_ms": 9013 },
    "justdial": { "success": true, "count": 32, "duration_ms": 28086 }
  },
  "total_deduplicated": 250,
  "results": [
    {
      "name": "Ammu's Pets & Kennels",
      "phone": "8197688953",
      "whatsapp": "8197688953",
      "whatsapp_link": "https://wa.me/918197688953",
      "email": "ammukennels@gmail.com",
      "contact_person": "Mr Mohammad Moin Uddin (Proprietor)",
      "sources": ["justdial"],
      "primary_source": "justdial",
      "rating": 4.5,
      "reviews": 38,
      "address": "Opposite Pillar No 141 Attapur, Hyderabad",
      "area": "Attapur",
      "city": "Hyderabad",
      "pincode": "500048",
      "website": "https://ammupets.com",
      "verified": true,
      "categories": ["Pet Shops", "Dog Breeders"],
      "url": "https://www.justdial.com/Hyderabad/Ammus-Pets-Kennels-Attapur/040PXX40-XX40-190117180025-Q1W8_BZDET"
    }
  ]
```

---


### 5.4 Single-Platform Search Shortcuts
Direct routes targeting specific directories without touching other scrapers:

* `GET /api/justdial/search?city={city}&query={query}&limit={limit}`
* `GET /api/grotal/search?city={city}&query={query}&limit={limit}`
* `GET /api/indiamart/search?city={city}&query={query}&limit={limit}`
* `GET /api/tradeindia/search?city={city}&query={query}&limit={limit}`
* `GET /api/sulekha/search?city={city}&query={query}&limit={limit}`

#### Example:
```bash
curl -s -H "x-api-key: jd_sec_9b2e71f4" \
  "https://justdial-api.onrender.com/api/grotal/search?city=Mumbai&query=Pet-Shops&limit=10"
```

---

### 5.5 Export Directly as CSV Download
```http
GET /api/export/csv
```
Streams a standards-compliant RFC 4180 UTF-8 CSV file directly. Triggers a file download in browsers or saves directly via `curl -o filename.csv`.

#### Query Parameters:
Accepts identical parameters to `/api/search` (`city`, `query`, `source`, `limit`, `page`, `pages`).

#### Response Headers:
```http
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="delhi_caterers_all_leads.csv"
```

#### CSV Column Layout:
1. `Name`
2. `Phone`
3. `WhatsApp`
4. `WhatsApp_Link`
5. `Email`
6. `Contact_Person`
7. `Source`
8. `Rating`
9. `Reviews`
10. `Address`
11. `Area`
12. `City`
13. `Pincode`
14. `Website`
15. `Verified`
16. `Categories`
17. `URL`


#### Example Request:
```bash
curl -s -H "x-api-key: jd_sec_9b2e71f4" \
  "https://justdial-api.onrender.com/api/export/csv?city=Delhi&query=solar-panel&source=all&limit=100" \
  -o delhi_solar_leads.csv
```

---

### 5.6 Category Taxonomy Resolver (Justdial Specific)
```http
GET /api/resolve
```
Resolves an arbitrary keyword in a city into Justdial's internal Canonical National Category Taxonomy (`ncatid`), build ID, and sanitized URL slug.

#### Query Parameters:
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `city` | `string` | **Yes** | City name |
| `query` | `string` | **Yes** | Category keyword |

#### Response Example:
```json
{
  "success": true,
  "data": {
    "city": "Mumbai",
    "search": "Solar-Panel-Dealers",
    "ncatid": "10444071",
    "national_catid": "nct-10444071",
    "area": "",
    "buildId": "20092026"
  }
}
```

---

### 5.7 Query Normalizer & Intent Classifier Diagnostic
```http
GET /api/normalize
```
Diagnostic endpoint that previews how the engine sanitizes an incoming query, standardizes city aliases, and classifies commercial intent (`b2b_industrial`, `local_services`, or `general`).

#### Query Parameters:
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `city` | `string` | No | Raw city name (e.g. `Bengaluru`, `Bombay`, `NCR`) |
| `query` | `string` | **Yes** | Keyword or search query (e.g. `best wedding caterers near me`) |

#### Response Example:
```json
{
  "success": true,
  "input": {
    "city": "Bengaluru",
    "query": "best wedding caterers near me"
  },
  "normalized": {
    "city": "bangalore",
    "query": "wedding caterers",
    "intent": "local_services"
  }
}
```

---

## 6. Error Handling & HTTP Status Codes

The API employs standard HTTP status codes accompanied by detailed JSON error payloads:

```json
{
  "success": false,
  "error": "Human-readable description of error cause"
}
```

| HTTP Status | Error Type | Cause | Resolution |
| :--- | :--- | :--- | :--- |
| `400 Bad Request` | Missing Parameters | Required `city` or `query` parameter was omitted | Pass both `city` and `query` in the request |
| `401 Unauthorized`| Authentication Failed | Missing or invalid API key | Pass configured key in `x-api-key` header |
| `404 Not Found` | Unknown Route | Requested path does not match any route | Consult `/` or this documentation for valid routes |
| `429 Too Many Requests`| Rate Limited | Exceeded 60 requests per minute | Throttle requests or distribute across client workers |
| `500 Internal Error`| Upstream Failure | Upstream directory changed response or is unreachable | Try with another `source` or use `source=all` |

---

## 7. Client Integration Code Examples

### 7.1 Python (with Pandas DataFrame & Excel Export)
```python
import requests
import pandas as pd

API_KEY = "jd_sec_9b2e71f4"
BASE_URL = "https://justdial-api.onrender.com"

def fetch_leads(city: str, query: str, limit: int = 50, source: str = "all") -> pd.DataFrame:
    headers = {"x-api-key": API_KEY}
    params = {
        "city": city,
        "query": query,
        "source": source,
        "limit": limit
    }
    
    resp = requests.get(f"{BASE_URL}/api/search", headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    
    if not data.get("success"):
        raise RuntimeError(f"API Error: {data.get('error')}")
        
    leads = data.get("results", [])
    df = pd.DataFrame(leads)
    return df

# Example Usage
if __name__ == "__main__":
    df = fetch_leads(city="Delhi", query="caterers", limit=50)
    print(f"Collected {len(df)} leads. Sample:")
    print(df[["name", "phone", "whatsapp_link", "address", "primary_source"]].head())
    
    # Save directly to Excel for sales team
    df.to_excel("delhi_caterers.xlsx", index=False)
    print("Saved to delhi_caterers.xlsx")
```

---

### 7.2 Node.js / TypeScript (Native Fetch)
```typescript
interface Lead {
  name: string;
  phone: string;
  whatsapp: string;
  whatsapp_link: string;
  email: string;
  sources: string[];
  primary_source: string;
  rating: number | null;
  reviews: number;
  address: string;
  area: string;
  city: string;
  pincode: string;
  website: string;
  verified: boolean;
  categories: string[];
  url: string;
}

interface SearchResponse {
  success: boolean;
  city: string;
  query: string;
  total_deduplicated: number;
  results: Lead[];
}

async function getLeads(city: string, query: string, limit = 50): Promise<Lead[]> {
  const url = new URL("https://justdial-api.onrender.com/api/search");
  url.searchParams.set("city", city);
  url.searchParams.set("query", query);
  url.searchParams.set("source", "all");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString(), {
    headers: {
      "x-api-key": "jd_sec_9b2e71f4"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as SearchResponse;
  return data.results;
}

// Example call
getLeads("Bangalore", "solar-panel", 30).then(leads => {
  console.log(`Fetched ${leads.length} leads:`);
  for (const lead of leads) {
    console.log(`- ${lead.name} | ${lead.phone} | WA: ${lead.whatsapp_link}`);
  }
});
```

---

### 7.3 Dart / Flutter Mobile App Integration (with 1-Click WhatsApp Blast)
```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

class Lead {
  final String name;
  final String phone;
  final String whatsappLink;
  final String address;
  final String city;
  final String source;
  final bool verified;

  Lead({
    required this.name,
    required this.phone,
    required this.whatsappLink,
    required this.address,
    required this.city,
    required this.source,
    required this.verified,
  });

  factory Lead.fromJson(Map<String, dynamic> json) {
    return Lead(
      name: json['name'] ?? '',
      phone: json['phone'] ?? '',
      whatsappLink: json['whatsapp_link'] ?? '',
      address: json['address'] ?? '',
      city: json['city'] ?? '',
      source: json['primary_source'] ?? json['source'] ?? '',
      verified: json['verified'] ?? false,
    );
  }
}

class LeadApiService {
  static const String baseUrl = 'https://justdial-api.onrender.com';
  static const String apiKey = 'jd_sec_9b2e71f4';

  static Future<List<Lead>> searchLeads({
    required String city,
    required String query,
    String source = 'all',
    int limit = 50,
  }) async {
    final uri = Uri.parse('$baseUrl/api/search').replace(queryParameters: {
      'city': city,
      'query': query,
      'source': source,
      'limit': limit.toString(),
    });

    final res = await http.get(uri, headers: {
      'x-api-key': apiKey,
    });

    if (res.statusCode == 200) {
      final body = json.decode(res.body);
      final List results = body['results'] ?? [];
      return results.map((item) => Lead.fromJson(item)).toList();
    } else {
      throw Exception('Failed to load leads: ${res.statusCode}');
    }
  }

  /// Launch official WhatsApp app with pre-filled message template
  static Future<void> sendWhatsAppMessage({
    required String phone,
    required String message,
  }) async {
    final encodedMessage = Uri.encodeComponent(message);
    // Uses official whatsapp:// intent scheme to launch local app on Android/iOS
    final appUri = Uri.parse('whatsapp://send?phone=91$phone&text=$encodedMessage');
    final webUri = Uri.parse('https://wa.me/91$phone?text=$encodedMessage');

    if (await canLaunchUrl(appUri)) {
      await launchUrl(appUri);
    } else {
      await launchUrl(webUri, mode: LaunchMode.externalApplication);
    }
  }
}
```

---

## 8. Bulk Marketing & WhatsApp Campaign Recommendations

When using the Vyapar Leads API for automated or semi-automated digital marketing campaigns:

1. **Avoid Zero-Interval Automation:** Do not spam high-frequency messages through unofficial web sockets on fresh WhatsApp accounts.
2. **Utilize Native App Intents:** Launching via `whatsapp://send?phone=91...&text=...` opens the official WhatsApp application installed on Android or iOS. This utilizes the user's authentic session and is 100% free with zero risk of API account suspension.
3. **Deduplication:** Always use the returned 10-digit `phone` as a unique primary key in your local database (SQLite/Isar/Postgres) to avoid messaging the same merchant multiple times across different directory campaigns.
4. **Stagger Outgoing Batches:** For high-volume campaigns (e.g. 500+ merchants), send messages in staggered batches of 20-30 contacts with random 10-45 second pauses between dispatches. 
---

## 9. Relevancy Engine: Native Search & Category Slug Resolution

A core engineering hurdle in scraping commercial directories is that natural language queries (e.g. `"best wedding caterers near me in delhi"`) fail if a scraper blindly builds arbitrary URLs or guesses category slugs. 

To maintain 100% result relevancy, the Vyapar Leads engine uses a two-tier resolution architecture:

### 9.1 Query Sanitizer & City Normalizer
Before querying any platform, incoming search requests pass through normalization pipelines:
- **Canonical City Aliasing:** Standardizes common Indian vernacular city names and twin cities (e.g., `Bengaluru` → `Bangalore`, `Bombay` → `Mumbai`, `Gurugram` → `Gurgaon`, `Calcutta` → `Kolkata`, `Madras` → `Chennai`).
- **Modifier Stripping:** Automatically removes non-taxonomic search baggage such as `"best"`, `"top"`, `"cheap"`, `"emergency"`, `"near me"`, `"nearby"`, `"dealers in"`, `"services in"`, and repetitive city mentions.
- **Hyphen & Slugs Formatting:** Formats cleansed tokens for directory URL compatibility.

### 9.2 Directory Native Search & Dorking Resolvers

1. **Sulekha Native AutoSuggest API:**
   - **Endpoint:** `https://azsearch.sulekha.com/api/search/home-common-search-v2?cityName={city}&query={query}&wt=json`
   - Bypasses raw search scraping by directly consulting Sulekha's internal Solr/Elastic search index.
   - Extracts verified category URLs (e.g. `wedding-catering-services/delhi`) with category IDs (`catid`).
   - If `limit > 20`, queries matched subcategories to deliver deep, deduplicated pagination.

2. **Grotal Internal AutoSuggest Endpoint:**
   - **Endpoint:** `https://www.grotal.com/js/SearchAutoSuggest.ashx?txt={query}&city={cityId}&area=0&Country=1`
   - Resolves arbitrary keywords to Grotal's exact category slug (e.g., `solar panel` → `Solar-Panels`).
   - Paginates via Grotal's alphanumeric URL routing (`P1A0`, `P2A0`, etc.).
   - Gracefully detects ASP.NET boundaries (e.g. `FileNotFound.aspx` or zero business card blocks).

3. **Justdial Multi-Candidate NCT Resolver:**
   - Resolves keywords against Justdial's National Category Taxonomy (`ncatid`).
   - Evaluates multiple candidate variants (`{cleanQ}`, `{cleanQ}s`, `{cleanQ}-dealers`, `{cleanQ}-services`) to prevent `ncatid: null` failures.
   - Paginates via `page-1`, `page-2` query routes with instant deduplication by `docid` and `phone`.

4. **IndiaMART Free-form Search:**
   - Targets `https://m.indiamart.com/isearch.php?s={query}&cq={city}&page={page}`.
   - Extracts direct seller contact cards and filters out repeated sponsored cards across pages.

5. **TradeIndia SSR Next.js Hydration:**
   - Ingests `https://www.tradeindia.com/search.html?keyword={query}&city={city}&page={page}`.
   - Extracts structured SSR `__NEXT_DATA__` JSON with direct seller mobile contacts (`display_original_mobile`), GST, website, and business profiles.

---

## 10. Commercial Intent Classification & Smart Source Routing

To optimize discovery and guarantee that requests hit the highest-density directories first, the engine uses rule-based commercial intent detection:

### 10.1 Intent Classifications:
1. **`b2b_industrial`**:
   - **Trigger Keywords:** `manufacturer`, `factory`, `wholesaler`, `wholesale`, `supplier`, `exporter`, `distributor`, `industrial`, `fabrication`, `machinery`, `chemical`, `polymer`, `rubber`, `steel`, `pipes`, `valves`, `pumps`, `packaging`, `bulk`, `oem`, `raw materials`.
   - **Target Priority:** IndiaMART, TradeIndia, and Justdial.
   - **Characteristics:** Returns company profiles, factory contacts, direct mobile lines, GST numbers, and export market details.

2. **`local_services`**:
   - **Trigger Keywords:** `caterer`, `catering`, `wedding`, `event`, `photography`, `pest control`, `interior designer`, `repair`, `mechanic`, `plumber`, `electrician`, `packers`, `movers`, `cleaning`, `salon`, `spa`, `doctor`, `clinic`, `dentist`, `hospital`, `pet shop`, `vet`, `tuition`, `coaching`.
   - **Target Priority:** Justdial, Grotal, Sulekha.
   - **Characteristics:** Focuses on local customer reviews, star ratings, geographic street addresses, and instant WhatsApp chat.

3. **`general`**:
   - Default balanced multi-source sweep across all available directories.

