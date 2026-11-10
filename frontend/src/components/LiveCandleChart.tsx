import { useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import type { MarketCandle } from '../hooks/useTerminalWebSocket';
const SYMBOLS=['BTC/USDT','ETH/USDT','SOL/USDT'];
interface Props { candles: Record<string,MarketCandle[]>; feedState:string; }
export function LiveCandleChart({candles,feedState}:Props){
 const [symbol,setSymbol]=useState(SYMBOLS[0]);
 const host=useRef<HTMLDivElement>(null);
 const chartRef=useRef<IChartApi|null>(null);
 const seriesRef=useRef<ISeriesApi<'Candlestick'>|null>(null);
 const data=useMemo(()=> (candles[symbol]||[]).map(c=>({time:Math.floor(c.openTime/1000) as UTCTimestamp,open:c.open,high:c.high,low:c.low,close:c.close})).sort((a,b)=>(a.time as number)-(b.time as number)),[candles,symbol]);
 useEffect(()=>{
  if(!host.current)return;
  const chart=createChart(host.current,{width:host.current.clientWidth,height:320,layout:{background:{type:ColorType.Solid,color:'transparent'},textColor:'#9ca3af'},grid:{vertLines:{color:'rgba(42,46,57,.5)'},horzLines:{color:'rgba(42,46,57,.5)'}},rightPriceScale:{borderColor:'rgba(42,46,57,.5)'},timeScale:{timeVisible:true,secondsVisible:false,borderColor:'rgba(42,46,57,.5)'},crosshair:{mode:0}});
  const series=chart.addSeries(CandlestickSeries,{upColor:'#14f195',downColor:'#ff5b6e',borderUpColor:'#14f195',borderDownColor:'#ff5b6e',wickUpColor:'#14f195',wickDownColor:'#ff5b6e'});
  chartRef.current=chart;seriesRef.current=series;
  const observer=new ResizeObserver(entries=>{const entry=entries[0];if(entry)chart.applyOptions({width:entry.contentRect.width});});
  observer.observe(host.current);
  return ()=>{observer.disconnect();chart.remove();chartRef.current=null;seriesRef.current=null;};
 },[]);
 useEffect(()=>{if(!seriesRef.current)return;seriesRef.current.setData(data);if(data.length)chartRef.current?.timeScale().fitContent();},[data]);
 return <section className="rounded-lg border border-darkBorder bg-darkSurface p-4 space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Live 1-minute candles</h2><p className="text-[11px] text-gray-500">Binance Spot · LIVE · PROVIDER_API</p></div><div className="flex items-center gap-2"><span className={feedState==='CONNECTED'?'text-neonGreen':'text-neonYellow'}>{feedState}</span><select aria-label="Live chart symbol" className="rounded border border-darkBorder bg-[#0b0e14] px-2 py-1 text-xs" value={symbol} onChange={e=>setSymbol(e.target.value)}>{SYMBOLS.map(s=><option key={s}>{s}</option>)}</select></div></div>
  <div ref={host} className="h-[320px] w-full"/>
  <p className="text-[11px] text-gray-500">{data.length} candles retained in this browser session (up to 300). No historical candle backfill is included; chart starts when the feed begins sending ticks.</p>
 </section>;
}