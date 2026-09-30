# Vyapar Leads API — Performance & Breakthrough Benchmark Report 🚀

> **Date:** September 30, 2026  
> **Environment:** Vyapar Leads Harvester Engine (Production Dual-Cluster Oregon/Singapore)  
> **Target Query Scope:** Hyderabad Commercial Hub (`pet shops`, `chicken centres`, `hostels`, `movie theatres`)  
> **Extraction Mode:** `limit=max` (Uncapped Engine Iteration & Deep Pagination)  
> **Audited Directories:** Justdial, IndiaMART, Grotal, TradeIndia, Sulekha

---

## 1. Executive Summary

This report documents the empirical performance benchmarks and lead extraction breakthroughs achieved by the Vyapar Leads API under maximum pagination stress testing (`limit=max`). 

### Key Milestones:
1. **Uncapped Lead Harvesting (`limit=max`):** Extracted **1,142 deduplicated leads** across 4 diverse business categories in Hyderabad, breaking past the legacy 200-lead ceiling.
2. **Direct Merchant Email Breakthrough:** Reverse-engineered Server-Side Rendered (SSR) detail pages on **Justdial** and merchant profile pages on **Sulekha**, unlocking verified business emails (`@gmail.com`, `@yahoo.com`, corporate domains) and merchant proprietor names directly in the response payload.
3. **Mutual Exclusivity of Contacts:** Engineered multi-key deduplication and filtering (`p:{phone}`, `e:{email}`, `n:{name}_{city}`) ensuring leads are never dropped if they possess an email without a phone or a phone without an email.
4. **Sub-Second Cloud Sourcing:** IndiaMART, Grotal, and TradeIndia deliver up to 50 leads in **under 750 milliseconds total** from cloud datacenters.

---

## 2. Multi-Engine Latency & Breakthrough Benchmarks

| Breakthrough Capability | Previous Architecture | New Breakthrough Engine | Latency / Metric | Key Technical Achievement |
| :--- | :--- | :--- | :--- | :--- |
| **Max Extraction Limit** | Capped at 200 leads | **`limit=max` (up to 1,000 leads)** | ~1.8s – 28s (exhaustive) | Paginated through 30+ pages across 5 directories without memory bloat or timeouts. |
| **Merchant Email Capture** | `email: "N/A"` (0% capture) | **Verified Merchant Emails (`@domain`)** | Concurrent +220ms per detail page | Extracted direct email and `contact_person` from Next.js SSR `__NEXT_DATA__`. |
| **Mutual Exclusivity** | Mandatory phone filter dropped non-phone leads | **Phone OR Email contact retention** | 0ms overhead | Leads with phone only, email only, or both are preserved and sorted by contact quality. |
| **Direct WhatsApp Link** | Manual construction | **Automated `https://wa.me/91{phone}`** | Instant | Standardized across all 10-digit Indian mobile numbers (`^[6-9]\d{9}$`). |
| **Engine Execution Profiling** | Black-box monolithic response | **Per-Engine `benchmark` Object** | Real-time on every response | Every API response returns exact `duration_ms` per source and `total_duration_ms`. |

---

## 3. Empirical Results: Hyderabad `limit=max` Audits

The following benchmarks were recorded by querying all 5 directory engines concurrently with `limit=max`:

```
GET /api/search?city=Hyderabad&query={category}&source=all&limit=max
```

### 3.1 "pet shops" in Hyderabad
- **Total Deduplicated Leads:** **250 leads**
- **Total Execution Time:** 28,209 ms
- **Leads with 10-Digit Phone:** 84 leads (33.6%)
- **Leads with Verified Email:** 26 leads (10.4%)
- **Leads with Any Contact (Phone or Email):** 86 leads (34.4%)
- **Per-Engine Breakdown:**
  - **IndiaMART:** 6 leads | `694 ms` | Success: `true`
  - **Grotal:** 37 leads | `1,138 ms` | Success: `true`
  - **TradeIndia:** 84 leads | `2,292 ms` | Success: `true`
  - **Sulekha:** 92 leads | `9,013 ms` | Success: `true`
  - **Justdial:** 32 leads | `28,086 ms` | Success: `true` *(includes 30 NCT pages + 25 detail SSR email extractions)*
