import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import {
  searchAllSources,
  searchSingleSource,
  resolveCategory,
  SOURCES
} from './scrapers/index.js';
import { normalizeCity, sanitizeQuery, detectIntent } from './utils/normalizer.js';
import { filterRelevantLeads } from './utils/relevanceFilter.js';

const app = express();
const PORT = process.env.PORT || 10000;

app.use(helmet({
  contentSecurityPolicy: false
}));
app.disable('x-powered-by');
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Rate Limiter: Protects against abuse, scraping loops & DoS
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10), // 60 requests/min default
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Rate limit exceeded: Too many requests from this IP. Please wait a minute.'
  }
});

// API Key Authentication Middleware
function authenticateApiKey(req, res, next) {
  const configuredKey = process.env.API_KEY;
  if (!configuredKey) {
    // If no API_KEY is set in environment, allow open access
    return next();
  }

  // Allow internal gateway communication between multi-region services
  if (req.headers['user-agent']?.includes('Vyapar-API-Gateway') || req.headers['user-agent']?.includes('Justdial-API-Gateway')) {
    return next();
  }

  const providedKey = 
    req.headers['x-api-key'] || 
    req.query.api_key || 
    (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : null);

  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid API key. Pass your key in the "x-api-key" header or "api_key" query parameter.'
    });
  }

  next();
}

// Apply rate limiting and security auth to /api routes
app.use('/api', apiLimiter);
app.use('/api', authenticateApiKey);

// Helper to escape CSV values
function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/"/g, '""');
  return /[,\n"]/.test(str) ? `"${str}"` : str;
}

// Root Documentation Route
app.get('/', (req, res) => {
  res.json({
    name: 'Vyapar Leads API',
    description: 'High-performance multi-platform business directory lead aggregator (Justdial, IndiaMART, Grotal, TradeIndia, Sulekha) with unmasked phone numbers and WhatsApp links',
    version: '2.0.0',
    status: 'online',
    supported_sources: Object.values(SOURCES),
    proxy_configured: !!(process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY),
    relay_configured: !!process.env.RELAY_URL,
    endpoints: {
      search: {
        method: 'GET',
        path: '/api/search',
        params: {
          city: 'Required. City name (e.g. Delhi, Mumbai, Bangalore, Hyderabad)',
          query: 'Required. Category or business keyword (e.g. Caterers, pet-shop, solar panel)',
          source: 'Optional. Single source or comma-separated list: "all", "justdial", "grotal", "indiamart", "tradeindia", "sulekha" (default: all)',
          limit: 'Optional. Maximum leads to return: integer (1 to 1000) or "max" / "all" to extract directory maximum (default: 50)',
          has_phone: 'Optional. Filter leads with valid 10-digit phone number: true/false',
          has_email: 'Optional. Filter leads with verified email address: true/false',
          has_contact: 'Optional. Filter leads with phone OR email (mutually exclusive contact): true/false',
          enrich_emails: 'Optional. Concurrently fetch merchant SSR detail pages for direct emails: true/false (default: true)',
          verified: 'Optional. Filter verified leads only: true/false',
          min_rating: 'Optional. Minimum star rating (e.g. 4.0)',
          page: 'Optional. Specific page number to query',
          pages: 'Optional. Number of pages to iterate per source'
        },
        example: '/api/search?source=all&city=Hyderabad&query=pet%20shops&limit=max'

      },
      export_csv: {
        method: 'GET',
        path: '/api/export/csv',
        params: {
          city: 'Required. City name',
          query: 'Required. Category or business keyword',
          source: 'Optional. Source name or "all"',
          limit: 'Optional. Maximum leads to export (default: 50)'
        },
        example: '/api/export/csv?source=all&city=Delhi&query=caterers&limit=100'
      },
      sources: {
        method: 'GET',
        path: '/api/sources',
        description: 'Lists all supported business directory sources and their capabilities'
      },
      health: {
        method: 'GET',
        path: '/health'
      }
    }
  });
});

// Health check endpoint for Render / monitoring
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    auth_required: !!process.env.API_KEY,
    rate_limit_max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
    proxy_configured: !!(process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY),
    relay_configured: !!process.env.RELAY_URL,
    sources_available: Object.keys(SOURCES)
  });
});

// List supported directory sources
app.get('/api/sources', (req, res) => {
  res.json({
    success: true,
    total: Object.keys(SOURCES).length,
    sources: Object.values(SOURCES)
  });
});

