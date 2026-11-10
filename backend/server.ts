import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { ADMIN_SESSION_COOKIE, createAdminSession, isAdminSessionValid, safeTextEqual } from './src/security/AdminAuth';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { pack, unpack } from 'msgpackr';

import { priceStore } from './src/services/PriceStore';
import { detectionEngine } from './src/services/DetectionEngine';
import { db } from './src/services/Database';
import { orderBookService } from './src/services/OrderBookService';
import { sentimentEngine } from './src/services/SentimentEngine';
import type { Candle, MarketDataSource, QuotexMarketType } from './src/types';
import { ResearchStore } from './src/services/ResearchStore';
import { HistoricalResearchService } from './src/services/HistoricalResearchService';
import { PersistentPaperTradingService } from './src/services/PersistentPaperTradingService';
import { PaperTradingEngine, type PaperTradingOptions } from './src/services/PaperTradingEngine';
import { MarketDataFeedService } from './src/services/MarketDataFeedService';
import { HistoricalCandleService } from './src/services/HistoricalCandleService';

// Initialize exchanges
import './src/exchanges/Binance';
import './src/exchanges/Coinbase';
import './src/exchanges/Uniswap';

const app = express();
const adminPassword = process.env.ADMIN_PASSWORD ?? '';
const sessionSecret = process.env.SESSION_SECRET ?? '';
if (adminPassword.length < 16 || sessionSecret.length < 32) throw new Error('ADMIN_PASSWORD (16+ chars) and SESSION_SECRET (32+ chars) are required');
app.disable('x-powered-by');
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => console.log(JSON.stringify({ level: 'info', event: 'http_request', method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started })));
  next();
});
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map(origin => origin.trim()).filter(Boolean);
if (allowedOrigins.includes('*')) throw new Error('Wildcard CORS origins are not allowed with administrator sessions');
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS'));
}, credentials: false }));
app.use(express.json({ limit: '2mb' }));
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const requestIsSecure = (req: express.Request) => req.secure || req.headers['x-forwarded-proto'] === 'https';
const requestOriginAllowed = (req: express.Request) => {
  const origin = req.headers.origin;
  return typeof origin === 'string' && allowedOrigins.includes(origin);
};
const sessionCookie = (token: string, req: express.Request) =>
  ADMIN_SESSION_COOKIE + '=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800' + (requestIsSecure(req) ? '; Secure' : '');

app.get('/api/auth/session', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ authenticated: isAdminSessionValid(req.headers.cookie, sessionSecret) });
});
app.post('/api/auth/login', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!requestOriginAllowed(req)) return res.status(403).json({ error: 'Origin not allowed' });
  const ip = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 5) {
    res.setHeader('Retry-After', String(Math.ceil((attempt.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }
  if (!attempt || attempt.resetAt <= now) {
    for (const [key, value] of loginAttempts) if (value.resetAt <= now) loginAttempts.delete(key);
    if (!loginAttempts.has(ip) && loginAttempts.size >= 10000) loginAttempts.delete(loginAttempts.keys().next().value!);
    loginAttempts.set(ip, { count: 1, resetAt: now + 900000 });
  }
  else attempt.count += 1;
  const supplied = typeof req.body?.password === 'string' ? req.body.password : '';
  if (supplied.length > 1024 || !safeTextEqual(adminPassword, supplied)) return res.status(401).json({ error: 'Invalid administrator password' });
  loginAttempts.delete(ip);
  res.setHeader('Set-Cookie', sessionCookie(createAdminSession(sessionSecret), req));
  return res.json({ authenticated: true });
});
app.post('/api/auth/logout', (req, res) => {
  if (!requestOriginAllowed(req)) return res.status(403).json({ error: 'Origin not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', ADMIN_SESSION_COOKIE + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + (requestIsSecure(req) ? '; Secure' : ''));
  return res.json({ authenticated: false });
});
app.use('/api', (req, res, next) => {
  if (!isAdminSessionValid(req.headers.cookie, sessionSecret)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !requestOriginAllowed(req)) return res.status(403).json({ error: 'Origin not allowed' });
  next();
});


const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1 * 1024 * 1024, perMessageDeflate: false, verifyClient: (info, done) => { const origin = info.origin; const originAllowed = typeof origin === 'string' && allowedOrigins.includes(origin); done(originAllowed && isAdminSessionValid(info.req.headers.cookie, sessionSecret), originAllowed ? 401 : 403, 'Authentication required'); } });
const marketDataFeed = new MarketDataFeedService();
const researchStore = new ResearchStore(process.env.RESEARCH_DB_PATH);
const historicalCandles = new HistoricalCandleService(researchStore);

let currentSignals: any[] = [];
const clients: Set<WebSocket> = new Set();
const heartbeatTimer = setInterval(() => {
  for (const client of clients) {
    const peer = client as WebSocket & { isAlive?: boolean };
    if (peer.isAlive === false) { client.terminate(); clients.delete(client); continue; }
    peer.isAlive = false;
    client.ping();
  }
}, 30_000);
heartbeatTimer.unref();

// Binary MessagePack broadcast — ~60–80% smaller than JSON
const broadcast = (message: any) => {
  const payload = pack(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      if (client.bufferedAmount > 1 * 1024 * 1024) { client.terminate(); clients.delete(client); continue; }
      client.send(payload);
    }
  }
};

