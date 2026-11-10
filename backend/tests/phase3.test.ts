import test from 'node:test';
import assert from 'node:assert/strict';
import type { Candle } from '../src/types';
import type { MultiConfirmationSignal } from '../src/services/MultiConfirmationSignalEngine';
import { HistoricalBacktestingEngine } from '../src/services/BacktestingEngine';
import { PaperTradingEngine } from '../src/services/PaperTradingEngine';

function candle(index: number, open: number, close: number, marketType: 'LIVE' | 'OTC' = 'LIVE'): Candle {
  return {
    symbol: 'BTC/USDT', marketType, source: 'PROVIDER_API', timeframe: '1m',
    openTime: index * 60_000, closeTime: (index + 1) * 60_000 - 1,
    open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1
  };
}

const alwaysCall = {
  evaluate: (candles: Candle[]) => ({
    direction: 'CALL', confidence: 60, confirmations: 3, totalChecks: 5,
    reasons: ['test'], timestamp: candles[candles.length - 1].closeTime,
    symbol: 'BTC/USDT', marketType: 'LIVE', source: 'PROVIDER_API',
    indicators: {}, confidenceIsProbability: false
  } as unknown as MultiConfirmationSignal)
};

test('backtest enters on the next candle open and settles at expiry close', () => {
  const report = new HistoricalBacktestingEngine(
    { initialBalance: 100, stake: 10, payoutRate: 0.8, expiryCandles: 1 }, alwaysCall
  ).run([candle(0, 100, 100), candle(1, 101, 103), candle(2, 103, 104)]);
  assert.equal(report.totalTrades, 2);
  assert.equal(report.wins, 2);
  assert.equal(report.netPnl, 16);
  assert.equal(report.endingBalance, 116);
  assert.equal(report.trades[0].entryPrice, 101);
  assert.equal(report.trades[0].exitPrice, 103);
});

test('backtest rejects mixed LIVE and OTC candles', () => {
  assert.throws(() => new HistoricalBacktestingEngine().run([
    candle(0, 100, 101, 'LIVE'), candle(1, 101, 102, 'OTC')
  ]), /mixed candle stream/);
});

test('paper trading opens on the next candle and settles virtually', () => {
  const engine = new PaperTradingEngine(
    { initialBalance: 100, stake: 10, payoutRate: 0.8, expiryCandles: 1 }, alwaysCall
  );
  engine.processCandle(candle(0, 100, 100));
  const update = engine.processCandle(candle(1, 101, 103));
  assert.equal(update.opened?.entryPrice, 101);
  assert.equal(update.settled?.status, 'WIN');
  assert.equal(update.settled?.pnl, 8);
  assert.equal(engine.getSnapshot().balance, 108);
});

test('paper trading rejects a different data stream', () => {
  const engine = new PaperTradingEngine({}, alwaysCall);
  engine.processCandle(candle(0, 100, 100, 'LIVE'));
  assert.throws(() => engine.processCandle(candle(1, 100, 101, 'OTC')), /locked to one/);
});

test('paper trading reset restores virtual balance and clears history', () => {
  const engine = new PaperTradingEngine({ initialBalance: 250 }, alwaysCall);
  engine.processCandle(candle(0, 100, 100));
  engine.reset();
  assert.equal(engine.getSnapshot().balance, 250);
  assert.equal(engine.getSnapshot().trades.length, 0);
});