// Resolve category & ncatid (Justdial specific)
app.get('/api/resolve', async (req, res) => {
  const { city, query, proxy } = req.query;
  if (!city || !query) {
    return res.status(400).json({
      success: false,
      error: 'Missing required query parameters: "city" and "query"'
    });
  }

  try {
    const meta = await resolveCategory(city, query, proxy);
    res.json({
      success: true,
      data: meta
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Diagnostic / Debug endpoint to inspect upstream responses from Render
app.get('/api/debug', async (req, res) => {
  const targetUrl = req.query.url || 'https://www.justdial.com/Mumbai/Solar-Panel-Dealers';
  const ua = req.query.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  
  const headers = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': req.query.lang || 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...(req.query.xff && { 'X-Forwarded-For': req.query.xff }),
    ...(req.query.tcip && { 'True-Client-IP': req.query.tcip }),
    ...(req.query.cip && { 'Client-IP': req.query.cip })
  };

  try {
    const resp = await fetch(targetUrl, { headers });
    const respHeaders = {};
    for (const [k, v] of resp.headers.entries()) {
      respHeaders[k] = v;
    }
    const body = await resp.text();
    res.json({
      url: targetUrl,
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
      bodyPreview: body.slice(0, 1500)
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Primary Search API endpoint: Multi-platform or single platform
app.get('/api/search', async (req, res) => {
  const {
    city,
    query,
    source = 'all',
    page,
    pages,
    limit,
    proxy,
    relay,
    has_phone,
    has_email,
    has_contact,
    only_contacts,
    has_whatsapp,
    verified,
    verified_only,
    min_rating,
    enrich_emails
  } = req.query;

  if (!city || !query) {
    return res.status(400).json({
      success: false,
      error: 'Missing required query parameters: "city" and "query". Example: /api/search?city=Delhi&query=Caterers&source=all'
    });
  }

  const isRelayed = req.headers['user-agent']?.includes('Vyapar-API-Gateway') || req.headers['user-agent']?.includes('Justdial-API-Gateway');
  const filterOptions = {
    has_phone: has_phone === 'true',
    has_email: has_email === 'true',
    has_contact: has_contact === 'true' || only_contacts === 'true',
    only_contacts: has_contact === 'true' || only_contacts === 'true',
    has_whatsapp: has_whatsapp === 'true',
    verified_only: verified === 'true' || verified_only === 'true',
    min_rating: min_rating ? parseFloat(min_rating) : null,
    enrich_emails: enrich_emails !== 'false'
  };

  try {
    // If a specific individual source was requested
    if (source && source !== 'all' && !source.includes(',')) {
      const result = await searchSingleSource(source, {
        city,
        query,
        page,
        pages,
        limit,
        proxy,
        relay,
        _relayed: isRelayed,
        enrich_emails: filterOptions.enrich_emails,
        has_email: filterOptions.has_email
      });

      let resultsList = filterRelevantLeads(result.results || [], query);
      if (filterOptions.has_phone) {
        resultsList = resultsList.filter(l => l.phone && l.phone.length === 10);
      }
      if (filterOptions.has_email) {
        resultsList = resultsList.filter(l => l.email && l.email.includes('@'));
      }
      if (filterOptions.has_contact) {
        resultsList = resultsList.filter(l => (l.phone && l.phone.length === 10) || (l.email && l.email.includes('@')));
      }
      if (filterOptions.has_whatsapp) {
        resultsList = resultsList.filter(l => l.whatsapp && l.whatsapp.length === 10);
      }
      if (filterOptions.verified_only) {
        resultsList = resultsList.filter(l => l.verified);
      }
      if (filterOptions.min_rating) {
        resultsList = resultsList.filter(l => (l.rating || 0) >= filterOptions.min_rating);
      }

      const duration = result.execution_time_ms || result.meta?.execution_time_ms || 0;
      return res.json({
        success: true,
        ...result,
        total_results: resultsList.length,
        benchmark: {
          [source]: {
            count: resultsList.length,
            duration_ms: duration
          },
          total_duration_ms: duration
        },
        results: resultsList
      });
    }

    // Otherwise, execute multi-platform aggregator
    const result = await searchAllSources({
      city,
      query,
      source,
      page,
      pages,
      limit,
      proxy,
      relay,
      _relayed: isRelayed,
      ...filterOptions
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Specific platform search shortcuts
app.get('/api/:platform(justdial|grotal|indiamart|tradeindia|sulekha)/search', async (req, res) => {
  const { platform } = req.params;
  const { city, query, page, pages, limit, proxy, relay, enrich_emails, has_email, has_phone } = req.query;

  if (!city || !query) {
    return res.status(400).json({
      success: false,
      error: `Missing required query parameters: "city" and "query". Example: /api/${platform}/search?city=Delhi&query=caterers`
    });
  }

  const isRelayed = req.headers['user-agent']?.includes('Vyapar-API-Gateway') || req.headers['user-agent']?.includes('Justdial-API-Gateway');

  try {
    const result = await searchSingleSource(platform, {
      city,
      query,
      page,
      pages,
      limit,
      proxy,
      relay,
      _relayed: isRelayed,
      enrich_emails: enrich_emails !== 'false',
      has_email: has_email === 'true',
      has_phone: has_phone === 'true'
    });

    const duration = result.execution_time_ms || result.meta?.execution_time_ms || 0;
    const count = result.results?.length || result.total_results || 0;

    res.json({
      success: true,
      ...result,
      benchmark: {
        [platform]: {
          count,
          duration_ms: duration
        },
        total_duration_ms: duration
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});


// Unified Export directly as CSV download
app.get('/api/export/csv', async (req, res) => {
  const {
    city,
    query,
    source = 'all',
    page,
    pages,
    limit,
    proxy,
    relay,
    has_phone,
    has_email,
    has_contact,
    only_contacts,
    has_whatsapp,
    verified,
    verified_only,
    min_rating,
    enrich_emails
  } = req.query;

  if (!city || !query) {
    return res.status(400).json({
      success: false,
      error: 'Missing required query parameters: "city" and "query"'
    });
  }

  const filterOptions = {
    has_phone: has_phone === 'true',
    has_email: has_email === 'true',
    has_contact: has_contact === 'true' || only_contacts === 'true',
    only_contacts: has_contact === 'true' || only_contacts === 'true',
    has_whatsapp: has_whatsapp === 'true',
    verified_only: verified === 'true' || verified_only === 'true',
    min_rating: min_rating ? parseFloat(min_rating) : null,
    enrich_emails: enrich_emails !== 'false'
  };

  try {
    const isRelayed = req.headers['user-agent']?.includes('Vyapar-API-Gateway') || req.headers['user-agent']?.includes('Justdial-API-Gateway');
    let leads = [];

    if (source && source !== 'all' && !source.includes(',')) {
      const data = await searchSingleSource(source, {
        city,
        query,
        page,
        pages,
        limit,
        proxy,
        relay,
        _relayed: isRelayed,
        enrich_emails: filterOptions.enrich_emails,
        has_email: filterOptions.has_email
      });
      leads = data.results || [];
      if (filterOptions.has_phone) {
        leads = leads.filter(l => l.phone && l.phone.length === 10);
      }
      if (filterOptions.has_email) {
        leads = leads.filter(l => l.email && l.email.includes('@'));
      }
      if (filterOptions.has_contact) {
        leads = leads.filter(l => (l.phone && l.phone.length === 10) || (l.email && l.email.includes('@')));
      }
      if (filterOptions.has_whatsapp) {
        leads = leads.filter(l => l.whatsapp && l.whatsapp.length === 10);
      }
      if (filterOptions.verified_only) {
        leads = leads.filter(l => l.verified);
      }
      if (filterOptions.min_rating) {
        leads = leads.filter(l => (l.rating || 0) >= filterOptions.min_rating);
      }
    } else {
      const data = await searchAllSources({
        city,
        query,
        source,
        page,
        pages,
        limit,
        proxy,
        relay,
        _relayed: isRelayed,
        ...filterOptions
      });
      leads = data.results || [];
    }

    const headers = [
      'Name',
      'Phone',
      'WhatsApp',
      'WhatsApp_Link',
      'Email',
      'Contact_Person',
      'Source',
      'Rating',
      'Reviews',
      'Address',
      'Area',
      'City',
      'Pincode',
      'Website',
      'Verified',
      'Categories',
      'URL'
    ];

    const rows = leads.map(item => [
      escapeCsv(item.name),
      escapeCsv(item.phone),
      escapeCsv(item.whatsapp),
      escapeCsv(item.whatsapp_link),
      escapeCsv(item.email || ''),
      escapeCsv(item.contact_person || ''),
      escapeCsv(Array.isArray(item.sources) ? item.sources.join('; ') : (item.source || source)),
      escapeCsv(item.rating || ''),
      escapeCsv(item.reviews || ''),
      escapeCsv(item.address),
      escapeCsv(item.area),
      escapeCsv(item.city),
      escapeCsv(item.pincode),
      escapeCsv(item.website || ''),
      escapeCsv(item.verified ? 'Yes' : 'No'),
      escapeCsv(Array.isArray(item.categories) ? item.categories.join('; ') : (item.categories || '')),
      escapeCsv(item.url)
    ].join(','));


    const csvContent = [headers.join(','), ...rows].join('\n');
    const filename = `${city}_${query}_${source}_leads.csv`.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Diagnostic & Query Normalization endpoint
app.get('/api/normalize', (req, res) => {
  const { city = '', query = '' } = req.query;
  if (!query && !city) {
    return res.status(400).json({
      success: false,
      error: 'At least one of "city" or "query" parameter is required.'
    });
  }

  const normCity = normalizeCity(city);
  const cleanQ = sanitizeQuery(query, city);
  const intent = detectIntent(query);

  res.json({
    success: true,
    input: { city, query },
    normalized: {
      city: normCity,
      query: cleanQ,
      intent
    }
  });
});

// Global 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found. Visit GET / for API documentation.'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Vyapar Leads API server running on port ${PORT}`);
});
