import Database from 'better-sqlite3';
import type { Candle } from '../types';
import type { BacktestReport } from './BacktestingEngine';
import type { PaperTrade } from './PaperTradingEngine';
import path from 'node:path';

export interface StoredPaperSession {
  sessionId: string; initialBalance: number; balance: number; netPnl: number;
  snapshot: Record<string, unknown>; updatedAt: number;
}

type PaperSnapshot = {
  balance:number; initialBalance:number; netPnl:number; trades:PaperTrade[];
  stream:{symbol:string;marketType:string;source:string}|null; [key:string]:unknown;
};

export class ResearchStore {
  private readonly db:Database.Database;
  constructor(databasePath=path.resolve(process.cwd(),'prisma/dev.db')) {
    this.db=new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }
  private initSchema(){this.db.exec(`
    CREATE TABLE IF NOT EXISTS research_candles(symbol TEXT NOT NULL,market_type TEXT NOT NULL,source TEXT NOT NULL,timeframe TEXT NOT NULL,open_time INTEGER NOT NULL,close_time INTEGER NOT NULL,open REAL NOT NULL,high REAL NOT NULL,low REAL NOT NULL,close REAL NOT NULL,volume REAL NOT NULL,PRIMARY KEY(symbol,market_type,source,timeframe,open_time));
    CREATE INDEX IF NOT EXISTS idx_research_candles_stream ON research_candles(symbol,market_type,source,timeframe,open_time);
    CREATE TABLE IF NOT EXISTS backtest_reports(report_id TEXT PRIMARY KEY,symbol TEXT NOT NULL,market_type TEXT NOT NULL,source TEXT NOT NULL,created_at INTEGER NOT NULL,report_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS paper_sessions(session_id TEXT PRIMARY KEY,initial_balance REAL NOT NULL,balance REAL NOT NULL,net_pnl REAL NOT NULL,snapshot_json TEXT NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS paper_trades(session_id TEXT NOT NULL,trade_id INTEGER NOT NULL,status TEXT NOT NULL,trade_json TEXT NOT NULL,PRIMARY KEY(session_id,trade_id),FOREIGN KEY(session_id) REFERENCES paper_sessions(session_id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS paper_session_candles(session_id TEXT NOT NULL,open_time INTEGER NOT NULL,candle_json TEXT NOT NULL,PRIMARY KEY(session_id,open_time),FOREIGN KEY(session_id) REFERENCES paper_sessions(session_id) ON DELETE CASCADE);
  `);}
  public saveCandles(candles:Candle[]):number {
    if(!candles.length)return 0; const first=candles[0];
    const insert=this.db.prepare('INSERT INTO research_candles(symbol,market_type,source,timeframe,open_time,close_time,open,high,low,close,volume) VALUES(@symbol,@marketType,@source,@timeframe,@openTime,@closeTime,@open,@high,@low,@close,@volume) ON CONFLICT(symbol,market_type,source,timeframe,open_time) DO UPDATE SET close_time=excluded.close_time,open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume');
    this.db.transaction((items:Candle[])=>{for(const c of items){
      if(c.symbol!==first.symbol||c.marketType!==first.marketType||c.source!==first.source||c.timeframe!=='1m')throw new Error('Cannot persist mixed candle streams in one import');
      if(!Number.isFinite(c.openTime)||!Number.isFinite(c.closeTime)||c.closeTime<=c.openTime||![c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)||c.low<=0||c.volume<0||c.high<Math.max(c.open,c.close,c.low)||c.low>Math.min(c.open,c.close,c.high))throw new Error('Cannot persist an invalid OHLC candle');
      insert.run({symbol:c.symbol,marketType:c.marketType,source:c.source,timeframe:c.timeframe,openTime:c.openTime,closeTime:c.closeTime,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume});
    }})(candles); return candles.length;
  }
  public getRecentCandles(s:{symbol:string;marketType:Candle['marketType'];source:Candle['source'];timeframe?:Candle['timeframe'];limit?:number}):Candle[]{
    const limit=s.limit??300;
    if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('limit must be an integer from 1 to 1000');
    const rows=this.db.prepare('SELECT * FROM research_candles WHERE symbol=? AND market_type=? AND source=? AND timeframe=? ORDER BY open_time DESC LIMIT ?').all(s.symbol,s.marketType,s.source,s.timeframe??'1m',limit) as Array<Record<string,unknown>>;
    return rows.reverse().map(r=>({symbol:String(r.symbol),marketType:r.market_type as Candle['marketType'],source:r.source as Candle['source'],timeframe:'1m',openTime:Number(r.open_time),closeTime:Number(r.close_time),open:Number(r.open),high:Number(r.high),low:Number(r.low),close:Number(r.close),volume:Number(r.volume)}));
  }
  public getCandles(s:{symbol:string;marketType:Candle['marketType'];source:Candle['source'];startTime?:number;endTime?:number}):Candle[]{
    const rows=this.db.prepare('SELECT * FROM research_candles WHERE symbol=@symbol AND market_type=@marketType AND source=@source AND (@startTime IS NULL OR open_time>=@startTime) AND (@endTime IS NULL OR open_time<=@endTime) ORDER BY open_time').all({symbol:s.symbol,marketType:s.marketType,source:s.source,startTime:s.startTime??null,endTime:s.endTime??null}) as Array<Record<string,unknown>>;
    return rows.map(r=>({symbol:String(r.symbol),marketType:r.market_type as Candle['marketType'],source:r.source as Candle['source'],timeframe:'1m',openTime:Number(r.open_time),closeTime:Number(r.close_time),open:Number(r.open),high:Number(r.high),low:Number(r.low),close:Number(r.close),volume:Number(r.volume)}));
  }
  public saveBacktestReport(report:BacktestReport,id:string){this.db.prepare('INSERT INTO backtest_reports(report_id,symbol,market_type,source,created_at,report_json) VALUES(?,?,?,?,?,?)').run(id,report.stream.symbol,report.stream.marketType,report.stream.source,Date.now(),JSON.stringify(report));}
  public getBacktestReport(id:string):BacktestReport|null{const r=this.db.prepare('SELECT report_json FROM backtest_reports WHERE report_id=?').get(id) as {report_json:string}|undefined;return r?JSON.parse(r.report_json) as BacktestReport:null;}
  private writeSnapshot(id:string,s:PaperSnapshot){
    this.db.prepare('INSERT INTO paper_sessions(session_id,initial_balance,balance,net_pnl,snapshot_json,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET initial_balance=excluded.initial_balance,balance=excluded.balance,net_pnl=excluded.net_pnl,snapshot_json=excluded.snapshot_json,updated_at=excluded.updated_at').run(id,s.initialBalance,s.balance,s.netPnl,JSON.stringify(s),Date.now());
    const up=this.db.prepare('INSERT INTO paper_trades(session_id,trade_id,status,trade_json) VALUES(?,?,?,?) ON CONFLICT(session_id,trade_id) DO UPDATE SET status=excluded.status,trade_json=excluded.trade_json');
    for(const t of s.trades)up.run(id,t.id,t.status,JSON.stringify(t));
  }
  public savePaperSnapshot(id:string,s:PaperSnapshot){this.db.transaction(()=>this.writeSnapshot(id,s))();}
  public savePaperProgress(id:string,candle:Candle,s:PaperSnapshot){
    this.db.transaction(()=>{
      this.writeSnapshot(id,s);
      this.db.prepare('INSERT INTO paper_session_candles(session_id,open_time,candle_json) VALUES(?,?,?)').run(id,candle.openTime,JSON.stringify(candle));
    })();
  }
  public getPaperCandles(id:string):Candle[]{
    return (this.db.prepare('SELECT candle_json FROM paper_session_candles WHERE session_id=? ORDER BY open_time').all(id) as Array<{candle_json:string}>).map(r=>JSON.parse(r.candle_json) as Candle);
  }
  public clearPaperSession(id:string,s:PaperSnapshot){
    this.db.transaction(()=>{
      this.db.prepare('DELETE FROM paper_session_candles WHERE session_id=?').run(id);
      this.db.prepare('DELETE FROM paper_trades WHERE session_id=?').run(id);
      this.writeSnapshot(id,s);
    })();
  }
  public getPaperSession(id:string):StoredPaperSession|null{
    const r=this.db.prepare('SELECT * FROM paper_sessions WHERE session_id=?').get(id) as {session_id:string;initial_balance:number;balance:number;net_pnl:number;snapshot_json:string;updated_at:number}|undefined;
    return r?{sessionId:r.session_id,initialBalance:r.initial_balance,balance:r.balance,netPnl:r.net_pnl,snapshot:JSON.parse(r.snapshot_json),updatedAt:r.updated_at}:null;
  }
  public getPaperTrades(id:string):PaperTrade[]{return (this.db.prepare('SELECT trade_json FROM paper_trades WHERE session_id=? ORDER BY trade_id').all(id) as Array<{trade_json:string}>).map(r=>JSON.parse(r.trade_json) as PaperTrade);}
  public close(){this.db.close();}
}