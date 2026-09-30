import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { searchJustdial, resolveCategory } from './scraper/justdial.js';

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
  if (req.headers['user-agent'] === 'Justdial-API-Gateway/1.0') {
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
    name: 'Justdial REST API',
    description: 'High-performance reverse-engineered Justdial business directory lead API with unmasked phone numbers',
    version: '1.1.0',
    status: 'online',
    proxy_configured: !!(process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY),
    endpoints: {
      search: {
        method: 'GET',
        path: '/api/search',
        params: {
          city: 'Required. City name (e.g. Mumbai, Delhi, Bangalore)',
          query: 'Required. Category or business keyword (e.g. Caterers, pet-shop)',
          page: 'Optional. Specific page number to scrape (e.g. 1, 2, 3)',
          pages: 'Optional. Total number of pages to iterate (1 to 20, default: auto-calculated from limit)',
          limit: 'Optional. Maximum leads to return (1 to 200, default: 50. Automatically fetches enough pages)',
          proxy: 'Optional. HTTP/HTTPS/SOCKS5 proxy URL for datacenter unblocking'
        },
        example: '/api/search?city=Delhi&query=pet-shop&limit=100'
      },
      export_csv: {
        method: 'GET',
        path: '/api/export/csv',
        params: {
          city: 'Required. City name',
          query: 'Required. Category or business keyword',
          page: 'Optional. Starting page number',
          pages: 'Optional. Total number of pages to iterate',
          limit: 'Optional. Maximum leads to return (1 to 200. Automatically fetches enough pages for limit)',
          proxy: 'Optional. Proxy URL'
        },
        example: '/api/export/csv?city=Delhi&query=pet-shop&limit=100'
      },
      resolve: {
        method: 'GET',
        path: '/api/resolve',
        params: {
          city: 'City name',
          query: 'Category keyword',
          proxy: 'Optional. Proxy URL'
        },
        example: '/api/resolve?city=Bangalore&query=Packers-And-Movers'
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
    relay_configured: !!process.env.RELAY_URL
  });
});

// Resolve category & ncatid
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
  const ua = req.query.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
  
  const headers = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': req.query.lang || 'en-US,en;q=0.9',
    'Referer': req.query.referer || 'https://www.google.com/',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  if (req.query.cookie) {
    headers['Cookie'] = req.query.cookie;
  }
  
  // Forward any custom test headers
  for (const [key, val] of Object.entries(req.headers)) {
    if (key.startsWith('x-test-')) {
      headers[key.replace('x-test-', '')] = val;
    }
  }

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


// Primary Search API endpoint
app.get('/api/search', async (req, res) => {
  const { city, query, page, pages, limit, proxy, relay } = req.query;

  if (!city || !query) {
    return res.status(400).json({
      success: false,
      error: 'Missing required query parameters: "city" and "query". Example: /api/search?city=Mumbai&query=Caterers'
    });
  }

  // Support upstream Indian relay for cloud instances
  const targetRelay = relay || process.env.RELAY_URL;
  if (targetRelay) {
    try {
      const relayParams = new URLSearchParams({
        city,
        query,
        ...(page && { page }),
        ...(pages && { pages }),
        ...(limit && { limit }),
        ...(proxy && { proxy })
      });
      const relayUrl = `${targetRelay.replace(/\/+$/, '')}/api/search?${relayParams.toString()}`;
      const relayResp = await fetch(relayUrl, {
        headers: {
          'ngrok-skip-browser-warning': 'true',
          'User-Agent': 'Justdial-API-Gateway/1.0'
        },
        signal: AbortSignal.timeout(60000)
      });
      const data = await relayResp.json();
      return res.status(relayResp.status).json(data);
    } catch (relayErr) {
      console.warn(`[Relay Failed]: ${relayErr.message}. Falling back to direct scraper.`);
    }
  }

  try {
    const isRelayed = req.headers['user-agent'] === 'Justdial-API-Gateway/1.0';
    const result = await searchJustdial({
      city,
      query,
      page,
      pages,
      limit,
      proxy,
      _relayed: isRelayed
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

// Export directly as CSV download
app.get('/api/export/csv', async (req, res) => {
  const { city, query, page, pages, limit, proxy } = req.query;

  if (!city || !query) {
    return res.status(400).json({
      success: false,
      error: 'Missing required query parameters: "city" and "query"'
    });
  }

  try {
    const isRelayed = req.headers['user-agent'] === 'Justdial-API-Gateway/1.0';
    const { results } = await searchJustdial({
      city,
      query,
      page,
      pages,
      limit,
      proxy,
      _relayed: isRelayed
    });

    const headers = [
      'Name',
      'Phone',
      'WhatsApp',
      'WhatsApp_Link',
      'Email',
      'Rating',
      'Reviews',
      'Address',
      'Area',
      'City',
      'Pincode',
      'Latitude',
      'Longitude',
      'Verified',
      'Paid',
      'Categories',
      'DocID',
      'Justdial_URL'
    ];

    const rows = results.map(item => [
      escapeCsv(item.name),
      escapeCsv(item.phone),
      escapeCsv(item.whatsapp),
      escapeCsv(item.whatsapp_link),
      escapeCsv(item.email || 'N/A (JD Phone Directory)'),
      escapeCsv(item.rating),
      escapeCsv(item.reviews),
      escapeCsv(item.address),
      escapeCsv(item.area),
      escapeCsv(item.city),
      escapeCsv(item.pincode),
      escapeCsv(item.lat),
      escapeCsv(item.lon),
      escapeCsv(item.verified ? 'Yes' : 'No'),
      escapeCsv(item.paid ? 'Yes' : 'No'),
      escapeCsv(item.categories.join('; ')),
      escapeCsv(item.docid),
      escapeCsv(item.url)
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    const filename = `${city}_${query}_leads.csv`.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');

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

// Global 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found. Visit GET / for API documentation.'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Justdial API server running on port ${PORT}`);
});
