import { useState, useEffect, useCallback } from 'react';
import { unpack } from 'msgpackr';
import type { Asset, ExchangeName, PriceUpdate, Signal, OrderBook, SentimentData } from '../types';

export interface MarketFeedStatus {
  provider: string;
  marketType: 'LIVE';
  source: 'PROVIDER_API';
  state: 'DISABLED'|'CONNECTING'|'CONNECTED'|'DISCONNECTED'|'STALE';
  symbols: string[];
  lastMessageAt: number|null;
  reconnectAttempt: number;
  lastError: string|null;
}
export interface MarketCandle {
  symbol: string; marketType: 'LIVE'; source: 'PROVIDER_API'; timeframe: '1m';
  openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volume: number;
}
export interface MarketCandleGap {
  symbol:string; marketType:'LIVE'|'OTC'; source:string; timeframe:'1m';
  fromOpenTime:number; toOpenTime:number; missingMinutes:number;
}
export interface MarketFeedTick {
  symbol: string;
  price: number;
  volume?: number;
  timestamp: number;
  marketType: 'LIVE';
  source: 'PROVIDER_API';
}
const INITIAL_FEED: MarketFeedStatus = {
  provider:'Binance Spot Public WebSocket',marketType:'LIVE',source:'PROVIDER_API',
  state:'DISABLED',symbols:['BTC/USDT','ETH/USDT','SOL/USDT'],
  lastMessageAt:null,reconnectAttempt:0,lastError:null
};

export interface TerminalState {
  prices: Record<Asset, Record<ExchangeName, number | null>>;
  signals: Signal[];
  connected: boolean;
  history: Record<Asset, { time: number; price: number }[]>;
  pnl: number;
  orderBook: OrderBook | null;
  sentiment: SentimentData | null;
  marketFeed: MarketFeedStatus;
  marketTicks: MarketFeedTick[];
  marketCandles: Record<string, MarketCandle[]>;
  closedMarketCandles: MarketCandle[];
  marketGaps: MarketCandleGap[];
}

