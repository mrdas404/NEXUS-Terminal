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


test('paper trade expiry time reflects the configured number of candles', () => {
  const engine = new PaperTradingEngine(
    { initialBalance: 100, stake: 10, payoutRate: 0.8, expiryCandles: 2 }, alwaysCall
  );
  engine.processCandle(candle(0, 100, 100));
  const opened = engine.processCandle(candle(1, 101, 102));
  assert.equal(opened.opened?.expiryTime, candle(2, 102, 104).closeTime);
  assert.equal(opened.settled, undefined);
  const settled = engine.processCandle(candle(2, 102, 104));
  assert.equal(settled.settled?.status, 'WIN');
});


import { HistoricalCsvImporter } from '../src/services/HistoricalCsvImporter';
import { ResearchStore } from '../src/services/ResearchStore';
import { HistoricalResearchService } from '../src/services/HistoricalResearchService';
import { PersistentPaperTradingService } from '../src/services/PersistentPaperTradingService';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';

test('CSV import tags selected market/source and supports seconds timestamps',()=>{
 const result=new HistoricalCsvImporter().parse('timestamp,open,high,low,close,volume\n1700000040,100,103,99,102,12',{symbol:'BTC/USDT',marketType:'OTC',source:'PROVIDER_API'});
 assert.equal(result.rowsRead,1);assert.equal(result.candles[0].openTime,1700000040000);assert.equal(result.candles[0].marketType,'OTC');
});
test('CSV importer rejects duplicate timestamps and invalid OHLC',()=>{
 const imp=new HistoricalCsvImporter(),opts={symbol:'BTC/USDT',marketType:'LIVE' as const,source:'PROVIDER_API' as const};
 assert.throws(()=>imp.parse('timestamp,open,high,low,close\n1700000040000,100,101,99,100\n1700000040000,100,101,99,100',opts),/strictly chronological/);
 assert.throws(()=>imp.parse('timestamp,open,high,low,close\n1700000040000,100,99,101,100',opts),/outside valid ranges/);
});
test('research store isolates streams and persists backtest reports',()=>{
 const p=join(tmpdir(),`nexus-research-${randomUUID()}.db`),store=new ResearchStore(p);
 try{
  const candles=[candle(0,100,101),candle(1,101,102),candle(2,102,103)];
  store.saveCandles(candles);assert.equal(store.getCandles({symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API'}).length,3);
  assert.equal(store.getCandles({symbol:'BTC/USDT',marketType:'OTC',source:'PROVIDER_API'}).length,0);
  const report=new HistoricalBacktestingEngine({},alwaysCall).run(candles);store.saveBacktestReport(report,'test-report');
  assert.equal(store.getBacktestReport('test-report')?.totalTrades,report.totalTrades);
  assert.throws(()=>store.saveCandles(candles),/UNIQUE constraint/);
 }finally{store.close();rmSync(p,{force:true});rmSync(p+'-wal',{force:true});rmSync(p+'-shm',{force:true});}
});
test('persistent paper service saves virtual balance and trade history',()=>{
 const p=join(tmpdir(),`nexus-paper-${randomUUID()}.db`),store=new ResearchStore(p);
 try{
  const engine=new PaperTradingEngine({initialBalance:100,stake:10,payoutRate:0.8,expiryCandles:1},alwaysCall);
  const service=new PersistentPaperTradingService('paper-test',store,engine);
  service.processCandle(candle(0,100,100));service.processCandle(candle(1,101,103));
  assert.equal(store.getPaperSession('paper-test')?.balance,108);assert.equal(store.getPaperTrades('paper-test')[0].status,'WIN');
 }finally{store.close();rmSync(p,{force:true});rmSync(p+'-wal',{force:true});rmSync(p+'-shm',{force:true});}
});
test('historical research service imports and runs only the requested stream',()=>{
 const p=join(tmpdir(),`nexus-run-${randomUUID()}.db`),store=new ResearchStore(p);
 try{
  const service=new HistoricalResearchService(store);
  service.importCsv('timestamp,open,high,low,close\n1700000040000,100,101,99,100\n1700000100000,100,102,99,101\n1700000160000,101,103,100,102',{symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API'});
  const result=service.runBacktest({symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API'});
  assert.equal(store.getBacktestReport(result.reportId)?.stream.marketType,'LIVE');
 }finally{store.close();rmSync(p,{force:true});rmSync(p+'-wal',{force:true});rmSync(p+'-shm',{force:true});}
});
