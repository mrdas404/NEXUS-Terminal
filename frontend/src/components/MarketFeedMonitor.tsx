import type { MarketFeedStatus, MarketFeedTick } from '../hooks/useTerminalWebSocket';
import { Activity, AlertTriangle, Radio, WifiOff } from 'lucide-react';

interface Props {
  status: MarketFeedStatus;
  ticks: MarketFeedTick[];
  connected: boolean;
}
const money=(v:number)=>v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:6});
const age=(time:number|null)=>time===null?'No ticks':Math.max(0,Math.floor((Date.now()-time)/1000))+'s ago';

export function MarketFeedMonitor({status,ticks,connected}:Props){
 const state=status.state;
 const tone=state==='CONNECTED'?'text-neonGreen border-neonGreen/40':state==='STALE'?'text-neonYellow border-neonYellow/40':'text-neonRed border-neonRed/40';
 const Icon=state==='CONNECTED'?Radio:state==='STALE'?AlertTriangle:WifiOff;
 return <section className="rounded-lg border border-darkBorder bg-darkSurface p-4 space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div className="flex items-center gap-2"><Activity size={17} className="text-neonGreen"/><h2 className="font-semibold">Market data feed</h2></div>
   <span className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs ${tone}`}><Icon size={13}/>{state}</span>
  </div>
  <div className="grid gap-2 sm:grid-cols-3 text-xs">
   <div className="rounded bg-[#0b0e14] p-3"><p className="text-gray-500">Provider</p><p className="mt-1 text-gray-200">{status.provider}</p></div>
   <div className="rounded bg-[#0b0e14] p-3"><p className="text-gray-500">Provenance</p><p className="mt-1 text-neonGreen">{status.marketType} · {status.source}</p></div>
   <div className="rounded bg-[#0b0e14] p-3"><p className="text-gray-500">Last market tick</p><p className="mt-1 text-gray-200">{age(status.lastMessageAt)}</p></div>
  </div>
  {!connected&&<p className="text-xs text-neonRed">Dashboard server connection is offline. Feed status may be out of date.</p>}
  {state==='STALE'&&<p className="text-xs text-neonYellow">No recent market message. Treat displayed prices as stale; do not use them for decisions.</p>}
  {state==='DISCONNECTED'&&<p className="text-xs text-neonRed">Provider connection lost. Automatic reconnect is active (attempt {status.reconnectAttempt}).</p>}
  {status.lastError&&<p className="break-words text-xs text-neonRed">Provider error: {status.lastError}</p>}
  <div className="grid gap-2 sm:grid-cols-3">
   {status.symbols.map(symbol=>{
    const tick=ticks.find(t=>t.symbol===symbol);
    return <div key={symbol} className="rounded border border-darkBorder bg-[#0b0e14] p-3">
     <div className="flex items-center justify-between"><span className="text-xs text-gray-400">{symbol}</span><span className="text-[10px] text-neonGreen">LIVE SPOT</span></div>
     <p className="mt-2 font-mono text-lg">{tick?money(tick.price):'—'}</p>
     <p className="mt-1 text-[10px] text-gray-500">{tick?'Tick '+new Date(tick.timestamp).toLocaleTimeString():'Waiting for tick'}</p>
    </div>;
   })}
  </div>
  <p className="text-[11px] text-gray-500">This is Binance crypto spot data, not Quotex OTC pricing. No broker orders are sent. OTC feed is not connected.</p>
 </section>;
}