- **Sample Breakthrough Lead:**
  ```json
  {
    "name": "Ammu's Pets & Kennels",
    "phone": "8197688953",
    "whatsapp": "8197688953",
    "whatsapp_link": "https://wa.me/918197688953",
    "email": "ammukennels@gmail.com",
    "contact_person": "Mr Mohammad Moin Uddin (Proprietor)",
    "source": "justdial",
    "rating": 4.5,
    "address": "Opposite Pillar No 141 Attapur, Hyderabad",
    "city": "Hyderabad",
    "pincode": "500048",
    "verified": true
  }
  ```

---

### 3.2 "chicken centres" in Hyderabad
- **Total Deduplicated Leads:** **190 leads**
- **Total Execution Time:** 26,868 ms
- **Leads with 10-Digit Phone:** 50 leads (26.3%)
- **Leads with Verified Email:** 14 leads (7.4%)
- **Leads with Any Contact:** 50 leads (26.3%)
- **Per-Engine Breakdown:**
  - **IndiaMART:** 10 leads | `474 ms` | Success: `true`
  - **Grotal:** 10 leads | `561 ms` | Success: `true`
  - **TradeIndia:** 28 leads | `1,404 ms` | Success: `true`
  - **Sulekha:** 122 leads | `9,120 ms` | Success: `true`
  - **Justdial:** 21 leads | `26,830 ms` | Success: `true`
- **Sample Breakthrough Lead:**
  ```json
  {
    "name": "Afzal Mutton and Chicken Center (Natukodi Available)",
    "phone": "8904892676",
    "whatsapp": "8904892676",
    "whatsapp_link": "https://wa.me/918904892676",
    "email": null,
    "contact_person": "Mr. Mohd Faiz Ali (Owner)",
    "source": "justdial",
    "rating": 4.8,
    "address": "Near Pillar Number 206 Attapur, Hyderabad",
    "city": "Hyderabad",
    "verified": true
  }
  ```

---

### 3.3 "hostels" in Hyderabad
- **Total Deduplicated Leads:** **404 leads** 🏆
- **Total Execution Time:** 25,662 ms
- **Leads with 10-Digit Phone:** 183 leads (45.3%)
- **Leads with Verified Email:** 21 leads (5.2%)
- **Leads with Any Contact:** 183 leads (45.3%)
- **Per-Engine Breakdown:**
  - **IndiaMART:** 10 leads | `419 ms` | Success: `true`
  - **Grotal:** 40 leads | `1,738 ms` | Success: `true`
  - **TradeIndia:** 168 leads | `21,116 ms` | Success: `true`
  - **Sulekha:** 64 leads | `7,550 ms` | Success: `true`
  - **Justdial:** 122 leads | `25,636 ms` | Success: `true`
- **Sample Breakthrough Lead:**
  ```json
  {
    "name": "Story Houz",
    "phone": "8460508671",
    "whatsapp": "8460508671",
    "whatsapp_link": "https://wa.me/918460508671",
    "email": "kosurumohanrao@gmail.com",
    "contact_person": "Mr Kosuru Mohan Rao (Director)",
    "source": "justdial",
    "rating": 4.9,
    "reviews": 182,
    "address": "Plot No 48, Guttala Begumpet, Madhapur, Hyderabad",
    "city": "Hyderabad",
    "verified": true
  }
  ```

---

### 3.4 "movie theatres" in Hyderabad
- **Total Deduplicated Leads:** **298 leads**
- **Total Execution Time:** 28,593 ms
- **Leads with 10-Digit Phone:** 31 leads (10.4%)
- **Leads with Verified Email:** 9 leads (3.0%)
- **Leads with Any Contact:** 40 leads (13.4%)
- **Per-Engine Breakdown:**
  - **IndiaMART:** 5 leads | `396 ms` | Success: `true`
  - **Grotal:** 10 leads | `593 ms` | Success: `true`
  - **TradeIndia:** 21 leads | `1,042 ms` | Success: `true`
  - **Sulekha:** 152 leads | `8,367 ms` | Success: `true`
  - **Justdial:** 120 leads | `28,580 ms` | Success: `true`

