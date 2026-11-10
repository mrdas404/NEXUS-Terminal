import { useState } from 'react';
import type { MarketCandle } from '../hooks/useTerminalWebSocket';
import { ShieldCheck, Send, RefreshCw } from 'lucide-react';
const API=(import.meta.env.VITE_API_URL||'http://localhost:3001').replace(/\/$/,'');
interface Props { candles:MarketCandle[]; }
interface Snapshot { balance:number;netPnl:number;trades:any[];stream:any; }
const OPTIONS={initialBalance:10000,stake:10,payoutRate:0.8,expiryCandles:1};
export function LivePaperFeedBridge({candles}:Props){
 const [sessionId,setSessionId]=useState('nexus-live-paper-session');
 const [enabled,setEnabled]=useState(false),[ready,setReady]=useState(false),[snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[lastSent,setLastSent]=useState('');
 const latest=[...candles].sort((a,b)=>b.closeTime-a.closeTime)[0];
 async function request<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(API+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json().catch(()=>({error:'Invalid server response'}));if(!response.ok)throw new Error(result.error||'Request failed');return result as T;
 }
 async function run(action:()=>Promise<void>){setBusy(true);setMessage('');setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
 async function createOrRecover(){
  if(!sessionId.trim())throw new Error('Enter a session ID.');
  const result=await request<{snapshot:Snapshot;recovered:boolean}>('/api/paper/sessions',{sessionId:sessionId.trim(),options:OPTIONS});
  setSnapshot(result.snapshot);setReady(true);setMessage(result.recovered?'Recovered existing virtual session.':'Created virtual session.');
 }
 async function sendClosedCandle(){
  if(!enabled)throw new Error('Enable the explicit paper-feed consent first.');
  if(!ready)throw new Error('Create or recover the paper session first.');
  if(!latest)throw new Error('No closed LIVE candle has arrived yet.');
  if(latest.marketType!=='LIVE'||latest.source!=='PROVIDER_API'||latest.timeframe!=='1m')throw new Error('Only LIVE / PROVIDER_API 1m candles are accepted.');
  const key=[latest.symbol,latest.openTime,latest.source].join(':');if(key===lastSent)throw new Error('This candle was already submitted from this page.');
  const result=await request<{snapshot:Snapshot}>('/api/paper/sessions/'+encodeURIComponent(sessionId.trim())+'/candles',latest);
  setSnapshot(result.snapshot);setLastSent(key);setMessage('One closed LIVE spot candle submitted to the virtual paper engine.');
 }
 return <section className="rounded-lg border border-darkBorder bg-darkSurface p-4 space-y-3">
  <div className="flex items-center gap-2"><ShieldCheck size={17} className="text-neonGreen"/><h2 className="font-semibold">Manual LIVE → Paper bridge</h2></div>
  <p className="text-xs text-gray-400">Opt-in only: no automatic forwarding. Only fully closed Binance LIVE spot candles can be submitted to a virtual paper session. No broker orders.</p>
  <div className="flex flex-wrap gap-2"><input aria-label="Paper session ID" className="min-w-0 flex-1 rounded border border-darkBorder bg-[#0b0e14] px-3 py-2 text-sm" value={sessionId} onChange={e=>{setSessionId(e.target.value);setReady(false);setSnapshot(null);}}/><button disabled={busy} onClick={()=>run(createOrRecover)} className="rounded bg-neonGreen px-3 py-2 text-sm font-bold text-black"><RefreshCw size={14} className="mr-1 inline"/>Create / Recover</button></div>
  <label className="flex items-start gap-2 text-xs text-gray-300"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} className="mt-0.5"/>I understand this sends only a closed LIVE crypto spot candle into a virtual paper session, not a Quotex quote or real trade.</label>
  <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#0b0e14] p-3"><div className="text-xs"><p className="text-gray-500">Latest closed candle</p><p className="mt-1 text-gray-200">{latest?latest.symbol+' · '+new Date(latest.openTime).toLocaleTimeString()+' · close '+latest.close:'Waiting for a closed candle'}</p></div><button disabled={busy||!enabled||!ready||!latest} onClick={()=>run(sendClosedCandle)} className="rounded border border-neonGreen px-3 py-2 text-xs text-neonGreen disabled:opacity-40"><Send size={13} className="mr-1 inline"/>Send one candle</button></div>
  {snapshot&&<div className="grid grid-cols-3 gap-2 text-xs"><div className="rounded bg-[#0b0e14] p-2"><p className="text-gray-500">Virtual balance</p><p className="mt-1 font-mono">{snapshot.balance.toFixed(2)}</p></div><div className="rounded bg-[#0b0e14] p-2"><p className="text-gray-500">Net P&L</p><p className="mt-1 font-mono">{snapshot.netPnl.toFixed(2)}</p></div><div className="rounded bg-[#0b0e14] p-2"><p className="text-gray-500">Trades</p><p className="mt-1 font-mono">{snapshot.trades?.length||0}</p></div></div>}
  {message&&<p role="status" className="text-xs text-neonGreen">{message}</p>}{error&&<p role="alert" className="text-xs text-neonRed">{error}</p>}
 </section>;
}