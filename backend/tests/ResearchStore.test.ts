import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchStore } from '../src/services/ResearchStore';
import type { Candle } from '../src/types';

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
