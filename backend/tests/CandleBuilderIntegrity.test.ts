import test from 'node:test';
import assert from 'node:assert/strict';
import { CandleBuilder } from '../src/services/CandleBuilder';
import type { MarketTick } from '../src/types';

const tick=(timestamp:number,price:number,tradeId?:number,overrides:Partial<MarketTick>={}):MarketTick=>({
  symbol:'BTC/USDT',price,timestamp,volume:1,marketType:'LIVE',source:'PROVIDER_API',
  ...(tradeId===undefined?{}:{tradeId}),...overrides
});

test('ignores duplicate provider trade ids without double-counting volume',()=>{
  const builder=new CandleBuilder();
  const first=tick(60_001,100,77);
  assert.ok(builder.update(first));
  assert.equal(builder.update(first),null);
  const current=builder.getCurrentCandle('LIVE','PROVIDER_API','BTC/USDT');
  assert.equal(current?.volume,1);
  assert.equal(current?.close,100);
});

test('ignores out-of-order ticks even when they fall in the current minute',()=>{
  const builder=new CandleBuilder();
  builder.update(tick(60_020,100,1));
  assert.equal(builder.update(tick(60_010,150,2)),null);
  assert.equal(builder.getCurrentCandle('LIVE','PROVIDER_API','BTC/USDT')?.high,100);
});

test('reports missing whole-minute candle gaps without fabricating candles',()=>{
  const builder=new CandleBuilder();
  builder.update(tick(60_001,100));
  const result=builder.update(tick(240_001,110));
  assert.equal(result?.closedCandle?.openTime,60_000);
  assert.deepEqual(result?.gap,{fromOpenTime:120_000,toOpenTime:180_000,missingMinutes:2});
  assert.equal(builder.getCurrentCandle('LIVE','PROVIDER_API','BTC/USDT')?.openTime,240_000);
});

test('keeps identical symbol and time isolated by market and source',()=>{
  const builder=new CandleBuilder();
  builder.update(tick(60_001,100));
  builder.update(tick(60_001,200,undefined,{marketType:'OTC',source:'QUOTEX_WEBSOCKET'}));
  assert.equal(builder.getCurrentCandle('LIVE','PROVIDER_API','BTC/USDT')?.close,100);
  assert.equal(builder.getCurrentCandle('OTC','QUOTEX_WEBSOCKET','BTC/USDT')?.close,200);
});

test('rejects invalid tick values',()=>{
  const builder=new CandleBuilder();
  assert.equal(builder.update(tick(60_001,0)),null);
  assert.equal(builder.update(tick(Number.NaN,100)),null);
  assert.equal(builder.getCurrentCandle('LIVE','PROVIDER_API','BTC/USDT'),undefined);
});
