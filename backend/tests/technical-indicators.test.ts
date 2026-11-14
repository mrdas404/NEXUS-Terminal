import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBollingerBands,
  calculateEma,
  calculateIndicators,
  calculateMacd,
  calculateRsi,
  calculateStochasticRsi
} from '../src/services/TechnicalIndicators';
import { MultiConfirmationSignalEngine } from '../src/services/MultiConfirmationSignalEngine';
import type { Candle } from '../src/types';

const candle = (openTime: number, close: number, symbol = 'BTC/USDT'): Candle => ({
  symbol,
  marketType: 'LIVE',
  source: 'PROVIDER_API',
  timeframe: '1m',
  openTime,
  closeTime: openTime + 59_999,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 1
});

test('EMA returns null until the seed period and calculates a stable average', () => {
  assert.equal(calculateEma([1, 2], 3), null);
  assert.equal(calculateEma([10, 10, 10], 3), 10);
  assert.equal(calculateEma([1, 2, 3, 4], 3), 3);
});

test('RSI handles rising, falling, and flat markets', () => {
  assert.equal(calculateRsi(Array.from({ length: 15 }, (_, i) => 100 + i)), 100);
  assert.equal(calculateRsi(Array.from({ length: 15 }, (_, i) => 100 - i)), 0);
  assert.equal(calculateRsi(Array(15).fill(100)), 50);
  assert.equal(calculateRsi([1, 2, 3], 14), null);
});

test('Bollinger bands are centered on the period mean', () => {
  const result = calculateBollingerBands([1, 2, 3], 3, 2);
  assert.ok(result);
  assert.equal(result.middle, 2);
  assert.ok(result.upper > result.middle);
  assert.ok(result.lower < result.middle);
  assert.equal(calculateBollingerBands([1], 1), null);
});

test('MACD and Stochastic RSI wait for sufficient history', () => {
  assert.equal(calculateMacd(Array(30).fill(100)), null);
  const flatMacd = calculateMacd(Array(40).fill(100));
  assert.ok(flatMacd);
  assert.equal(flatMacd.histogram, 0);
  assert.equal(calculateStochasticRsi(Array(20).fill(100)), null);
  const values = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 3) * 4 + i * 0.05);
  assert.ok(calculateMacd(values));
  const stoch = calculateStochasticRsi(values);
  assert.ok(stoch);
  assert.ok(stoch.k >= 0 && stoch.k <= 100);
  assert.ok(stoch.d >= 0 && stoch.d <= 100);
});

test('indicator snapshot rejects invalid close values safely', () => {
  const result = calculateIndicators([candle(0, 100), candle(60_000, Number.NaN)]);
  assert.equal(result.rsi, null);
  assert.equal(result.ema9, null);
  assert.equal(result.macd, null);
});

test('multi-confirmation engine emits CALL on aligned bullish trend and PUT on bearish trend', () => {
  const engine = new MultiConfirmationSignalEngine();
  const bullish = Array.from({ length: 80 }, (_, i) => candle(i * 60_000, 100 + i));
  const bearish = Array.from({ length: 80 }, (_, i) => candle(i * 60_000, 200 - i));
  const call = engine.evaluate(bullish);
  const put = engine.evaluate(bearish);
  assert.equal(call?.direction, 'CALL');
  assert.equal(put?.direction, 'PUT');
  assert.equal(call?.confidenceIsProbability, false);
  assert.equal(put?.confidenceIsProbability, false);
  assert.equal(call?.totalChecks, 5);
});

test('engine returns WAIT for insufficient history and rejects mixed streams', () => {
  const engine = new MultiConfirmationSignalEngine();
  assert.equal(engine.evaluate([candle(0, 100)])?.direction, 'WAIT');
  const mixed = [candle(0, 100), candle(60_000, 101, 'ETH/USDT')];
  assert.equal(engine.evaluate(mixed), null);
  const outOfOrder = [candle(60_000, 101), candle(0, 100)];
  assert.equal(engine.evaluate(outOfOrder), null);
});
