import { useState } from 'react';
import { FileUp, FlaskConical, Play, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';

type Market = 'LIVE'|'OTC';
type Source = 'PROVIDER_API'|'QUOTEX_WEBSOCKET'|'UNISWAP_RPC'|'SIMULATED';
type Stream = {symbol:string;marketType:Market;source:Source};
type Trade = {id:number;direction:'CALL'|'PUT';status?:'OPEN'|'WIN'|'LOSS'|'TIE';outcome?:'WIN'|'LOSS'|'TIE';entryPrice:number;exitPrice?:number;pnl?:number;entryTime:number};
type Report = {totalTrades:number;wins:number;losses:number;ties:number;winRate:number;netPnl:number;endingBalance:number;returnPercent:number;maxDrawdown:number;maxDrawdownPercent:number;profitFactor:number|null;stream:Stream;trades:Trade[]};
type Snapshot = {balance:number;initialBalance:number;netPnl:number;pendingDirection:string|null;trades:Trade[];stream:Stream|null};
const API=(import.meta.env.VITE_API_URL||'http://localhost:3001').replace(/\/$/,'');
const field='mt-1 w-full rounded border border-darkBorder bg-[#0b0e14] px-3 py-2 text-sm text-white';
const panel='rounded-lg border border-darkBorder bg-darkSurface p-4';
const cash=(v:number)=> (v<0?'-':'')+'$'+Math.abs(v).toFixed(2);

export function ResearchDashboard(){
 const [stream,setStream]=useState<Stream>({symbol:'BTC/USDT',marketType:'LIVE',source:'PROVIDER_API'});
 const [csv,setCsv]=useState(''),[fileName,setFileName]=useState('');
 const [balance,setBalance]=useState('10000'),[stake,setStake]=useState('10'),[payout,setPayout]=useState('0.8'),[expiry,setExpiry]=useState('1');
 const [report,setReport]=useState<Report|null>(null),[reportId,setReportId]=useState('');
 const [sessionId,setSessionId]=useState('nexus-paper-session'),[paper,setPaper]=useState<Snapshot|null>(null);
 const [candle,setCandle]=useState({openTime:'',open:'',high:'',low:'',close:'',volume:'0'});
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const options={initialBalance:Number(balance),stake:Number(stake),payoutRate:Number(payout),expiryCandles:Number(expiry)};
 async function api<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch(API+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>({error:'Unreadable server response'}));
  if(!response.ok)throw new Error(data.error||'Request failed: '+response.status);
  return data as T;
 }
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
 async function backtest(){
  if(!csv.trim())throw new Error('Select a CSV file or paste candle data.');
  const imported=await api<{imported:number}>('/api/research/import-csv',{stream,csv});
  const result=await api<{reportId:string;report:Report}>('/api/research/backtests',{stream,options});
  setReport(result.report);setReportId(result.reportId);setMessage('Imported '+imported.imported+' candles and saved the backtest report.');
 }
 async function createSession(){
  const result=await api<{recovered:boolean;snapshot:Snapshot}>('/api/paper/sessions',{sessionId,options});
  setPaper(result.snapshot);setMessage(result.recovered?'Existing session recovered.':'Virtual paper session created.');
 }
 async function refreshSession(){
  const result=await api<Snapshot & {trades:Trade[]}>('/api/paper/sessions/'+encodeURIComponent(sessionId));
  setPaper({...result,trades:result.trades||[]});setMessage('Session loaded from SQLite.');
 }
 async function feedCandle(){
  const t=Number(candle.openTime);if(!Number.isFinite(t))throw new Error('Enter Unix milliseconds for candle open time.');
  const payload={...stream,timeframe:'1m',openTime:t,closeTime:t+59999,open:Number(candle.open),high:Number(candle.high),low:Number(candle.low),close:Number(candle.close),volume:Number(candle.volume)};
  const result=await api<{snapshot:Snapshot}>('/api/paper/sessions/'+encodeURIComponent(sessionId)+'/candles',payload);
  setPaper(result.snapshot);setMessage('Candle processed in virtual mode.');
 }
 async function resetSession(){
  const result=await api<{snapshot:Snapshot}>('/api/paper/sessions/'+encodeURIComponent(sessionId)+'/reset',{});
  setPaper(result.snapshot);setMessage('Virtual session reset.');
 }
 return <section className="space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold"><FlaskConical className="text-neonGreen"/> Research & Paper Trading</h2><p className="mt-1 text-xs text-terminalText">Historical replay and virtual trades only. No broker orders are sent.</p></div><span className="flex items-center gap-2 rounded border border-neonGreen/30 px-3 py-2 text-xs text-neonGreen"><ShieldCheck size={15}/> PAPER MODE ONLY</span></div>
  <div className={panel}>
   <h3 className="mb-3 font-semibold">Data stream</h3><div className="grid gap-3 sm:grid-cols-3">
    <label className="text-xs text-terminalText">Symbol<input className={field} value={stream.symbol} onChange={e=>setStream({...stream,symbol:e.target.value})}/></label>
    <label className="text-xs text-terminalText">Market<select className={field} value={stream.marketType} onChange={e=>setStream({...stream,marketType:e.target.value as Market})}><option>LIVE</option><option>OTC</option></select></label>
    <label className="text-xs text-terminalText">Source<select className={field} value={stream.source} onChange={e=>setStream({...stream,source:e.target.value as Source})}><option value="PROVIDER_API">Provider API</option><option value="QUOTEX_WEBSOCKET">Quotex WebSocket</option><option value="UNISWAP_RPC">Uniswap RPC</option><option value="SIMULATED">Simulated</option></select></label>
   </div><p className="mt-2 text-[11px] text-terminalText">Market and source are explicit; simulated candles must never be labelled LIVE/OTC.</p>
  </div>
  <div className={panel}>
   <h3 className="mb-3 flex items-center gap-2 font-semibold"><FileUp size={17}/> Historical CSV backtest</h3>
   <label className="block text-xs text-terminalText">CSV: timestamp,open,high,low,close,optional volume<input className="mt-2 block w-full text-sm" type="file" accept=".csv,text/csv" onChange={async e=>{const f=e.target.files?.[0];if(f){setFileName(f.name);setCsv(await f.text());}}}/></label>
   {fileName&&<p className="mt-1 text-xs text-terminalText">{fileName}</p>}
   <textarea className={field+' mt-3 min-h-24 font-mono text-xs'} placeholder="timestamp,open,high,low,close,volume" value={csv} onChange={e=>setCsv(e.target.value)}/>
   <div className="mt-3 grid gap-3 sm:grid-cols-4">
    <label className="text-xs text-terminalText">Starting balance<input className={field} type="number" min="1" value={balance} onChange={e=>setBalance(e.target.value)}/></label>
    <label className="text-xs text-terminalText">Stake<input className={field} type="number" min="0.01" value={stake} onChange={e=>setStake(e.target.value)}/></label>
    <label className="text-xs text-terminalText">Payout (0–1)<input className={field} type="number" min="0" max="1" step="0.01" value={payout} onChange={e=>setPayout(e.target.value)}/></label>
    <label className="text-xs text-terminalText">Expiry candles<input className={field} type="number" min="1" step="1" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label>
   </div>
   <button disabled={busy} onClick={()=>run(backtest)} className="mt-3 inline-flex items-center gap-2 rounded bg-neonGreen px-4 py-2 text-sm font-bold text-black disabled:opacity-50"><Play size={15}/> Import & run backtest</button>
   {report&&<div className="mt-4 space-y-3"><div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">Backtest report</h4><button className="text-xs text-neonGreen underline" onClick={()=>navigator.clipboard?.writeText(reportId)}>Copy report ID</button></div><p className="break-all text-[11px] text-terminalText">{reportId} · {report.stream.symbol} · {report.stream.marketType} · {report.stream.source}</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Trades',String(report.totalTrades)],['Win rate',report.winRate.toFixed(1)+'%'],['Net P&L',cash(report.netPnl)],['Ending balance',cash(report.endingBalance)],['Return',report.returnPercent.toFixed(2)+'%'],['Max drawdown',cash(report.maxDrawdown)],['Drawdown %',report.maxDrawdownPercent.toFixed(2)+'%'],['Profit factor',report.profitFactor===null?'∞':report.profitFactor.toFixed(2)]].map(([k,v])=><div key={k} className="rounded border border-darkBorder bg-[#0b0e14] p-3"><p className="text-[11px] text-terminalText">{k}</p><p className="mt-1 font-mono">{v}</p></div>)}</div>
    <div className="max-h-56 overflow-auto rounded border border-darkBorder"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[#0b0e14] text-terminalText"><tr>{['#','Side','Result','Entry','Exit','P&L'].map(x=><th className="p-2" key={x}>{x}</th>)}</tr></thead><tbody>{report.trades.map(t=><tr className="border-t border-darkBorder" key={t.id}><td className="p-2">{t.id}</td><td className="p-2">{t.direction}</td><td className="p-2">{t.outcome||t.status||'—'}</td><td className="p-2">{t.entryPrice}</td><td className="p-2">{t.exitPrice??'—'}</td><td className="p-2">{t.pnl===undefined?'—':cash(t.pnl)}</td></tr>)}</tbody></table></div>
    <p className="text-[11px] text-amber-300">Historical results are not a forecast. Confidence is not a calibrated win probability; slippage and execution latency are not modelled.</p>
   </div>}
  </div>
  <div className={panel}>
   <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Paper trading session</h3><span className="text-[11px] text-terminalText">SQLite virtual ledger</span></div>
   <div className="mt-3 flex flex-wrap gap-2"><input className={field+' min-w-0 flex-1'} value={sessionId} onChange={e=>setSessionId(e.target.value)} placeholder="Session ID"/><button disabled={busy} onClick={()=>run(createSession)} className="rounded bg-neonGreen px-3 py-2 text-sm font-bold text-black">Create / Recover</button><button disabled={busy||!paper} onClick={()=>run(refreshSession)} className="flex items-center gap-1 rounded border border-darkBorder px-3 py-2 text-sm"><RefreshCw size={14}/> Refresh</button><button disabled={busy||!paper} onClick={()=>run(resetSession)} className="flex items-center gap-1 rounded border border-neonRed/50 px-3 py-2 text-sm text-neonRed"><RotateCcw size={14}/> Reset</button></div>
   {paper&&<><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Balance',cash(paper.balance)],['Net P&L',cash(paper.netPnl)],['Trades',String(paper.trades.length)],['Pending',paper.pendingDirection||'—']].map(([k,v])=><div key={k} className="rounded bg-[#0b0e14] p-3"><p className="text-xs text-terminalText">{k}</p><p className="font-mono text-lg">{v}</p></div>)}</div>
    <h4 className="mb-2 mt-4 text-sm font-semibold">Process a closed 1-minute candle</h4><div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><label className="text-xs text-terminalText">Open time (Unix ms)<input className={field} value={candle.openTime} onChange={e=>setCandle({...candle,openTime:e.target.value})}/></label>{(['open','high','low','close','volume'] as const).map(k=><label key={k} className="text-xs capitalize text-terminalText">{k}<input className={field} type="number" step="any" value={candle[k]} onChange={e=>setCandle({...candle,[k]:e.target.value})}/></label>)}</div><button disabled={busy} onClick={()=>run(feedCandle)} className="mt-3 rounded border border-neonGreen px-3 py-2 text-sm text-neonGreen">Process candle (virtual)</button>
    <div className="mt-4 max-h-56 overflow-auto rounded border border-darkBorder"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[#0b0e14] text-terminalText"><tr>{['#','Side','Status','Entry time','Entry','Exit','P&L'].map(x=><th className="p-2" key={x}>{x}</th>)}</tr></thead><tbody>{paper.trades.length?paper.trades.map(t=><tr key={t.id} className="border-t border-darkBorder"><td className="p-2">{t.id}</td><td className="p-2">{t.direction}</td><td className="p-2">{t.status}</td><td className="p-2">{new Date(t.entryTime).toLocaleString()}</td><td className="p-2">{t.entryPrice}</td><td className="p-2">{t.exitPrice??'—'}</td><td className="p-2">{t.pnl===undefined?'—':cash(t.pnl)}</td></tr>):<tr><td colSpan={7} className="p-4 text-center text-terminalText">No trades yet. Feed closed candles to the paper engine.</td></tr>}</tbody></table></div>
   </>}
  </div>
  {message&&<p role="status" className="rounded border border-neonGreen/30 p-3 text-sm text-neonGreen">{message}</p>}{error&&<p role="alert" className="rounded border border-neonRed/30 p-3 text-sm text-neonRed">{error}</p>}
 </section>;
}