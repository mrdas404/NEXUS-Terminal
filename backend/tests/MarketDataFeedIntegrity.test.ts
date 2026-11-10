import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBinanceTradeMessage, MarketDataFeedService } from '../src/services/MarketDataFeedService';

const receivedAt=1_800_000_000_000;
const message=(extra:Record<string,unknown>={})=>JSON.stringify({
  e:'trade',s:'BTCUSDT',p:'65000.25',q:'0.01',T:receivedAt-100,t:987654,
  ...extra
});

test('parses combined-stream trades and retains provider trade identity',()=>{
  const tick=parseBinanceTradeMessage(JSON.stringify({stream:'btcusdt@trade',data:JSON.parse(message())}),receivedAt);
  assert.equal(tick?.symbol,'BTC/USDT');
  assert.equal(tick?.price,65000.25);
  assert.equal(tick?.tradeId,987654);
  assert.equal(tick?.marketType,'LIVE');
  assert.equal(tick?.source,'PROVIDER_API');
});

test('rejects unknown symbols, invalid prices and stale/future events',()=>{
  assert.equal(parseBinanceTradeMessage(message({s:'DOGEUSDT'}),receivedAt),null);
  assert.equal(parseBinanceTradeMessage(message({p:'0'}),receivedAt),null);
  assert.equal(parseBinanceTradeMessage(message({T:receivedAt-121_000}),receivedAt),null);
  assert.equal(parseBinanceTradeMessage(message({T:receivedAt+30_001}),receivedAt),null);
});

test('ingestion emits one tick for repeated provider event ids',()=>{
  const service=new MarketDataFeedService();
  let count=0;
  service.on('tick',()=>count++);
  const tick=parseBinanceTradeMessage(message(),receivedAt)!;
  assert.equal(service.ingestTick(tick),true);
  assert.equal(service.ingestTick(tick),false);
  assert.equal(count,1);
  service.stop();
});