// ── Event Wiring ───────────────────────────────────────────────

// 1. Price updates → broadcast binary
priceStore.on('price_update', (update) => {
  broadcast({ type: 'PRICE_UPDATE', data: update });
});

// 2. Detection signals → persist + broadcast
detectionEngine.on('signal', (sig) => {
  currentSignals.unshift(sig);
  if (currentSignals.length > 50) currentSignals.pop();
  broadcast({ type: 'SIGNAL_UPDATE', data: sig });
  if (sig.type === 'EXECUTION') {
    broadcast({ type: 'PNL_UPDATE', data: detectionEngine.totalPnl });
  }
});

// 3. Order Book updates → broadcast binary (high-freq, no persist needed)
orderBookService.on('orderbook_update', (book) => {
  broadcast({ type: 'ORDERBOOK_UPDATE', data: book });
});

// 4. Read-only public market feed → broadcast provenance-tagged ticks/candles
marketDataFeed.on('tick', tick => broadcast({ type: 'MARKET_TICK', data: tick }));
marketDataFeed.on('candle', candle => broadcast({ type: 'MARKET_CANDLE', data: candle }));
marketDataFeed.on('closed_candle', candle => broadcast({ type: 'MARKET_CANDLE_CLOSED', data: candle }));
marketDataFeed.on('candle_gap', gap => broadcast({ type: 'MARKET_CANDLE_GAP', data: gap }));
marketDataFeed.on('status', status => broadcast({ type: 'MARKET_FEED_STATUS', data: status }));

// 5. Sentiment updates → broadcast binary
sentimentEngine.on('sentiment_update', (sentiment) => {
  broadcast({ type: 'SENTIMENT_UPDATE', data: sentiment });
});

// ── WebSocket Connections ──────────────────────────────────────
wss.on('connection', (ws) => {
  clients.add(ws);
  const peer = ws as WebSocket & { isAlive?: boolean };
  peer.isAlive = true;
  ws.on('pong', () => { peer.isAlive = true; });
  console.log('[WS] Client connected');

  // Send initial state as binary MessagePack
  ws.send(pack({
    type: 'INIT_STATE',
    data: {
      prices: priceStore.getPrices(),
      signals: currentSignals,
      pnl: detectionEngine.totalPnl,
      sentiment: sentimentEngine.getSentiment(),
      marketFeed: marketDataFeed.getStatus(),
    }
  }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log('[WS] Client disconnected');
  });
});

// ── REST API ───────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()), marketFeed: marketDataFeed.getStatus() });
});

