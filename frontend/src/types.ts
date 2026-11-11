export type Asset = 'BTC/USDT' | 'ETH/USDT' | 'SOL/USDT';
export type ExchangeName = 'Binance' | 'Coinbase' | 'Uniswap';

export interface PriceUpdate {
  asset: Asset;
  exchange: ExchangeName;
  price: number;
  timestamp: number;
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

export type OrderBookLevel = [number, number];
export interface OrderBook {
  asset: Asset;
  exchange: ExchangeName;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface SentimentData {
  score: number;    // -100 to 100
  label: string;   // 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed'
  headline: string;
  timestamp: number;
}

export interface LiveTechnicalSignal {
  id: string;
  direction: 'CALL' | 'PUT' | 'WAIT';
  confidence: number;
  confirmations: number;
  totalChecks: number;
  reasons: string[];
  timestamp: number;
  symbol: string;
  marketType: 'LIVE';
  source: 'PROVIDER_API';
  indicators: {
    rsi: number | null;
    ema9: number | null; ema21: number | null; ema50: number | null;
    macd: { macd: number; signal: number; histogram: number } | null;
    bollinger: { upper: number; middle: number; lower: number } | null;
    stochasticRsi: { k: number; d: number } | null;
  };
  confidenceIsProbability: false;
  marketLabel: 'Binance Spot (not Quotex OTC)';
}
