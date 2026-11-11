import { EventEmitter } from 'events';
import type { Candle } from '../types';
import { MultiConfirmationSignalEngine, type MultiConfirmationSignal } from './MultiConfirmationSignalEngine';

export interface LiveTechnicalSignal extends MultiConfirmationSignal {
  id: string;
  marketLabel: 'Binance Spot (not Quotex OTC)';
}

/**
 * Evaluates only completed, contiguous 1m candles from the public Binance
 * spot feed. This is read-only analysis; it never places broker orders.
 */
export class LiveTechnicalSignalService extends EventEmitter {
  private readonly engine = new MultiConfirmationSignalEngine();
  private readonly candles = new Map<string, Candle[]>();
  private readonly latest = new Map<string, LiveTechnicalSignal>();

  public processClosedCandle(candle: Candle): LiveTechnicalSignal | null {
    if (candle.marketType !== 'LIVE' || candle.source !== 'PROVIDER_API' ||
        candle.timeframe !== '1m' || !Number.isSafeInteger(candle.openTime) ||
        candle.closeTime !== candle.openTime + 59_999 ||
        ![candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite) ||
        candle.low <= 0 || candle.volume < 0 ||
        candle.high < Math.max(candle.open, candle.close, candle.low) ||
        candle.low > Math.min(candle.open, candle.close, candle.high)) return null;

    const history = this.candles.get(candle.symbol) ?? [];
    const previous = history[history.length - 1];
    if (previous && candle.openTime !== previous.openTime + 60_000) {
      this.candles.delete(candle.symbol);
      return null;
    }
    if (previous && candle.openTime <= previous.openTime) return null;

    const next = [...history, candle].slice(-300);
    this.candles.set(candle.symbol, next);
    const result = this.engine.evaluate(next);
    if (!result) return null;

    const signal: LiveTechnicalSignal = {
      ...result,
      id: candle.symbol + ':' + candle.openTime,
      marketLabel: 'Binance Spot (not Quotex OTC)'
    };
    this.latest.set(candle.symbol, signal);
    this.emit('signal', signal);
    return signal;
  }

  public resetSymbol(symbol: string): void {
    this.candles.delete(symbol);
    this.latest.delete(symbol);
  }

  public getLatest(): LiveTechnicalSignal[] {
    return Array.from(this.latest.values()).sort((a, b) => b.timestamp - a.timestamp);
  }
}
