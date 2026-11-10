import type { Candle } from '../types';
import { MultiConfirmationSignalEngine, type MultiConfirmationSignal, type TradeDirection } from './MultiConfirmationSignalEngine';

export interface PaperTradingOptions {
  initialBalance: number;
  stake: number;
  payoutRate: number;
  expiryCandles: number;
}

export interface PaperTrade {
  id: number;
  direction: Exclude<TradeDirection, 'WAIT'>;
  status: 'OPEN' | 'WIN' | 'LOSS' | 'TIE';
  symbol: string;
  marketType: Candle['marketType'];
  source: Candle['source'];
  signalTime: number;
  entryTime: number;
  expiryTime: number;
  entryPrice: number;
  exitPrice?: number;
  stake: number;
  pnl?: number;
  confirmations: number;
  confidence: number;
}

export interface PaperTradingUpdate {
  opened?: PaperTrade;
  settled?: PaperTrade;
  signal?: MultiConfirmationSignal | null;
}

const DEFAULT_OPTIONS: PaperTradingOptions = {
  initialBalance: 10_000,
  stake: 10,
  payoutRate: 0.8,
  expiryCandles: 1
};

function validateOptions(options: PaperTradingOptions): void {
  if (
    !Number.isFinite(options.initialBalance) || options.initialBalance <= 0 ||
    !Number.isFinite(options.stake) || options.stake <= 0 || options.stake > options.initialBalance ||
    !Number.isFinite(options.payoutRate) || options.payoutRate < 0 || options.payoutRate > 1 ||
    !Number.isInteger(options.expiryCandles) || options.expiryCandles < 1
  ) throw new Error('Invalid paper trading options');
}

function validateCandle(candle: Candle): void {
  if (
    !candle.symbol || candle.timeframe !== '1m' ||
    !Number.isFinite(candle.openTime) || !Number.isFinite(candle.closeTime) || candle.closeTime < candle.openTime ||
    !Number.isFinite(candle.open) || candle.open <= 0 ||
    !Number.isFinite(candle.high) || !Number.isFinite(candle.low) || !Number.isFinite(candle.close) ||
    candle.high < Math.max(candle.open, candle.close, candle.low) ||
    candle.low > Math.min(candle.open, candle.close, candle.high) ||
    !Number.isFinite(candle.volume) || candle.volume < 0
  ) throw new Error('Invalid paper-trading candle');
}

/** In-memory virtual-balance simulator. It never sends orders to an exchange or broker. */
export class PaperTradingEngine {
  private readonly options: PaperTradingOptions;
  private readonly signalEngine: Pick<MultiConfirmationSignalEngine, 'evaluate'>;
  private readonly history: Candle[] = [];
  private readonly trades: PaperTrade[] = [];
  private balance: number;
  private activeTrade: PaperTrade | null = null;
  private pendingSignal: MultiConfirmationSignal | null = null;
  private streamKey: string | null = null;

  constructor(
    options: Partial<PaperTradingOptions> = {},
    signalEngine: Pick<MultiConfirmationSignalEngine, 'evaluate'> = new MultiConfirmationSignalEngine()
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    validateOptions(this.options);
    this.balance = this.options.initialBalance;
    this.signalEngine = signalEngine;
  }

  /** Feed one fully closed candle at a time, in chronological order. */
  public processCandle(candle: Candle): PaperTradingUpdate {
    validateCandle(candle);
    const key = [candle.marketType, candle.source, candle.symbol, candle.timeframe].join(':');
    if (this.streamKey !== null && this.streamKey !== key) {
      throw new Error('Paper trading instance is locked to one market/source/symbol stream');
    }
    const previous = this.history[this.history.length - 1];
    if (previous && candle.openTime <= previous.openTime) {
      throw new Error('Candles must be strictly chronological');
    }
    this.streamKey = key;
    this.history.push({ ...candle });
    const index = this.history.length - 1;
    const update: PaperTradingUpdate = {};

    if (this.pendingSignal && !this.activeTrade) {
      if (this.balance >= this.options.stake) {
        const signal = this.pendingSignal;
        const trade: PaperTrade = {
          id: this.trades.length + 1,
          direction: signal.direction as Exclude<TradeDirection, 'WAIT'>,
          status: 'OPEN',
          symbol: candle.symbol,
          marketType: candle.marketType,
          source: candle.source,
          signalTime: signal.timestamp,
          entryTime: candle.openTime,
          expiryTime: this.history[Math.min(index + this.options.expiryCandles - 1, this.history.length - 1)].closeTime,
          entryPrice: candle.open,
          stake: this.options.stake,
          confirmations: signal.confirmations,
          confidence: signal.confidence
        };
        this.balance -= this.options.stake;
        this.trades.push(trade);
        this.activeTrade = trade;
        update.opened = { ...trade };
      }
      this.pendingSignal = null;
    }

    if (this.activeTrade && index >= this.tradesExpiryIndex(this.activeTrade)) {
      const trade = this.activeTrade;
      trade.exitPrice = candle.close;
      trade.status = trade.exitPrice === trade.entryPrice
        ? 'TIE'
        : (trade.direction === 'CALL' ? trade.exitPrice > trade.entryPrice : trade.exitPrice < trade.entryPrice)
          ? 'WIN' : 'LOSS';
      trade.pnl = trade.status === 'WIN'
        ? this.options.stake * this.options.payoutRate
        : trade.status === 'LOSS' ? -this.options.stake : 0;
      if (trade.status === 'WIN') this.balance += this.options.stake * (1 + this.options.payoutRate);
      else if (trade.status === 'TIE') this.balance += this.options.stake;
      update.settled = { ...trade };
      this.activeTrade = null;
    }

    if (!this.activeTrade && !this.pendingSignal) {
      const signal = this.signalEngine.evaluate(this.history);
      update.signal = signal;
      if (signal && signal.direction !== 'WAIT') this.pendingSignal = signal;
    }
    return update;
  }

  private tradesExpiryIndex(trade: PaperTrade): number {
    const entryIndex = this.history.findIndex((candle) => candle.openTime === trade.entryTime);
    return entryIndex + this.options.expiryCandles - 1;
  }

  public getSnapshot(): {
    balance: number;
    initialBalance: number;
    netPnl: number;
    openTrade: PaperTrade | null;
    pendingDirection: TradeDirection | null;
    trades: PaperTrade[];
    stream: { symbol: string; marketType: Candle['marketType']; source: Candle['source'] } | null;
  } {
    return {
      balance: this.balance,
      initialBalance: this.options.initialBalance,
      netPnl: this.trades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0),
      openTrade: this.activeTrade ? { ...this.activeTrade } : null,
      pendingDirection: this.pendingSignal?.direction ?? null,
      trades: this.trades.map((trade) => ({ ...trade })),
      stream: this.history.length ? {
        symbol: this.history[0].symbol,
        marketType: this.history[0].marketType,
        source: this.history[0].source
      } : null
    };
  }

  public reset(): void {
    this.history.length = 0;
    this.trades.length = 0;
    this.balance = this.options.initialBalance;
    this.activeTrade = null;
    this.pendingSignal = null;
    this.streamKey = null;
  }
}
