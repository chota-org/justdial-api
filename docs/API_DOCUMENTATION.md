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
  "email": "N/A",
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
| `email` | `string` | Merchant contact email if published, or `'N/A'`. |
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
      "description": "Major B2B directory with verified manufacturers, exporters, private domain websites, and GST details",
      "unmasked_phones": false,
      "whatsapp_ready": false,
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
| `limit` | `number` | No | `50` | Maximum deduplicated leads to return (1 to 200). Auto-paginates upstream pages to fulfill requested quota. |
| `page` | `number` | No | `1` | Specific single page number to fetch (disables auto-pagination). |
| `pages` | `number` | No | Auto | Explicit number of pages to iterate per platform (1 to 10). |

#### Request Example:
```bash
curl -s -H "x-api-key: jd_sec_9b2e71f4" \
  "https://justdial-api.onrender.com/api/search?city=Delhi&query=caterers&source=all&limit=20"
```

#### Response Example (`200 OK`):
```json
{
  "success": true,
  "city": "Delhi",
  "query": "caterers",
  "requested_sources": ["grotal", "indiamart", "justdial", "tradeindia", "sulekha"],
  "sources_status": {
    "grotal": { "success": true, "count": 6 },
    "indiamart": { "success": true, "count": 5 },
    "justdial": { "success": true, "count": 5 },
    "tradeindia": { "success": true, "count": 4 },
    "sulekha": { "success": true, "count": 0 }
  },
  "total_deduplicated": 20,
  "results": [
    {
      "name": "Puri Tent and Caterers",
      "phone": "9871004420",
      "whatsapp": "9871004420",
      "whatsapp_link": "https://wa.me/919871004420",
      "email": "N/A",
      "sources": ["grotal"],
      "primary_source": "grotal",
      "rating": null,
      "reviews": 0,
      "address": "Karol Bagh, Delhi, Delhi",
      "area": "Karol Bagh",
      "city": "Delhi",
      "pincode": "",
      "website": "",
      "verified": true,
      "categories": ["caterers"],
      "url": "https://www.grotal.com/Delhi/Caterers-C44A0P1A0/"
    },
    {
      "name": "Aggarwal Sweets & Bakers",
      "phone": "8511347623",
      "whatsapp": "8511347623",
      "whatsapp_link": "https://wa.me/918511347623",
      "email": "N/A",
      "sources": ["justdial"],
      "primary_source": "justdial",
      "rating": 3.9,
      "reviews": 360,
      "address": "Near Jaipuria Mall Indirapuram",
      "area": "Jaipuria Sunrise Plaza Indirapuram",
      "city": "delhi",
      "pincode": "201014",
      "website": "",
      "verified": true,
      "categories": ["Caterers", "Caterers For Wedding"],
      "url": "https://www.justdial.com/Ghaziabad/Aggarwal-Sweets-Bakers-Near-Jaipuria-Mall-Indirapuram/011PXX11-XX11-140519145926-K1R5_BZDET"
    }
  ]
}
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
6. `Source`
7. `Rating`
8. `Reviews`
9. `Address`
10. `Area`
11. `City`
12. `Pincode`
13. `Website`
14. `Verified`
15. `Categories`
16. `URL`

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
