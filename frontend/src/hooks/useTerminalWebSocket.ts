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
}

const WS_URL = (import.meta.env.VITE_WS_URL || 'ws://localhost:3001').replace(/^http/,'ws');
const INITIAL_PRICES: Record<Asset, Record<ExchangeName, number | null>> = {
  'BTC/USDT': { Binance: null, Coinbase: null, Uniswap: null },
  'ETH/USDT': { Binance: null, Coinbase: null, Uniswap: null },
  'SOL/USDT': { Binance: null, Coinbase: null, Uniswap: null },
};
const INITIAL_HISTORY: Record<Asset, { time: number; price: number }[]> = {
  'BTC/USDT': [], 'ETH/USDT': [], 'SOL/USDT': [],
};
const MAX_HISTORY_POINTS = 60;

export function useTerminalWebSocket() {
  const [state, setState] = useState<TerminalState>({
    prices: INITIAL_PRICES, signals: [], connected: false, history: INITIAL_HISTORY,
    pnl: 0, orderBook: null, sentiment: null, marketFeed: INITIAL_FEED, marketTicks: []
  });

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => setState(s => ({ ...s, connected: true }));
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
      setState(s => ({...s,connected:false}));
      setTimeout(connect,3000);
    };
    ws.onerror = () => ws.close();
    return () => ws.close();
  }, []);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  return state;
}
