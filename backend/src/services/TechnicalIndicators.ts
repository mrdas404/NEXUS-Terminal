import type { Candle } from '../types';

export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
}

export interface StochasticRsiResult {
  k: number;
  d: number;
}

export interface IndicatorSnapshot {
  rsi: number | null;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  macd: MacdResult | null;
  bollinger: BollingerBands | null;
  stochasticRsi: StochasticRsiResult | null;
}

const validValues = (values: number[]): boolean =>
  values.every((value) => Number.isFinite(value) && value > 0);

/** Exponential moving average. Returns null until a complete seed period exists. */
export function calculateEma(values: number[], period: number): number | null {
  if (!Number.isInteger(period) || period < 1 || values.length < period || !validValues(values)) {
    return null;
  }
  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let i = period; i < values.length; i += 1) {
    ema = (values[i] - ema) * multiplier + ema;
  }
  return ema;
}

/** Wilder-smoothed RSI on closing prices. Flat markets return 50; no-loss trends return 100. */
export function calculateRsi(values: number[], period = 14): number | null {
  if (!Number.isInteger(period) || period < 1 || values.length < period + 1 || !validValues(values)) {
    return null;
  }

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;

  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }

  if (averageGain === 0 && averageLoss === 0) return 50;
  if (averageLoss === 0) return 100;
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

export function calculateMacd(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MacdResult | null {
  if (
    fastPeriod >= slowPeriod ||
    values.length < slowPeriod + signalPeriod - 1 ||
    !validValues(values)
  ) return null;

  const multiplierFast = 2 / (fastPeriod + 1);
  const multiplierSlow = 2 / (slowPeriod + 1);
  let fast = values.slice(0, fastPeriod).reduce((sum, value) => sum + value, 0) / fastPeriod;
  let slow = values.slice(0, slowPeriod).reduce((sum, value) => sum + value, 0) / slowPeriod;
  const macdValues: number[] = [];

  for (let i = slowPeriod; i < values.length; i += 1) {
    fast = (values[i] - fast) * multiplierFast + fast;
    slow = (values[i] - slow) * multiplierSlow + slow;
    macdValues.push(fast - slow);
  }
  if (macdValues.length < signalPeriod) return null;

  const signal = calculateEma(macdValues, signalPeriod);
  if (signal === null) return null;
  const macd = macdValues[macdValues.length - 1];
  return { macd, signal, histogram: macd - signal };
}

export function calculateBollingerBands(
  values: number[],
  period = 20,
  standardDeviations = 2
): BollingerBands | null {
  if (
    !Number.isInteger(period) ||
    period < 2 ||
    !Number.isFinite(standardDeviations) ||
    standardDeviations <= 0 ||
    values.length < period ||
    !validValues(values)
  ) return null;

  const window = values.slice(-period);
  const middle = window.reduce((sum, value) => sum + value, 0) / period;
  const variance = window.reduce((sum, value) => sum + (value - middle) ** 2, 0) / period;
  const deviation = Math.sqrt(variance) * standardDeviations;
  return { upper: middle + deviation, middle, lower: middle - deviation };
}

export function calculateStochasticRsi(
  values: number[],
  rsiPeriod = 14,
  stochasticPeriod = 14,
  kSmoothing = 3,
  dSmoothing = 3
): StochasticRsiResult | null {
  const minimum = rsiPeriod + stochasticPeriod + kSmoothing + dSmoothing - 3;
  if (values.length < minimum || !validValues(values)) return null;

  const rsiSeries: number[] = [];
  for (let end = rsiPeriod + 1; end <= values.length; end += 1) {
    const rsi = calculateRsi(values.slice(0, end), rsiPeriod);
    if (rsi !== null) rsiSeries.push(rsi);
  }
  if (rsiSeries.length < stochasticPeriod + kSmoothing + dSmoothing - 2) return null;

  const rawK: number[] = [];
  for (let i = stochasticPeriod - 1; i < rsiSeries.length; i += 1) {
    const window = rsiSeries.slice(i - stochasticPeriod + 1, i + 1);
    const low = Math.min(...window);
    const high = Math.max(...window);
    rawK.push(high === low ? 50 : ((rsiSeries[i] - low) / (high - low)) * 100);
  }
  const smooth = (input: number[], period: number): number[] => {
    const result: number[] = [];
    for (let i = period - 1; i < input.length; i += 1) {
      result.push(input.slice(i - period + 1, i + 1).reduce((sum, value) => sum + value, 0) / period);
    }
    return result;
  };
  const kSeries = smooth(rawK, kSmoothing);
  const dSeries = smooth(kSeries, dSmoothing);
  if (!kSeries.length || !dSeries.length) return null;
  return { k: kSeries[kSeries.length - 1], d: dSeries[dSeries.length - 1] };
}

/** Calculates all indicators from chronological, same-stream candle closes. */
export function calculateIndicators(candles: Candle[]): IndicatorSnapshot {
  const closes = candles.map((candle) => candle.close);
  if (!validValues(closes)) {
    return { rsi: null, ema9: null, ema21: null, ema50: null, macd: null, bollinger: null, stochasticRsi: null };
  }
  return {
    rsi: calculateRsi(closes, 14),
    ema9: calculateEma(closes, 9),
    ema21: calculateEma(closes, 21),
    ema50: calculateEma(closes, 50),
    macd: calculateMacd(closes, 12, 26, 9),
    bollinger: calculateBollingerBands(closes, 20, 2),
    stochasticRsi: calculateStochasticRsi(closes, 14, 14, 3, 3)
  };
}
