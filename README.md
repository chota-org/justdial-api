# Vyapar Leads API 🇮🇳 🚀

High-performance, multi-platform business directory lead aggregator for India. Reverse-engineers and aggregates verified merchant contacts across **Justdial, IndiaMART, Grotal, TradeIndia, and Sulekha** — delivering **unmasked phone numbers, direct WhatsApp links, ratings, addresses, company websites, and trust badges**.

Runs **100% browserless** via lightweight Node.js HTTP/SSR data extraction. No Puppeteer, no Playwright, no Chromium, and zero headless browser overhead.

---

## ⚡ Supported Platforms & Reverse-Engineering

| Platform | Coverage | Phone Unmasking | Direct WhatsApp | Data Architecture | Datacenter Direct |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Justdial** | Local retail & services | ✅ Unmasked (VNumber) | ✅ Direct `wa.me` | Next.js SSR NCT Hydration | Via Relay / Proxy |
| **Grotal** | Local shops, caterers, services | ✅ Unmasked (10-digit) | ✅ Direct `wa.me` | Schema.org `LocalBusiness` JSON-LD | ✅ 100% Direct |
| **IndiaMART** | B2B, wholesale, manufacturers | ✅ Unmasked (`data-contact`) | ✅ Direct `wa.me` | Server-rendered Mobile Web cards | ✅ 100% Direct |
| **TradeIndia** | Manufacturers, exporters, traders | ⚠️ Profile-level / Domains | ⚠️ Company Website | Next.js SSR `__NEXT_DATA__` | ✅ 100% Direct |
| **Sulekha** | Local services, events, repairs | ✅ Unmasked (Direct lines) | ✅ Direct `wa.me` | Schema.org `ItemList` JSON-LD | Via Relay / Proxy |

---

## 📡 API Endpoints

### 1. Unified Multi-Platform Search
Search across multiple directories simultaneously or target specific platforms. Deduplicates by 10-digit phone number and cross-enriches company details.

```http
GET /api/search?city={city}&query={query}&source={source}&limit={limit}
```

#### Query Parameters:
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `city` | string | **Yes** | — | Target city (e.g. `Delhi`, `Mumbai`, `Bangalore`, `Pune`, `Jaipur`) |
| `query` | string | **Yes** | — | Business category or keyword (e.g. `Caterers`, `pet shop`, `solar panel`) |
| `source` | string | No | `all` | `all`, `justdial`, `grotal`, `indiamart`, `tradeindia`, `sulekha`, or comma-separated list |
| `limit` | number | No | `50` | Maximum deduplicated leads to return (1 to 200) |
| `page` | number | No | `1` | Specific page number |
| `api_key` | string | Conditional | — | API key (or pass via `x-api-key` header) if protection is enabled |

#### Example Request:
```bash
curl -H "x-api-key: jd_sec_9b2e71f4" \
  "https://justdial-api.onrender.com/api/search?source=all&city=Delhi&query=caterers&limit=50"
```

#### Example Response:
```json
{
  "success": true,
  "city": "Delhi",
  "query": "caterers",
  "requested_sources": ["grotal", "indiamart", "justdial", "tradeindia", "sulekha"],
  "sources_status": {
    "grotal": { "success": true, "count": 15 },
    "indiamart": { "success": true, "count": 10 },
    "tradeindia": { "success": true, "count": 15 },
    "sulekha": { "success": true, "count": 15 }
  },
  "total_deduplicated": 50,
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
    }
  ]
}
```

---

### 2. Export Directly as CSV Download
Instant spreadsheet export ready to import into WhatsApp bulk broadcast tools, Google Sheets, or CRMs.

```http
GET /api/export/csv?city={city}&query={query}&source={source}&limit={limit}
```

```bash
curl -s -H "x-api-key: jd_sec_9b2e71f4" \
  "https://justdial-api.onrender.com/api/export/csv?city=Delhi&query=solar-panel&source=all&limit=100" \
  -o delhi_solar_leads.csv
```

---

### 3. List Supported Sources
```http
GET /api/sources
```

Returns platform capabilities, unmasking status, and connection mode.

---

### 4. Health Check
```http
GET /health
```

---

## 🔒 Security & Protection

- **API Key Guard**: Enforced on `/api/*` endpoints via `x-api-key: YOUR_KEY` or `?api_key=YOUR_KEY`. Set `API_KEY` in environment variables.
- **Express Rate Limiting**: 60 requests/minute per IP window (configurable via `RATE_LIMIT_MAX`).
- **Helmet**: Hardened HTTP security headers.
- **Relay Support**: Automated routing via `RELAY_URL` for sources requiring an Indian residential/mobile IP.

---

## 🛠 Local Development & Docker

```bash
# Clone
git clone https://github.com/chota-org/justdial-api.git
cd justdial-api

# Install dependencies
npm install

# Run locally
API_KEY=your_secret_key npm start
```

### Docker
```bash
docker build -t vyapar-leads-api .
docker run -p 10000:10000 -e API_KEY=your_secret_key vyapar-leads-api
```

---

## 📱 Mobile App Integration (Flutter)

In your Flutter app (`goyim`):
```dart
final response = await http.get(
  Uri.parse('https://justdial-api.onrender.com/api/search?city=$city&query=$query&source=all&limit=100'),
  headers: {'x-api-key': apiKey},
);
// Each lead contains `whatsapp_link: "https://wa.me/91XXXXXXXXXX"`
// Launch with url_launcher: launchUrl(Uri.parse(lead.whatsappLink));
```

---

## 📄 License
MIT © chota-org
