import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { CandleBuilder } from './CandleBuilder';
import type { MarketTick } from '../types';

const SYMBOLS: Record<string, string> = {
  BTCUSDT: 'BTC/USDT',
  ETHUSDT: 'ETH/USDT',
  SOLUSDT: 'SOL/USDT'
};
const STALE_AFTER_MS = 15_000;
const MAX_RECONNECT_MS = 30_000;

export type FeedConnectionState = 'DISABLED' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'STALE';
export interface FeedStatus {
  provider: string;
  marketType: 'LIVE';
  source: 'PROVIDER_API';
  state: FeedConnectionState;
  symbols: string[];
  lastMessageAt: number | null;
  reconnectAttempt: number;
  lastError: string | null;
}

/** Parses Binance public spot trade messages. No credentials or order endpoints are used. */
export function parseBinanceTradeMessage(raw: string, receivedAt = Date.now()): MarketTick | null {
  try {
    const envelope = JSON.parse(raw);
    const payload = envelope?.data ?? envelope;
    if (payload?.e !== 'trade' || typeof payload.s !== 'string') return null;
    const symbol = SYMBOLS[payload.s.toUpperCase()];
    const price = Number(payload.p);
    const volume = Number(payload.q);
    const timestamp = Number(payload.T);
    if (!symbol || !Number.isFinite(price) || price <= 0 ||
        !Number.isFinite(volume) || volume < 0 ||
        !Number.isSafeInteger(timestamp) || timestamp <= 0 ||
        timestamp > receivedAt + 30_000 || receivedAt - timestamp > 120_000) return null;
    return { symbol, price, volume, timestamp, tradeId: payload.t ?? payload.a, marketType: 'LIVE', source: 'PROVIDER_API' };
  } catch {
    return null;
  }
}

/**
 * Read-only public Binance Spot feed. This is a crypto spot feed, not a Quotex
 * OTC quote source. Every tick carries LIVE + PROVIDER_API provenance.
 */
export class MarketDataFeedService extends EventEmitter {
  private socket: WebSocket | null = null;
  private reconnectTimer?: NodeJS.Timeout;
  private staleTimer?: NodeJS.Timeout;
  private reconnectAttempt = 0;
  private stopped = true;
  private state: FeedConnectionState = 'DISABLED';
  private lastMessageAt: number | null = null;
  private lastError: string | null = null;
  private readonly candleBuilder = new CandleBuilder();
  private readonly symbols = Object.keys(SYMBOLS);

  public start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
    this.staleTimer = setInterval(() => {
      if (this.state === 'CONNECTED' && this.lastMessageAt !== null &&
          Date.now() - this.lastMessageAt > STALE_AFTER_MS) {
        this.state = 'STALE';
        this.emit('status', this.getStatus());
      }
    }, 3_000);
  }

  public stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = null;
    this.state = 'DISABLED';
    this.emit('status', this.getStatus());
  }

  public getStatus(): FeedStatus {
    let state = this.state;
    if (state === 'CONNECTED' && this.lastMessageAt !== null &&
        Date.now() - this.lastMessageAt > STALE_AFTER_MS) state = 'STALE';
    return {
      provider: 'Binance Spot Public WebSocket',
      marketType: 'LIVE',
      source: 'PROVIDER_API',
      state,
      symbols: this.symbols.map(s => SYMBOLS[s]),
      lastMessageAt: this.lastMessageAt,
      reconnectAttempt: this.reconnectAttempt,
      lastError: this.lastError
    };
  }

  /** Public for deterministic tests and future authorized provider adapters. */
  public ingestTick(tick: MarketTick): boolean {
    if (tick.marketType !== 'LIVE' || tick.source !== 'PROVIDER_API' ||
        !tick.symbol || !Number.isFinite(tick.price) || tick.price <= 0 ||
        !Number.isFinite(tick.timestamp) || tick.timestamp <= 0 ||
        (tick.volume !== undefined && (!Number.isFinite(tick.volume) || tick.volume < 0))) return false;
    const result = this.candleBuilder.update(tick);
    if (!result) return false;
    this.emit('tick', tick);
    this.emit('candle', result.candle);
    if (result.closedCandle) this.emit('closed_candle', result.closedCandle);
    return true;
  }

  private connect(): void {
    if (this.stopped) return;
    this.state = 'CONNECTING';
    this.emit('status', this.getStatus());
    const streams = this.symbols.map(s => s.toLowerCase() + '@trade').join('/');
    const socket = new WebSocket('wss://stream.binance.com:9443/stream?streams=' + streams);
    this.socket = socket;

    socket.on('open', () => {
      if (this.socket !== socket || this.stopped) return;
      this.reconnectAttempt = 0;
      this.lastError = null;
      this.state = 'CONNECTED';
      this.emit('status', this.getStatus());
    });
    socket.on('message', (data: WebSocket.Data) => {
      if (this.socket !== socket || this.stopped) return;
      const tick = parseBinanceTradeMessage(data.toString());
      if (!tick) return;
      this.lastMessageAt = Date.now();
      if (this.state !== 'CONNECTED') {
        this.state = 'CONNECTED';
        this.emit('status', this.getStatus());
      }
      this.ingestTick(tick);
    });
    socket.on('error', error => {
      this.lastError = error.message;
      this.emit('status', this.getStatus());
      socket.close();
    });
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.stopped) return;
      this.state = 'DISCONNECTED';
      this.reconnectAttempt += 1;
      this.emit('status', this.getStatus());
      const delay = Math.min(1_000 * 2 ** Math.min(this.reconnectAttempt - 1, 5), MAX_RECONNECT_MS);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }
}
