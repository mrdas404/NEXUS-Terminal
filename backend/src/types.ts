export type Asset = 'BTC/USDT' | 'ETH/USDT' | 'SOL/USDT';
export type ExchangeName = 'Binance' | 'Coinbase' | 'Uniswap';

// Data provenance is explicit so simulated/demo values cannot be mistaken for live prices.
export type PriceDataMode = 'LIVE' | 'SIMULATED';
export type QuotexMarketType = 'LIVE' | 'OTC';
export type MarketDataSource =
  | 'PROVIDER_API'
  | 'QUOTEX_WEBSOCKET'
  | 'UNISWAP_RPC'
  | 'SIMULATED';
export type CandleTimeframe = '1m';

export interface MarketTick {
  symbol: string;
  price: number;
  timestamp: number;
  marketType: QuotexMarketType;
  source: MarketDataSource;
  volume?: number;
}

export interface Candle {
  symbol: string;
  marketType: QuotexMarketType;
  source: MarketDataSource;
  timeframe: CandleTimeframe;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceUpdate {
  asset: Asset;
  exchange: ExchangeName;
  price: number;
  timestamp: number;
  dataMode?: PriceDataMode;
}

export type SignalType = 'NORMAL' | 'ARBITRAGE' | 'ANOMALY' | 'SPIKE' | 'DROP' | 'EXECUTION' | 'SENTIMENT';

export interface Signal {
  id: string;
  type: SignalType;
  asset: Asset;
  message: string;
  timestamp: number;
  data?: any;
}

export interface TerminalSettings {
  arbitrageThreshold: number;
  anomalyThreshold: number;
  spikeThreshold: number;
}

export interface TerminalState {
  prices: Record<Asset, Record<ExchangeName, number | null>>;
  signals: Signal[];
  pnl: number;
}

// L2 Order Book types
export type OrderBookLevel = [number, number]; // [price, quantity]
export interface OrderBook {
  asset: Asset;
  exchange: ExchangeName;
  bids: OrderBookLevel[]; // top 10 bids [price, qty] descending
  asks: OrderBookLevel[]; // top 10 asks [price, qty] ascending
  timestamp: number;
}

// Sentiment
export interface SentimentData {
  score: number;         // -100 to 100
  label: string;         // 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
  headline: string;      // most recent news headline that triggered the score
  timestamp: number;
}
