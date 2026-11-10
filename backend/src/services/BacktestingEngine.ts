import type { Candle } from '../types';
import { MultiConfirmationSignalEngine, type MultiConfirmationSignal } from './MultiConfirmationSignalEngine';

export interface BacktestOptions {
  initialBalance: number;
  stake: number;
  payoutRate: number;
  expiryCandles: number;
}

export interface BacktestTrade {
  id: number;
  direction: 'CALL' | 'PUT';
  outcome: 'WIN' | 'LOSS' | 'TIE';
  symbol: string;
  marketType: Candle['marketType'];
  source: Candle['source'];
  signalTime: number;
  entryTime: number;
  expiryTime: number;
  entryPrice: number;
  exitPrice: number;
  stake: number;
  pnl: number;
  confirmations: number;
  confidence: number;
}

export interface BacktestReport {
  stream: { symbol: string; marketType: Candle['marketType']; source: Candle['source']; timeframe: '1m' };
  options: BacktestOptions;
  totalTrades: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  netPnl: number;
  endingBalance: number;
  returnPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  profitFactor: number | null;
  trades: BacktestTrade[];
}

const DEFAULT_OPTIONS: BacktestOptions = {
  initialBalance: 10_000,
  stake: 10,
  payoutRate: 0.8,
  expiryCandles: 1
};

function validateOptions(options: BacktestOptions): void {
  if (
    !Number.isFinite(options.initialBalance) || options.initialBalance <= 0 ||
    !Number.isFinite(options.stake) || options.stake <= 0 || options.stake > options.initialBalance ||
    !Number.isFinite(options.payoutRate) || options.payoutRate < 0 || options.payoutRate > 1 ||
    !Number.isInteger(options.expiryCandles) || options.expiryCandles < 1
  ) throw new Error('Invalid backtest options');
}

function validateCandles(candles: Candle[]): void {
  if (!candles.length) throw new Error('At least one candle is required');
  const first = candles[0];
  candles.forEach((candle, index) => {
    const valid =
      candle.symbol === first.symbol &&
      candle.marketType === first.marketType &&
      candle.source === first.source &&
      candle.timeframe === '1m' &&
      Number.isFinite(candle.openTime) &&
      Number.isFinite(candle.closeTime) &&
      candle.closeTime >= candle.openTime &&
      Number.isFinite(candle.open) && candle.open > 0 &&
      Number.isFinite(candle.high) && candle.high > 0 &&
      Number.isFinite(candle.low) && candle.low > 0 &&
      Number.isFinite(candle.close) && candle.close > 0 &&
      candle.high >= Math.max(candle.open, candle.close, candle.low) &&
      candle.low <= Math.min(candle.open, candle.close, candle.high) &&
      Number.isFinite(candle.volume) && candle.volume >= 0 &&
      (index === 0 || candle.openTime > candles[index - 1].openTime);
    if (!valid) throw new Error(`Invalid or mixed candle stream at index ${index}`);
  });
}

/**
 * Replays closed candles without look-ahead: a signal on bar i enters at
 * bar i+1 open and settles at the close of the configured expiry bar.
 * This is a binary-options-style research simulator, not a broker execution model.
 */
export class HistoricalBacktestingEngine {
  private readonly options: BacktestOptions;
  private readonly signalEngine: Pick<MultiConfirmationSignalEngine, 'evaluate'>;

  constructor(
    options: Partial<BacktestOptions> = {},
    signalEngine: Pick<MultiConfirmationSignalEngine, 'evaluate'> = new MultiConfirmationSignalEngine()
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    validateOptions(this.options);
    this.signalEngine = signalEngine;
  }

  public run(candles: Candle[]): BacktestReport {
    validateCandles(candles);
    const trades: BacktestTrade[] = [];
    let balance = this.options.initialBalance;
    let peakBalance = balance;
    let maxDrawdown = 0;
    let nextSignalIndex = 0;
    let grossWins = 0;
    let grossLosses = 0;

    for (let index = 0; index + this.options.expiryCandles < candles.length; index += 1) {
      if (index < nextSignalIndex || balance < this.options.stake) continue;
      const signal = this.signalEngine.evaluate(candles.slice(0, index + 1));
      if (!signal || signal.direction === 'WAIT') continue;

      const entryIndex = index + 1;
      const expiryIndex = index + this.options.expiryCandles;
      const entryCandle = candles[entryIndex];
      const expiryCandle = candles[expiryIndex];
      const entryPrice = entryCandle.open;
      const exitPrice = expiryCandle.close;
      const outcome = exitPrice === entryPrice
        ? 'TIE'
        : (signal.direction === 'CALL' ? exitPrice > entryPrice : exitPrice < entryPrice) ? 'WIN' : 'LOSS';
      const pnl = outcome === 'WIN'
        ? this.options.stake * this.options.payoutRate
        : outcome === 'LOSS' ? -this.options.stake : 0;

      balance += pnl;
      grossWins += Math.max(pnl, 0);
      grossLosses += Math.max(-pnl, 0);
      peakBalance = Math.max(peakBalance, balance);
      maxDrawdown = Math.max(maxDrawdown, peakBalance - balance);
      trades.push({
        id: trades.length + 1,
        direction: signal.direction,
        outcome,
        symbol: entryCandle.symbol,
        marketType: entryCandle.marketType,
        source: entryCandle.source,
        signalTime: signal.timestamp,
        entryTime: entryCandle.openTime,
        expiryTime: expiryCandle.closeTime,
        entryPrice,
        exitPrice,
        stake: this.options.stake,
        pnl,
        confirmations: signal.confirmations,
        confidence: signal.confidence
      });
      nextSignalIndex = expiryIndex;
    }

    const wins = trades.filter((trade) => trade.outcome === 'WIN').length;
    const losses = trades.filter((trade) => trade.outcome === 'LOSS').length;
    const ties = trades.length - wins - losses;
    const netPnl = balance - this.options.initialBalance;
    return {
      stream: {
        symbol: candles[0].symbol,
        marketType: candles[0].marketType,
        source: candles[0].source,
        timeframe: '1m'
      },
      options: { ...this.options },
      totalTrades: trades.length,
      wins,
      losses,
      ties,
      winRate: wins + losses === 0 ? 0 : (wins / (wins + losses)) * 100,
      netPnl,
      endingBalance: balance,
      returnPercent: (netPnl / this.options.initialBalance) * 100,
      maxDrawdown,
      maxDrawdownPercent: peakBalance === 0 ? 0 : (maxDrawdown / peakBalance) * 100,
      profitFactor: grossLosses === 0 ? (grossWins > 0 ? null : 0) : grossWins / grossLosses,
      trades
    };
  }
}