const WS_URL = (import.meta.env.VITE_WS_URL || window.location.protocol.replace('http','ws') + '//' + window.location.host).replace(/^http/,'ws');
const INITIAL_PRICES: Record<Asset, Record<ExchangeName, number | null>> = {
  'BTC/USDT': { Binance: null, Coinbase: null, Uniswap: null },
  'ETH/USDT': { Binance: null, Coinbase: null, Uniswap: null },
  'SOL/USDT': { Binance: null, Coinbase: null, Uniswap: null },
};
const INITIAL_HISTORY: Record<Asset, { time: number; price: number }[]> = {
  'BTC/USDT': [], 'ETH/USDT': [], 'SOL/USDT': [],
};
const MAX_HISTORY_POINTS = 60;
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function useTerminalWebSocket() {
  const [state, setState] = useState<TerminalState>({
    prices: INITIAL_PRICES, signals: [], connected: false, history: INITIAL_HISTORY,
    pnl: 0, orderBook: null, sentiment: null, marketFeed: INITIAL_FEED, marketTicks: [], marketCandles: {}, closedMarketCandles: [], marketGaps: []
  });

  const recoverHistoricalCandles = useCallback(async (signal?: AbortSignal) => {
    const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
    await Promise.all(symbols.map(async symbol => {
      try {
        const response = await fetch(`${API_URL}/api/market/candles?symbol=${encodeURIComponent(symbol)}&limit=300`, { signal });
        if (!response.ok) throw new Error(`Historical candle API: HTTP ${response.status}`);
        const result = await response.json();
        if (result.marketType !== 'LIVE' || result.source !== 'PROVIDER_API' || result.timeframe !== '1m' || result.symbol !== symbol || !Array.isArray(result.candles)) return;
        const candles = (result.candles as MarketCandle[]).filter(c => c.marketType === 'LIVE' && c.source === 'PROVIDER_API' && c.timeframe === '1m' && Number.isSafeInteger(c.openTime) && c.openTime % 60_000 === 0 && Number.isSafeInteger(c.closeTime) && c.closeTime === c.openTime + 59_999 && c.closeTime < Date.now() && [c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite) && c.low > 0 && c.volume >= 0 && c.high >= Math.max(c.open,c.close,c.low) && c.low <= Math.min(c.open,c.close,c.high)).sort((a,b)=>a.openTime-b.openTime).slice(-300);
        if (signal?.aborted) return;
        setState(s => { const live=s.marketCandles[symbol]||[]; const merged=[...candles,...live].reduce((acc,x)=>{acc.set(x.openTime,x);return acc;},new Map<number,MarketCandle>()); const remainingGaps=s.marketGaps.filter(g=>g.symbol!==symbol || Array.from({length:g.missingMinutes},(_,i)=>g.fromOpenTime+i*60_000).some(openTime=>!merged.has(openTime))); return {...s,marketCandles:{...s.marketCandles,[symbol]:[...merged.values()].sort((a,b)=>a.openTime-b.openTime).slice(-300)},marketGaps:remainingGaps}; });
      } catch (error) { if (!signal?.aborted) console.warn('[Market] Historical candle recovery failed:', error); }
    }));
  }, []);

  const connect = useCallback(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const recoveryController = new AbortController();
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { if (disposed) return; setState(s => ({ ...s, connected: true })); void recoverHistoricalCandles(recoveryController.signal); };
    ws.onmessage = event => {
      try {
        const message = unpack(new Uint8Array(event.data as ArrayBuffer));
        if (message.type === 'INIT_STATE') {
          setState(s => ({
            ...s, prices: message.data.prices || INITIAL_PRICES,
            signals: message.data.signals || [], pnl: message.data.pnl || 0,
            sentiment: message.data.sentiment || null,
            marketFeed: message.data.marketFeed || INITIAL_FEED
          }));
        } else if (message.type === 'MARKET_FEED_STATUS') {
          setState(s => ({ ...s, marketFeed: message.data as MarketFeedStatus }));
        } else if (message.type === 'MARKET_TICK') {
          const tick = message.data as MarketFeedTick;
          if (tick.marketType !== 'LIVE' || tick.source !== 'PROVIDER_API' ||
              !Number.isFinite(tick.price) || tick.price <= 0) return;
          setState(s => ({ ...s, marketTicks: [tick, ...s.marketTicks.filter(t => t.symbol !== tick.symbol)].slice(0,3) }));
        } else if (message.type === 'MARKET_CANDLE_GAP') {
          const gap = message.data as MarketCandleGap;
          if (!gap.symbol || !Number.isInteger(gap.missingMinutes) || gap.missingMinutes < 1 || !Number.isFinite(gap.fromOpenTime) || !Number.isFinite(gap.toOpenTime)) return;
          setState(s => ({ ...s, marketGaps: [...s.marketGaps.filter(g => !(g.symbol === gap.symbol && g.fromOpenTime === gap.fromOpenTime)), gap].slice(-100) }));
          void recoverHistoricalCandles(recoveryController.signal);
        } else if (message.type === 'MARKET_CANDLE' || message.type === 'MARKET_CANDLE_CLOSED') {
          const candle = message.data as MarketCandle;
          if (candle.marketType !== 'LIVE' || candle.source !== 'PROVIDER_API' || candle.timeframe !== '1m' || !Number.isFinite(candle.openTime) || ![candle.open,candle.high,candle.low,candle.close,candle.volume].every(Number.isFinite) || candle.low <= 0 || candle.volume < 0 || candle.high < Math.max(candle.open,candle.close,candle.low) || candle.low > Math.min(candle.open,candle.close,candle.high)) return;
          setState(s => {
            const prior = s.marketCandles[candle.symbol] || [];
            const next = [...prior.filter(item => item.openTime !== candle.openTime), candle].sort((a,b)=>a.openTime-b.openTime).slice(-300);
            const closed = message.type === 'MARKET_CANDLE_CLOSED' ? [...s.closedMarketCandles.filter(item => !(item.symbol === candle.symbol && item.openTime === candle.openTime)), candle].sort((a,b)=>a.closeTime-b.closeTime).slice(-300) : s.closedMarketCandles;
            return { ...s, marketCandles: { ...s.marketCandles, [candle.symbol]: next }, closedMarketCandles: closed };
          });
        } else if (message.type === 'PNL_UPDATE') {
          setState(s => ({ ...s, pnl: message.data }));
        } else if (message.type === 'ORDERBOOK_UPDATE') {
          setState(s => ({ ...s, orderBook: message.data as OrderBook }));
        } else if (message.type === 'SENTIMENT_UPDATE') {
          setState(s => ({ ...s, sentiment: message.data as SentimentData }));
        } else if (message.type === 'PRICE_UPDATE') {
          const update = message.data as PriceUpdate;
          setState(s => {
            const currentPrices = s.prices[update.asset];
            const newPrices = { ...currentPrices, [update.exchange]: update.price };
            const available = Object.values(newPrices).filter((p): p is number => p !== null);
            const avg = available.length ? available.reduce((a,b)=>a+b,0)/available.length : 0;
            const points = [...s.history[update.asset],{time:update.timestamp,price:avg}].slice(-MAX_HISTORY_POINTS);
            return {...s,prices:{...s.prices,[update.asset]:newPrices},history:{...s.history,[update.asset]:points}};
          });
        } else if (message.type === 'SIGNAL_UPDATE') {
          const signal = message.data as Signal;
          setState(s => ({...s,signals:[signal,...s.signals].slice(0,50)}));
        }
      } catch (err) { console.error('[WS] Decode error:',err); }
    };
    ws.onclose = () => {
      recoveryController.abort();
      if (disposed) return;
      setState(s => ({...s,connected:false}));
      reconnectTimer = setTimeout(() => { if (!disposed) connect(); },3000);
    };
    ws.onerror = () => ws.close();
    return () => { disposed = true; recoveryController.abort(); if (reconnectTimer) clearTimeout(reconnectTimer); ws.close(); };
  }, [recoverHistoricalCandles]);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  return state;
}
