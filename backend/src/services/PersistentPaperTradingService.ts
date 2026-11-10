import type { Candle } from '../types';
import { PaperTradingEngine, type PaperTradingUpdate } from './PaperTradingEngine';
import { ResearchStore } from './ResearchStore';
/** Saves virtual paper-trading snapshots and trade history to SQLite; never sends broker orders. */
export class PersistentPaperTradingService {
  constructor(private readonly sessionId:string,private readonly store:ResearchStore,private readonly engine=new PaperTradingEngine()){
    if(!sessionId.trim())throw new Error('A paper session id is required');this.persist();
  }
  public processCandle(candle:Candle):PaperTradingUpdate{const update=this.engine.processCandle(candle);this.persist();return update;}
  public getSnapshot(){return this.engine.getSnapshot();}
  public reset(){this.engine.reset();this.persist();}
  private persist(){this.store.savePaperSnapshot(this.sessionId,this.engine.getSnapshot());}
}