import type { Candle } from '../types';
import { PaperTradingEngine, type PaperTradingOptions, type PaperTradingUpdate } from './PaperTradingEngine';
import { ResearchStore } from './ResearchStore';

/** Restart-safe virtual paper session. Replays its own persisted closed candles; never sends broker orders. */
export class PersistentPaperTradingService {
  private readonly engine:PaperTradingEngine;
  constructor(private readonly sessionId:string,private readonly store:ResearchStore,engine?:PaperTradingEngine){
    if(!sessionId.trim())throw new Error('A paper session id is required');
    const saved=store.getPaperSession(sessionId);
    const savedOptions=saved?.snapshot.options as PaperTradingOptions|undefined;
    if(saved && !savedOptions)throw new Error('This legacy paper session has no recovery options; start a new session');
    this.engine=engine??new PaperTradingEngine(savedOptions);
    if(saved){
      const actual=JSON.stringify(this.engine.getOptions()), expected=JSON.stringify(savedOptions);
      if(actual!==expected)throw new Error('Paper session options do not match the saved session');
      const candles=store.getPaperCandles(sessionId);
      for(const candle of candles)this.engine.processCandle(candle);
      const restored=this.engine.getSnapshot();
      if(restored.balance!==saved.balance||restored.trades.length!==store.getPaperTrades(sessionId).length)
        throw new Error('Paper session recovery integrity check failed');
    }else this.persistSnapshot();
  }
  public processCandle(candle:Candle):PaperTradingUpdate{
    const update=this.engine.processCandle(candle);
    this.store.savePaperProgress(this.sessionId,candle,this.engine.getSnapshot());
    return update;
  }
  public getSnapshot(){return this.engine.getSnapshot();}
  public reset(){this.engine.reset();this.store.clearPaperSession(this.sessionId,this.engine.getSnapshot());}
  private persistSnapshot(){this.store.savePaperSnapshot(this.sessionId,this.engine.getSnapshot());}
}