app.get('/ready', (_req, res) => {
  const researchDb = researchStore.healthCheck();
  const coreDb = db.healthCheck();
  const ready = researchDb.ok && coreDb;
  res.status(ready ? 200 : 503).json({ ready, databases: { research: researchDb, core: { ok: coreDb } } });
});

app.get('/api/market/candles', async (req, res) => {
  try {
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : '';
    const limit = req.query.limit === undefined ? 300 : Number(req.query.limit);
    const endTime = req.query.endTime === undefined ? undefined : Number(req.query.endTime);
    const result = await historicalCandles.getOneMinuteCandles(symbol, limit, endTime);
    res.json(result);
  } catch (error) { apiError(res, error); }
});

app.get('/api/market/candles/archive', (req, res) => {
  try {
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : '';
    const marketType = req.query.marketType;
    const source = req.query.source;
    if (marketType !== 'LIVE' || source !== 'PROVIDER_API') throw new Error('Archive chart query is restricted to LIVE / PROVIDER_API data');
    const startTime = req.query.startTime === undefined ? undefined : Number(req.query.startTime);
    const endTime = req.query.endTime === undefined ? undefined : Number(req.query.endTime);
    if ((startTime !== undefined && !Number.isFinite(startTime)) || (endTime !== undefined && !Number.isFinite(endTime)) || (startTime !== undefined && endTime !== undefined && startTime > endTime)) throw new Error('Invalid archive time range');
    const candles = researchStore.getCandles({ symbol, marketType: 'LIVE', source: 'PROVIDER_API', startTime, endTime });
    res.json({ symbol, marketType: 'LIVE', source: 'PROVIDER_API', timeframe: '1m', candles, count: candles.length, persistent: true });
  } catch (error) { apiError(res, error); }
});

app.get('/api/market/feeds', (_req, res) => {
  res.json({
    feeds: [marketDataFeed.getStatus()],
    note: 'Binance public spot feed is LIVE crypto data; it is not a Quotex OTC quote feed.'
  });
});

app.get('/api/settings', (req, res) => {
  res.json(detectionEngine.settings);
});

app.post('/api/settings', (req, res) => {
  const newSettings = req.body;
  detectionEngine.updateSettings(newSettings);
  res.json({ success: true, settings: detectionEngine.settings });
});

app.get('/api/sentiment', (req, res) => {
  res.json(sentimentEngine.getSentiment());
});


// ── Research / Backtest / Paper Trading API (virtual only) ──────
const historicalResearch = new HistoricalResearchService(researchStore);
const paperSessions = new Map<string, PersistentPaperTradingService>();
const validMarket = (v: unknown): v is QuotexMarketType => v === 'LIVE' || v === 'OTC';
const validSource = (v: unknown): v is MarketDataSource =>
  v === 'PROVIDER_API' || v === 'QUOTEX_WEBSOCKET' || v === 'UNISWAP_RPC' || v === 'SIMULATED';
const parseStream = (body: any) => {
  if (!body || typeof body.symbol !== 'string' || !body.symbol.trim() ||
      !validMarket(body.marketType) || !validSource(body.source)) {
    throw new Error('stream must include symbol, marketType (LIVE/OTC), and source');
  }
  return { symbol: body.symbol.trim(), marketType: body.marketType, source: body.source };
};
const apiError = (res: express.Response, error: unknown) =>
  res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });

