import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchStore } from '../src/services/ResearchStore';
import type { Candle } from '../src/types';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const candle=(openTime:number,close=101):Candle=>({
  symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API',timeframe:'1m',
  openTime,closeTime:openTime+59_999,open:100,high:105,low:98,close,volume:12.5
});

test('persists LIVE candles and returns them in chronological order',()=>{
  const store=new ResearchStore(':memory:');
  try{
    store.saveCandles([candle(120_000),candle(60_000)]);
    const result=store.getRecentCandles({symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API',limit:10});
    assert.deepEqual(result.map(c=>c.openTime),[60_000,120_000]);
    assert.equal(result[0].marketType,'LIVE');
    assert.equal(result[0].source,'PROVIDER_API');
  }finally{store.close();}
});

test('upserts a duplicate candle without creating duplicate rows',()=>{
  const store=new ResearchStore(':memory:');
  try{
    store.upsertCandles([candle(60_000,101)]);
    store.upsertCandles([candle(60_000,102)]);
    const result=store.getCandles({symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API'});
    assert.equal(result.length,1);
    assert.equal(result[0].close,102);
  }finally{store.close();}
});

test('rejects invalid OHLC data before writing',()=>{
  const store=new ResearchStore(':memory:');
  try{
    assert.throws(()=>store.saveCandles([{...candle(60_000),high:97}]),/invalid OHLC/);
    assert.equal(store.getCandles({symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API'}).length,0);
  }finally{store.close();}
});

test('rejects mixed streams in a single persistence batch',()=>{
  const store=new ResearchStore(':memory:');
  try{
    assert.throws(()=>store.saveCandles([candle(60_000),{...candle(120_000),source:'SIMULATED'}]),/mixed candle streams/);
  }finally{store.close();}
});


test('strict imports reject duplicates while provider upserts remain idempotent',()=>{
  const store=new ResearchStore(':memory:');
  try{
    store.saveCandles([candle(60_000)]);
    assert.throws(()=>store.saveCandles([candle(60_000,102)]));
    store.upsertCandles([candle(60_000,103)]);
    assert.equal(store.getCandles({symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API'})[0].close,103);
  }finally{store.close();}
});

test('rolls back an entire candle batch when a later row is invalid',()=>{
  const store=new ResearchStore(':memory:');
  try{
    assert.throws(()=>store.saveCandles([candle(60_000),{...candle(120_000),high:97}]),/invalid OHLC/);
    assert.equal(store.getCandles({symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API'}).length,0);
  }finally{store.close();}
});

test('keeps LIVE and OTC candles isolated for the same symbol and time',()=>{
  const store=new ResearchStore(':memory:');
  try{
    store.saveCandles([candle(60_000)]);
    store.saveCandles([{...candle(60_000),marketType:'OTC',source:'QUOTEX_WEBSOCKET',close:202,high:205}]);
    assert.equal(store.getCandles({symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API'})[0].close,101);
    assert.equal(store.getCandles({symbol:'BTC/USDT',marketType:'OTC',source:'QUOTEX_WEBSOCKET'})[0].close,202);
  }finally{store.close();}
});

test('recovers persisted candles after closing and reopening the SQLite file',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'nexus-integrity-'));
  const databasePath=path.join(directory,'research.db');
  try{
    const first=new ResearchStore(databasePath);
    first.saveCandles([candle(60_000),candle(120_000)]);
    first.close();
    const recovered=new ResearchStore(databasePath);
    try{
      const rows=recovered.getRecentCandles({symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API',limit:10});
      assert.deepEqual(rows.map(row=>row.openTime),[60_000,120_000]);
    }finally{recovered.close();}
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('rejects non-canonical one-minute timestamps',()=>{
  const store=new ResearchStore(':memory:');
  try{
    assert.throws(()=>store.saveCandles([{...candle(60_001),openTime:60_001,closeTime:120_000}]),/invalid OHLC/);
  }finally{store.close();}
});


test('reports a healthy SQLite connection and integrity check',()=>{
  const store=new ResearchStore(':memory:');
  try{assert.deepEqual(store.healthCheck(),{ok:true,integrity:'ok'});}
  finally{store.close();}
});

test('provider upsert rejects non-canonical one-minute timestamps',()=>{
  const store=new ResearchStore(':memory:');
  try{
    assert.throws(()=>store.upsertCandles([{...candle(60_000),openTime:60_001,closeTime:120_000}]),/invalid OHLC/);
    assert.equal(store.getCandles({symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API'}).length,0);
  }finally{store.close();}
});
