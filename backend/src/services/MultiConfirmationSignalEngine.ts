import type { Candle, QuotexMarketType, MarketDataSource } from '../types';
import { calculateIndicators, type IndicatorSnapshot } from './TechnicalIndicators';

export type TradeDirection = 'CALL' | 'PUT' | 'WAIT';

export interface SignalEngineOptions {
  minimumConfirmations: number;
  rsiBullishThreshold: number;
  rsiBearishThreshold: number;
}

export interface MultiConfirmationSignal {
  direction: TradeDirection;
  confidence: number;
  confirmations: number;
  totalChecks: number;
  reasons: string[];
  timestamp: number;
  symbol: string;
  marketType: QuotexMarketType;
  source: MarketDataSource;
  indicators: IndicatorSnapshot;
  confidenceIsProbability: false;
}

const DEFAULT_OPTIONS: SignalEngineOptions = {
  minimumConfirmations: 3,
  rsiBullishThreshold: 55,
  rsiBearishThreshold: 45
};

/**
 * Deterministic, read-only signal scoring. The score is a rule-match ratio,
 * not a calibrated probability or a promise of trading success.
 */
export class MultiConfirmationSignalEngine {
  private readonly options: SignalEngineOptions;

  constructor(options: Partial<SignalEngineOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    if (
      !Number.isInteger(this.options.minimumConfirmations) ||
      this.options.minimumConfirmations < 1 ||
      this.options.minimumConfirmations > 5 ||
      this.options.rsiBearishThreshold < 0 ||
      this.options.rsiBullishThreshold > 100 ||
      this.options.rsiBearishThreshold >= this.options.rsiBullishThreshold
    ) {
      throw new Error('Invalid signal engine options');
    }
  }

  public evaluate(candles: Candle[]): MultiConfirmationSignal | null {
    if (!candles.length) return null;
    const latest = candles[candles.length - 1];
    const streamIsConsistent = candles.every((candle, index) =>
      candle.symbol === latest.symbol &&
      candle.marketType === latest.marketType &&
      candle.source === latest.source &&
      candle.timeframe === '1m' &&
      (index === 0 || candle.openTime > candles[index - 1].openTime) &&
      Number.isFinite(candle.close) &&
      candle.close > 0
    );
    if (!streamIsConsistent) return null;

    const indicators = calculateIndicators(candles);
    const price = latest.close;
    const bullish: string[] = [];
    const bearish: string[] = [];

    if (indicators.ema9 !== null && indicators.ema21 !== null && indicators.ema50 !== null) {
      if (indicators.ema9 > indicators.ema21 && indicators.ema21 > indicators.ema50) bullish.push('EMA 9 > 21 > 50');
      if (indicators.ema9 < indicators.ema21 && indicators.ema21 < indicators.ema50) bearish.push('EMA 9 < 21 < 50');
    }
    if (indicators.rsi !== null) {
      if (indicators.rsi >= this.options.rsiBullishThreshold && indicators.rsi < 75) bullish.push('RSI bullish momentum');
      if (indicators.rsi <= this.options.rsiBearishThreshold && indicators.rsi > 25) bearish.push('RSI bearish momentum');
    }
    if (indicators.macd !== null) {
      if (indicators.macd.histogram > 0 && indicators.macd.macd > indicators.macd.signal) bullish.push('MACD bullish crossover bias');
      if (indicators.macd.histogram < 0 && indicators.macd.macd < indicators.macd.signal) bearish.push('MACD bearish crossover bias');
    }
    if (indicators.bollinger !== null) {
      if (price > indicators.bollinger.middle && price < indicators.bollinger.upper) bullish.push('Price above Bollinger midline');
      if (price < indicators.bollinger.middle && price > indicators.bollinger.lower) bearish.push('Price below Bollinger midline');
    }
    if (indicators.stochasticRsi !== null) {
      if (indicators.stochasticRsi.k > indicators.stochasticRsi.d && indicators.stochasticRsi.k < 80) bullish.push('Stochastic RSI K > D');
      if (indicators.stochasticRsi.k < indicators.stochasticRsi.d && indicators.stochasticRsi.k > 20) bearish.push('Stochastic RSI K < D');
    }

    const totalChecks = 5;
    const direction: TradeDirection =
      bullish.length >= this.options.minimumConfirmations && bullish.length > bearish.length ? 'CALL' :
      bearish.length >= this.options.minimumConfirmations && bearish.length > bullish.length ? 'PUT' : 'WAIT';
    const confirmations = direction === 'CALL' ? bullish.length : direction === 'PUT' ? bearish.length : Math.max(bullish.length, bearish.length);

    return {
      direction,
      confidence: Math.round((confirmations / totalChecks) * 100),
      confirmations,
      totalChecks,
      reasons: direction === 'CALL' ? bullish : direction === 'PUT' ? bearish : ['Insufficient or conflicting confirmations'],
      timestamp: latest.closeTime,
      symbol: latest.symbol,
      marketType: latest.marketType,
      source: latest.source,
      indicators,
      confidenceIsProbability: false
    };
  }
}
