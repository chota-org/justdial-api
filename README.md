# Justdial REST API 🚀

A high-performance, reverse-engineered REST API for extracting verified Indian business leads from Justdial — with **unmasked phone numbers, ratings, review counts, full postal addresses, and WhatsApp contact details**.

Runs 100% **browserless** via lightweight Node.js HTTP/SSR data extraction. No Puppeteer, no Playwright, no Chromium, and zero headless browser overhead.

---

## ⚡ How It Works (The Reverse-Engineering)

Standard Justdial search routes (`https://www.justdial.com/{City}/{Category}`) apply Akamai Bot Manager JavaScript challenges and default to client-side rendering (CSR), masking phone numbers behind client-side OTP modals.

However, Justdial's underlying Next.js architecture maintains **Canonical National Category Taxonomy (NCT)** endpoints:
```text
https://www.justdial.com/{City}/{Category}/nct-{ncatid}?page={page}
```

When requested with standard browser navigation headers, Justdial's servers **fully pre-render and hydrate the complete business dataset into the Next.js `__NEXT_DATA__` state**. This contains:
- `VNumber`: The unmasked, direct contact phone number.
- `wpnumber`: Direct WhatsApp number where available.
- `name`: Verified business name.
- `NewAddress`: Complete physical street address.
- `compRating` & `totalReviews`: Customer rating & verified review count.
- `area`, `city`, `pincode`, `lat`, `lon`: Geocoding tags.
- `verified` & `paidStatus`: Justdial trust indicators.

This API acts as an automated resolver and harvester:
1. **Resolves** any arbitrary search query and city into the canonical `ncatid` via Next.js metadata.
2. **Paginates** through canonical NCT endpoints directly over HTTP GET.
3. **Normalizes, deduplicates, and validates** phone numbers into clean 10-digit mobile contacts ready for campaigns.

---

## 📡 API Endpoints

### 1. Search Leads
```http
GET /api/search?city={city}&query={query}&pages={pages}&limit={limit}
```

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `city` | string | **Yes** | — | Target city (e.g. `Mumbai`, `Delhi`, `Bangalore`, `Hyderabad`, `Pune`, `Chennai`) |
| `query` | string | **Yes** | — | Business category or keyword (e.g. `Caterers`, `Solar-Panel-Dealers`, `Packers-And-Movers`) |
| `pages` | number | No | `3` | Number of pages to paginate (1 to 10) |
| `limit` | number | No | `50` | Maximum deduplicated leads to return (1 to 200) |

#### Example Request:
```bash
curl "https://justdial-api.onrender.com/api/search?city=Mumbai&query=Solar-Panel-Dealers&pages=2&limit=20"
```

#### Example Response:
```json
{
  "success": true,
  "query": {
    "city": "Mumbai",
    "search": "Solar-Panel-Dealers",
    "ncatid": "10444071",
    "pages_requested": 2,
    "limit": 20
  },
  "meta": {
    "total_available": 100,
    "count": 20,
    "with_phone_count": 19,
    "with_whatsapp_count": 2
  },
  "results": [
    {
      "name": "Nalanda Inverter AIR Conditioner",
      "phone": "9845238940",
      "raw_phone": "09845238940",
      "whatsapp": null,
      "rating": 4.9,
      "reviews": 106,
      "address": "Near Suruchi Hotel Panvel",
      "area": "Mcch Society Panvel",
      "city": "Mumbai",
      "pincode": "410206",
      "lat": "18.9902",
      "lon": "73.1165",
      "verified": true,
      "paid": false,
      "categories": ["Solar Panel Dealers", "Inverter Dealers"],
      "docid": "022PXX22-XX22-190302143011-Y6F2",
      "url": "https://www.justdial.com/Navi-Mumbai/Nalanda-Inverter-AIR-Conditioner-Near-Suruchi-Hotel-Panvel/022PXX22-XX22-190302143011-Y6F2_BZDET"
    }
  ]
}
```

---

### 2. Export Directly as CSV
Directly download a CSV formatted file of leads for WhatsApp & Email campaigns:
```http
GET /api/export/csv?city={city}&query={query}&pages={pages}&limit={limit}
```

#### Example:
```bash
curl -o mumbai_solar_leads.csv "https://justdial-api.onrender.com/api/export/csv?city=Mumbai&query=Solar-Panel-Dealers&pages=3"
```

---

### 3. Category Metadata Resolver
Inspect the canonical `ncatid` and search routing for any keyword:
```http
GET /api/resolve?city={city}&query={query}
```

#### Example:
```bash
curl "https://justdial-api.onrender.com/api/resolve?city=Bangalore&query=Packers-And-Movers"
```

---

### 4. Health Check
```http
GET /health
```
Returns `{"status": "ok", "uptime": 124.5, "timestamp": "..."}`.

---

## 🐳 Docker Deployment

### Run with Docker:
```bash
# Build the Docker image
docker build -t justdial-api .

# Run the container
docker run -d -p 10000:10000 --name justdial-api justdial-api
```

### Run with Docker Compose:
```bash
docker compose up -d
```

Test the running container:
```bash
curl http://localhost:10000/health
curl "http://localhost:10000/api/search?city=Delhi&query=Caterers"
```

---

## 🛡️ Geo-Bypass: Proxy & Relay Architecture

Justdial uses Akamai Bot Manager at its edge perimeter, which blocks direct requests originating from foreign cloud datacenter IP ranges (AWS, GCP, Render US/SG) with HTTP 403 Forbidden.

This API includes native, dual-mode architectural support to run globally without blocks:

### 1. Upstream Proxy Support (`PROXY_URL` or `?proxy=`)
Configure any residential, datacenter, or mobile proxy (HTTP, HTTPS, or SOCKS5):
```bash
# In environment variable
export PROXY_URL="http://user:pass@proxy-server.com:port"

# Or on a per-request basis
curl "https://justdial-api.onrender.com/api/search?city=Mumbai&query=Caterers&proxy=http://proxy-server:port"
```
The scraper automatically utilizes `undici.ProxyAgent` with connection pooling.

### 2. Transparent Multi-Region Relay (`RELAY_URL` or `?relay=`)
When deployed to overseas cloud datacenters (like Render in Oregon or Singapore), the service can automatically route queries through an Indian bridge or local tunnel:
```bash
# Set in Render service environment
RELAY_URL="https://your-indian-relay.example.com"
```
When `RELAY_URL` is configured:
1. Render receives the request at `https://justdial-api.onrender.com`.
2. Render transparently forwards the request to the Indian relay.
3. The Indian relay executes the fast browserless SSR scrape directly from an Indian egress IP.
4. Clean JSON leads are returned back to the caller in ~2 seconds.

---

## 🛠️ Local Development
```bash
# Clone the repository
git clone https://github.com/chota-org/justdial-api.git
cd justdial-api

# Install dependencies
npm install

# Run unit tests
npm test

# Start development server with live reload
npm run dev
```

---

## ⚖️ License
MIT License. Created by [@chota-org](https://github.com/chota-org).