app.post('/api/research/import-csv', (req, res) => {
  try {
    if (typeof req.body?.csv !== 'string') throw new Error('csv must be a string');
    const result = historicalResearch.importCsv(req.body.csv, parseStream(req.body.stream));
    res.status(201).json({ imported: result.rowsRead, firstOpenTime: result.firstOpenTime, lastOpenTime: result.lastOpenTime, stream: req.body.stream });
  } catch (error) { apiError(res, error); }
});
app.post('/api/research/backtests', (req, res) => {
  try {
    const result = historicalResearch.runBacktest(parseStream(req.body?.stream), req.body?.options ?? {});
    res.status(201).json(result);
  } catch (error) { apiError(res, error); }
});
app.get('/api/research/backtests/:reportId', (req, res) => {
  const report = researchStore.getBacktestReport(req.params.reportId);
  if (!report) return res.status(404).json({ error: 'Backtest report not found' });
  res.json({ reportId: req.params.reportId, report });
});
app.post('/api/paper/sessions', (req, res) => {
  try {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    if (!sessionId || sessionId.length > 128) throw new Error('sessionId is required (max 128 characters)');
    if (req.body?.options && typeof req.body.options !== 'object') throw new Error('options must be an object');
    const existing = researchStore.getPaperSession(sessionId);
    const service = existing
      ? new PersistentPaperTradingService(sessionId, researchStore)
      : new PersistentPaperTradingService(sessionId, researchStore, new PaperTradingEngine(req.body?.options ?? {}));
    if (existing && req.body?.options &&
        JSON.stringify(req.body.options) !== JSON.stringify(service.getOptions())) {
      throw new Error('Requested options do not match the existing paper session');
    }
    paperSessions.set(sessionId, service);
    res.status(existing ? 200 : 201).json({
      sessionId, recovered: Boolean(existing && researchStore.getPaperCandles(sessionId).length),
      snapshot: service.getSnapshot()
    });
  } catch (error) { apiError(res, error); }
});
app.get('/api/paper/sessions/:sessionId', (req, res) => {
  const session = researchStore.getPaperSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Paper session not found' });
  res.json({ ...session, trades: researchStore.getPaperTrades(req.params.sessionId) });
});
app.post('/api/paper/sessions/:sessionId/candles', (req, res) => {
  try {
    let service = paperSessions.get(req.params.sessionId);
    if (!service) {
      if (!researchStore.getPaperSession(req.params.sessionId)) return res.status(404).json({ error: 'Paper session not found; create it first' });
      service = new PersistentPaperTradingService(req.params.sessionId, researchStore);
      paperSessions.set(req.params.sessionId, service);
    }
    const update = service.processCandle(req.body as Candle);
    res.json({ update, snapshot: service.getSnapshot() });
  } catch (error) { apiError(res, error); }
});
app.post('/api/paper/sessions/:sessionId/reset', (req, res) => {
  try {
    let service = paperSessions.get(req.params.sessionId);
    if (!service) {
      if (!researchStore.getPaperSession(req.params.sessionId)) return res.status(404).json({ error: 'Paper session not found' });
      service = new PersistentPaperTradingService(req.params.sessionId, researchStore);
      paperSessions.set(req.params.sessionId, service);
    }
    service.reset();
    res.json({ sessionId: req.params.sessionId, snapshot: service.getSnapshot() });
  } catch (error) { apiError(res, error); }
});

// ── Bootstrap (better-sqlite3 is synchronous — no async needed) ─
const PORT = process.env.PORT || 3001;

// Restore persisted state from SQLite immediately
detectionEngine.totalPnl = db.getPersistedPnl();
const recentSignals = db.getRecentSignals(50);
currentSignals.push(...recentSignals);
console.log(`[DB] Loaded ${recentSignals.length} historical signals, PNL: $${detectionEngine.totalPnl.toFixed(2)}`);

const shutdown = (signal: string) => {
  console.log(`[Shutdown] ${signal} received; closing services`);
  marketDataFeed.stop();
  clearInterval(heartbeatTimer);
  for (const client of clients) client.close(1001, 'Server shutting down');
  wss.close();
  const forceExitTimer = setTimeout(() => process.exit(1), 10_000);
  forceExitTimer.unref();
  server.close(() => {
    clearTimeout(forceExitTimer);
    researchStore.close();
    db.close();
    process.exit(0);
  });
  // Close idle HTTP keep-alive sockets so shutdown cannot wait indefinitely.
  server.closeAllConnections();
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

server.listen(Number(PORT), () => {
  marketDataFeed.start();
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : PORT;
  console.log(`[HTTP] Server running on port ${actualPort}`);
  console.log(`[WS]  Binary MessagePack WebSocket on port ${actualPort}`);
});

