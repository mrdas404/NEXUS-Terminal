import type { Candle } from '../types';
import { ResearchStore } from './ResearchStore';

const SYMBOLS: Record<string,string> = {
  'BTC/USDT':'BTCUSDT','ETH/USDT':'ETHUSDT','SOL/USDT':'SOLUSDT'
};
const BINANCE='https://api.binance.com/api/v3/klines';

export interface HistoricalCandleResult {
  provider:string;
  cacheUsed:boolean;
  providerError?:string;
  marketType:'LIVE';
  source:'PROVIDER_API';
  timeframe:'1m';
  symbol:string;
  candles:Candle[];
  count:number;
  requestedLimit:number;
  completeOnly:true;
}

/** Read-only public market history. Only fully closed spot candles are returned. */
export class HistoricalCandleService {
  constructor(private readonly store?:ResearchStore) {}
  async getOneMinuteCandles(symbol:string,limit=300,endTime?:number):Promise<HistoricalCandleResult>{
    const providerSymbol=SYMBOLS[symbol];
    if(!providerSymbol)throw new Error('Unsupported symbol; use BTC/USDT, ETH/USDT or SOL/USDT');
    if(!Number.isInteger(limit)||limit<1||limit>300)throw new Error('limit must be an integer from 1 to 300');
    if(endTime!==undefined&&(!Number.isFinite(endTime)||endTime<=0))throw new Error('endTime must be a positive Unix millisecond timestamp');
    const cached=this.store?.getRecentCandles({symbol,marketType:'LIVE',source:'PROVIDER_API',timeframe:'1m',limit});
    const params=new URLSearchParams({symbol:providerSymbol,interval:'1m',limit:String(limit)});
    if(endTime!==undefined)params.set('endTime',String(Math.floor(endTime)));
    let providerError:string|undefined;
    let payload:unknown=[];
    try {
      const response=await fetch(BINANCE+'?'+params.toString(),{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(10_000)});
      if(!response.ok)throw new Error('Binance historical API returned HTTP '+response.status);
      payload=await response.json();
      if(!Array.isArray(payload))throw new Error('Binance returned an invalid candle payload');
    } catch(error) {
      providerError=error instanceof Error?error.message:'Binance historical API unavailable';
      if(!cached?.length)throw error;
    }
    const now=Date.now();
    const candles:Candle[]=[];
    for(const row of payload as unknown[]){
      if(!Array.isArray(row)||row.length<6)continue;
      const [openTime,open,high,low,close,volume,closeTime]=row;
      const values=[Number(openTime),Number(open),Number(high),Number(low),Number(close),Number(volume),Number(closeTime)];
      if(!values.every(Number.isFinite))continue;
      const [ot,o,h,l,c,v,ct]=values;
      if(ot<=0||ct<=ot||ct>=now||o<=0||h<=0||l<=0||c<=0||v<0||h<Math.max(o,c,l)||l>Math.min(o,c,h))continue;
      candles.push({symbol,marketType:'LIVE',source:'PROVIDER_API',timeframe:'1m',openTime:ot,closeTime:ct,open:o,high:h,low:l,close:c,volume:v});
    }
    candles.sort((a,b)=>a.openTime-b.openTime);
    if(this.store&&candles.length)this.store.upsertCandles(candles);
    const merged=new Map<number,Candle>();
    for(const candle of cached??[])merged.set(candle.openTime,candle);
    for(const candle of candles)merged.set(candle.openTime,candle);
    const persisted=[...merged.values()].sort((a,b)=>a.openTime-b.openTime).slice(-limit);
    return {provider:providerError?'SQLite archive (Binance Spot origin)':'Binance Spot REST',cacheUsed:Boolean(providerError),...(providerError?{providerError}:{}),marketType:'LIVE',source:'PROVIDER_API',timeframe:'1m',symbol,candles:persisted,count:persisted.length,requestedLimit:limit,completeOnly:true};
  }
}
