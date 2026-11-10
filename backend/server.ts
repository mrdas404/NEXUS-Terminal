import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
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

// Initialize exchanges
import './src/exchanges/Binance';
import './src/exchanges/Coinbase';
import './src/exchanges/Uniswap';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const marketDataFeed = new MarketDataFeedService();

let currentSignals: any[] = [];
const clients: Set<WebSocket> = new Set();

// Binary MessagePack broadcast — ~60–80% smaller than JSON
const broadcast = (message: any) => {
  const payload = pack(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
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
marketDataFeed.on('status', status => broadcast({ type: 'MARKET_FEED_STATUS', data: status }));

// 5. Sentiment updates → broadcast binary
sentimentEngine.on('sentiment_update', (sentiment) => {
  broadcast({ type: 'SENTIMENT_UPDATE', data: sentiment });
});

// ── WebSocket Connections ──────────────────────────────────────
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('[WS] Client connected');

  // Send initial state as binary MessagePack
  ws.send(pack({
    type: 'INIT_STATE',
    data: {
      prices: priceStore.getPrices(),
      signals: currentSignals,
      pnl: detectionEngine.totalPnl,
      sentiment: sentimentEngine.getSentiment(),\n      marketFeed: marketDataFeed.getStatus(),
    }
  }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log('[WS] Client disconnected');
  });
});

// ── REST API ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'Terminal Backend Active', pnl: detectionEngine.totalPnl, marketFeed: marketDataFeed.getStatus() });
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
const researchStore = new ResearchStore(process.env.RESEARCH_DB_PATH);
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

server.listen(PORT, () => {\n  marketDataFeed.start();
  console.log(`[HTTP] Server running on port ${PORT}`);
  console.log(`[WS]  Binary MessagePack WebSocket on port ${PORT}`);
});