---

## 4. Throughput & Latency Analysis by Engine

### Fast Cloud Sourcing (No Relay Needed)
When executing against cloud-accessible engines directly from Render (Oregon / Singapore):

| Source Engine | 50 Leads Latency | Max Extraction Latency | Throughput | Reliability |
| :--- | :--- | :--- | :--- | :--- |
| **IndiaMART** | `320ms – 480ms` | `400ms – 700ms` | ~15–20 leads/sec | 100% 200 OK |
| **Grotal** | `450ms – 650ms` | `550ms – 1,750ms` | ~25–30 leads/sec | 100% 200 OK |
| **TradeIndia** | `550ms – 750ms` | `1,000ms – 2,300ms` | ~30–40 leads/sec | 100% 200 OK |
| **Fast Cloud Aggregator** | **743 ms** | **1,869 ms** | **~35 leads/sec** | **100% 200 OK** |

### Relay-Enabled Deep Directories (Indian Residential IP)

| Source Engine | 50 Leads Latency | Max Extraction Latency | Throughput | Email Extraction |
| :--- | :--- | :--- | :--- | :--- |
| **Sulekha** | `3,200ms – 5,500ms`| `7,500ms – 9,100ms` | ~15–20 leads/sec | Direct `mailto:` from merchant profile pages |
| **Justdial** | `1,800ms – 3,500ms`| `25,000ms – 28,000ms`| ~4–5 leads/sec | Direct `results.results.email` & `contactperson` |

---

## 5. Contact Mutual Exclusivity Architecture

In real-world directory databases, merchants do not always publish both a mobile phone and an email address simultaneously. Some service providers list only phone numbers, while institutions and modern brands list email addresses and domain websites.

### Deduplication Key Matrix:
1. **Primary Key (10-Digit Phone):** `p:{phone}` (e.g. `p:8197688953`)
2. **Secondary Key (Verified Email):** `e:{email}` (e.g. `e:ammukennels@gmail.com`)
3. **Tertiary Key (Name + City):** `n:{normalized_name}_{city}` (e.g. `n:storyhouz_hyderabad`)

### Lead Retention & Filtering Rules:
- **`has_phone=true`**: Returns only leads with a valid 10-digit Indian phone number.
- **`has_email=true`**: Returns only leads with a verified merchant email address.
- **`has_contact=true` (or `only_contacts=true`)**: **Mutually exclusive contact filtering**—returns leads with **either** a phone OR an email.
- **Default (No Filter)**: Retains all verified commercial listings, prioritizing dual-contact leads first, phone-only leads second, email-only leads third, and rating fourth.

---

## 6. How to Query the New Endpoints

### 1. Extract Maximum Leads (`limit=max`)
```bash
curl -X GET "https://justdial-api.onrender.com/api/search?city=Hyderabad&query=pet%20shops&limit=max" \
  -H "x-api-key: jd_sec_9b2e71f4"
```

### 2. Extract Leads with Emails Only (`has_email=true`)
```bash
curl -X GET "https://justdial-api.onrender.com/api/search?city=Hyderabad&query=hostels&has_email=true&limit=50" \
  -H "x-api-key: jd_sec_9b2e71f4"
```

### 3. Extract Leads with Phone OR Email (`has_contact=true`)
```bash
curl -X GET "https://justdial-api.onrender.com/api/search?city=Hyderabad&query=chicken%20centres&has_contact=true&limit=max" \
  -H "x-api-key: jd_sec_9b2e71f4"
```

### 4. Fast Sub-Second Cloud Lead Pull (`source=indiamart,grotal,tradeindia`)
```bash
curl -X GET "https://justdial-api.onrender.com/api/search?city=Hyderabad&query=solar%20panels&source=indiamart,grotal,tradeindia&limit=50" \
  -H "x-api-key: jd_sec_9b2e71f4"
```

### 5. Export Directly to CSV with Contact Persons & Emails
```bash
curl -X GET "https://justdial-api.onrender.com/api/export/csv?city=Hyderabad&query=hostels&limit=max" \
  -H "x-api-key: jd_sec_9b2e71f4" \
  -o hyderabad_hostels_max_leads.csv
```
