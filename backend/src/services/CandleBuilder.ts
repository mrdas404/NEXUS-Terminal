import { Candle, MarketTick } from '../types';

const ONE_MINUTE_MS = 60_000;

/**
 * Builds isolated 1-minute OHLC candles.
 * Market type and data source are part of the key, so LIVE, OTC,
 * provider API and Quotex WebSocket data are never silently mixed.
 */
export class CandleBuilder {
  private readonly currentCandles = new Map<string, Candle>();

  private getKey(tick: MarketTick): string {
    return [tick.marketType, tick.source, tick.symbol, '1m'].join(':');
  }

  public update(tick: MarketTick): { candle: Candle; closedCandle?: Candle } | null {
    if (
      !tick.symbol ||
      !Number.isFinite(tick.price) ||
      tick.price <= 0 ||
      !Number.isFinite(tick.timestamp) ||
      (tick.volume !== undefined && (!Number.isFinite(tick.volume) || tick.volume < 0))
    ) {
      return null;
    }

    const openTime = Math.floor(tick.timestamp / ONE_MINUTE_MS) * ONE_MINUTE_MS;
    const key = this.getKey(tick);
    const current = this.currentCandles.get(key);

    if (!current) {
      const candle = this.createCandle(tick, openTime);
      this.currentCandles.set(key, candle);
      return { candle: { ...candle } };
    }

    // Ignore late/out-of-order ticks rather than corrupting a newer candle.
    if (openTime < current.openTime) {
      return null;
    }

    if (openTime === current.openTime) {
      current.high = Math.max(current.high, tick.price);
      current.low = Math.min(current.low, tick.price);
      current.close = tick.price;
      current.volume += tick.volume ?? 0;
      return { candle: { ...current } };
    }

    const closedCandle = { ...current };
    const nextCandle = this.createCandle(tick, openTime);
    this.currentCandles.set(key, nextCandle);

    return { candle: { ...nextCandle }, closedCandle };
  }

  public getCurrentCandle(
    marketType: MarketTick['marketType'],
    source: MarketTick['source'],
    symbol: string
  ): Candle | undefined {
    const key = [marketType, source, symbol, '1m'].join(':');
    const candle = this.currentCandles.get(key);
    return candle ? { ...candle } : undefined;
  }

  private createCandle(tick: MarketTick, openTime: number): Candle {
    return {
      symbol: tick.symbol,
      marketType: tick.marketType,
      source: tick.source,
      timeframe: '1m',
      openTime,
      closeTime: openTime + ONE_MINUTE_MS - 1,
      open: tick.price,
      high: tick.price,
      low: tick.price,
      close: tick.price,
      volume: tick.volume ?? 0
    };
  }
}
