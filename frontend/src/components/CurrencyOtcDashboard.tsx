import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock3, Search, Signal, TrendingDown, TrendingUp } from 'lucide-react';

type Pair = { symbol: string; label: string; group: 'Major' | 'Minor' | 'Exotic' };
const OTC_CURRENCY_PAIRS: Pair[] = [
  ...['EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD'].map(symbol=>({symbol,label:symbol+' (OTC)',group:'Major' as const})),
  ...['EUR/GBP','EUR/JPY','GBP/JPY','AUD/JPY','EUR/AUD','GBP/AUD','EUR/CAD','GBP/CAD','AUD/CAD','CHF/JPY','EUR/CHF','GBP/CHF','NZD/JPY','AUD/NZD','EUR/NZD','GBP/NZD','NZD/CAD','CAD/JPY','CAD/CHF','NZD/CHF','AUD/CHF'].map(symbol=>({symbol,label:symbol+' (OTC)',group:'Minor' as const})),
  ...['USD/BDT','USD/TRY','USD/MXN','USD/ZAR','USD/PLN','USD/NOK','USD/SEK','USD/DKK','USD/SGD','USD/HKD','USD/PKR','USD/COP','ARS/USD','BRL/USD','INR/USD','DZD/USD','EUR/SGD'].map(symbol=>({symbol,label:symbol+' (OTC)',group:'Exotic' as const}))
];

export function CurrencyOtcDashboard() {
  const [selected, setSelected] = useState('EUR/USD');
  const [timeframe, setTimeframe] = useState('1m');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<'All' | Pair['group']>('All');
  const filtered = useMemo(()=>OTC_CURRENCY_PAIRS.filter(pair=>
    (group==='All'||pair.group===group) && (pair.label.toLowerCase().includes(search.toLowerCase())||pair.symbol.toLowerCase().includes(search.toLowerCase()))
  ),[group,search]);
  return <div className="min-h-screen bg-[#080b12] text-white">
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#0b0e14] px-4 py-4 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2 text-emerald-400"><Activity size={20}/><span className="text-xs font-bold tracking-[.25em]">NEXUS · OTC DESK</span></div><h1 className="mt-1 text-xl font-bold tracking-wide">QUOTEX CURRENCY ANALYSIS</h1></div>
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">OTC DATA SOURCE NOT CONNECTED</div>
      </div>
    </header>
    <main className="mx-auto grid max-w-7xl gap-5 p-4 md:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)] md:p-8">
      <section className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-[#101621] p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-slate-400">SELECTED OTC CURRENCY</p><h2 className="mt-1 text-2xl font-bold">{selected} <span className="text-sm font-medium text-amber-300">(OTC)</span></h2></div><div className="flex gap-2">{['1m','5m','15m'].map(tf=><button key={tf} onClick={()=>setTimeframe(tf)} className={timeframe===tf?'rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-black':'rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300'}>{tf}</button>)}</div></div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-800 bg-[#0b111b] p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><TrendingUp size={15}/> CALL / UP</div><div className="mt-2 text-xl font-bold text-emerald-400">WAIT</div></div>
            <div className="rounded-lg border border-slate-800 bg-[#0b111b] p-4"><div className="flex items-center gap-2 text-xs text-slate-400"><TrendingDown size={15}/> PUT / DOWN</div><div className="mt-2 text-xl font-bold text-rose-400">WAIT</div></div>
          </div>
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4"><AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={18}/><div><p className="text-sm font-semibold text-amber-200">No verified Quotex OTC candles yet</p><p className="mt-1 text-xs leading-5 text-slate-400">CALL/PUT analysis will remain WAIT until a permitted, verified OTC price-and-candle feed is connected. Real Forex or crypto prices will not be substituted for Quotex OTC prices.</p></div></div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span className="flex items-center gap-1"><Clock3 size={13}/> Analysis timeframe: {timeframe}</span><span className="flex items-center gap-1"><Signal size={13}/> RSI · EMA · MACD · Bollinger · Stoch RSI</span></div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-[#101621] p-4"><h3 className="font-semibold">Signal history</h3><p className="mt-3 rounded-lg bg-[#0b111b] p-4 text-center text-sm text-slate-500">No verified OTC signals yet.</p></div>
      </section>
      <aside className="rounded-xl border border-slate-800 bg-[#101621] p-4">
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">OTC Currency Pairs</h3><span className="text-xs text-slate-500">{filtered.length} listed</span></div>
        <div className="relative mt-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search currency pair..." className="w-full rounded-lg border border-slate-700 bg-[#0b111b] py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"/></div>
        <div className="mt-3 flex flex-wrap gap-2">{(['All','Major','Minor','Exotic'] as const).map(item=><button key={item} onClick={()=>setGroup(item)} className={group===item?'rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black':'rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300'}>{item}</button>)}</div>
        <div className="mt-3 max-h-[520px] space-y-1 overflow-y-auto pr-1">{filtered.map(pair=><button key={pair.symbol} onClick={()=>setSelected(pair.symbol)} className={selected===pair.symbol?'flex w-full items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-3 text-left':'flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-3 text-left hover:bg-slate-800/70'}><span className="text-sm font-medium">{pair.label}</span><span className="text-[10px] text-slate-500">{pair.group}</span></button>)}</div>
        <p className="mt-3 text-[10px] leading-4 text-slate-500">Initial currency-only reference catalogue. Exact pair availability can change on Quotex; live catalogue sync is required to confirm every currently tradable pair.</p>
      </aside>
    </main>
    <footer className="mx-auto max-w-7xl px-4 pb-6 text-[10px] leading-5 text-slate-600 md:px-8">Read-only analysis interface. No Quotex account access, broker orders, or guaranteed outcomes. OTC instruments are platform-specific quotes.</footer>
  </div>;
}
