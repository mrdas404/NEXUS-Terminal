import { EventEmitter } from 'events';
import { Asset, ExchangeName, PriceUpdate } from '../types';

type PriceMatrix = Record<Asset, Record<ExchangeName, number | null>>;

const createPriceMatrix = (): PriceMatrix => ({
  'BTC/USDT': { Binance: null, Coinbase: null, Uniswap: null },
  'ETH/USDT': { Binance: null, Coinbase: null, Uniswap: null },
  'SOL/USDT': { Binance: null, Coinbase: null, Uniswap: null },
});

export class PriceStore extends EventEmitter {
  // Only verified, non-simulated prices are exposed through getPrices().
  private prices: PriceMatrix = createPriceMatrix();

  // Demo/fallback prices are kept separately and never enter arbitrage calculations.
  private simulatedPrices: PriceMatrix = createPriceMatrix();

  // Keep a tumbling window of live prices for spike detection.
  private history: Record<Asset, Record<ExchangeName, { price: number; timestamp: number }[]>> = {
    'BTC/USDT': { Binance: [], Coinbase: [], Uniswap: [] },
    'ETH/USDT': { Binance: [], Coinbase: [], Uniswap: [] },
    'SOL/USDT': { Binance: [], Coinbase: [], Uniswap: [] },
  };

  private readonly HISTORY_WINDOW_MS = 30 * 1000;

  constructor() {
    super();
  }

  public updatePrice(update: PriceUpdate) {
    const { asset, exchange, price, timestamp } = update;

    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp)) {
      return;
    }

    if (update.dataMode === 'SIMULATED') {
      this.simulatedPrices[asset][exchange] = price;
      this.emit('simulated_price_update', update);
      return;
    }

    this.prices[asset][exchange] = price;

    const historyList = this.history[asset][exchange];
    historyList.push({ price, timestamp });

    const cutoff = timestamp - this.HISTORY_WINDOW_MS;
    while (historyList.length > 0 && historyList[0].timestamp < cutoff) {
      historyList.shift();
    }

    this.emit('price_update', update);
  }

  public getPrices(): PriceMatrix {
    return this.prices;
  }

  public getSimulatedPrices(): PriceMatrix {
    return this.simulatedPrices;
  }

  public getPrice(asset: Asset, exchange: ExchangeName) {
    return this.prices[asset][exchange];
  }

  public getHistory(asset: Asset, exchange: ExchangeName) {
    return this.history[asset][exchange];
  }
}

export const priceStore = new PriceStore();
