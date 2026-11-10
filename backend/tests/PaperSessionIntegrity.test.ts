import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ResearchStore } from '../src/services/ResearchStore';
import { PersistentPaperTradingService } from '../src/services/PersistentPaperTradingService';
import { PaperTradingEngine } from '../src/services/PaperTradingEngine';
import type { Candle } from '../src/types';

const candle=(openTime:number):Candle=>({
  symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API',timeframe:'1m',
  openTime,closeTime:openTime+59_999,open:100,high:105,low:98,close:101,volume:2
});

test('paper session state survives SQLite restart and rejects replayed candles',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'nexus-paper-recovery-'));
  const databasePath=path.join(directory,'paper.db');
  try{
    const firstStore=new ResearchStore(databasePath);
    const first=new PersistentPaperTradingService('integrity-session',firstStore,new PaperTradingEngine({initialBalance:500,stake:10}));
    first.processCandle(candle(60_000));
    first.processCandle(candle(120_000));
    const before=first.getSnapshot();
    assert.throws(()=>first.processCandle(candle(120_000)),/strictly chronological/);
    firstStore.close();

    const secondStore=new ResearchStore(databasePath);
    try{
      const recovered=new PersistentPaperTradingService('integrity-session',secondStore);
      assert.deepEqual(recovered.getSnapshot(),before);
      assert.equal(secondStore.getPaperCandles('integrity-session').length,2);
    }finally{secondStore.close();}
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('paper session refuses a different market/source stream',()=>{
  const store=new ResearchStore(':memory:');
  try{
    const session=new PersistentPaperTradingService('isolated-session',store,new PaperTradingEngine());
    session.processCandle(candle(60_000));
    assert.throws(()=>session.processCandle({...candle(120_000),marketType:'OTC',source:'QUOTEX_WEBSOCKET'}),/locked to one market/);
    assert.equal(store.getPaperCandles('isolated-session').length,1);
  }finally{store.close();}
});
