import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoricalCandleService } from '../src/services/HistoricalCandleService';
import { ResearchStore } from '../src/services/ResearchStore';

const originalFetch=global.fetch;
const now=Date.now();
const cachedOpenTime=Math.floor((now-120_000)/60_000)*60_000;
const row=(openTime:number,closeTime:number,close='101')=>[
  openTime,'100','105','98',close,'12.5',closeTime,'0','0','0','0','0'
];

test('returns only complete, valid LIVE provider candles in ascending order',async()=>{
  global.fetch=async()=>new Response(JSON.stringify([
    row(now-180_000,now-120_001),
    row(now-60_000,now+60_000), // still open
    row(now-120_000,now-60_001,'not-a-price')
  ]),{status:200}) as Response;
  try{
    const result=await new HistoricalCandleService().getOneMinuteCandles('BTC/USDT',3);
    assert.equal(result.marketType,'LIVE');
    assert.equal(result.source,'PROVIDER_API');
    assert.equal(result.completeOnly,true);
    assert.equal(result.count,1);
    assert.equal(result.candles[0].close,101);
    assert.equal(result.candles[0].timeframe,'1m');
  }finally{global.fetch=originalFetch;}
});

test('rejects unsupported symbols and invalid limits before network access',async()=>{
  const service=new HistoricalCandleService();
  await assert.rejects(()=>service.getOneMinuteCandles('BTC/OTC',10),/Unsupported symbol/);
  await assert.rejects(()=>service.getOneMinuteCandles('BTC/USDT',301),/limit must be/);
  await assert.rejects(()=>service.getOneMinuteCandles('BTC/USDT',0),/limit must be/);
});

test('surfaces provider HTTP failures',async()=>{
  global.fetch=async()=>new Response('unavailable',{status:503}) as Response;
  try{await assert.rejects(()=>new HistoricalCandleService().getOneMinuteCandles('ETH/USDT'),/HTTP 503/);}
  finally{global.fetch=originalFetch;}
});


test('falls back to persisted LIVE candles when provider is unavailable',async()=>{
  const store=new ResearchStore(':memory:');
  const cached={symbol:'BTC/USDT',marketType:'LIVE' as const,source:'PROVIDER_API' as const,timeframe:'1m' as const,openTime:cachedOpenTime,closeTime:cachedOpenTime+59_999,open:100,high:105,low:98,close:101,volume:12.5};
  store.saveCandles([cached]);
  global.fetch=async()=>new Response('unavailable',{status:503}) as Response;
  try{
    const result=await new HistoricalCandleService(store).getOneMinuteCandles('BTC/USDT',3);
    assert.equal(result.cacheUsed,true);
    assert.equal(result.count,1);
    assert.equal(result.candles[0].openTime,cached.openTime);
  }finally{global.fetch=originalFetch;store.close();}
});
