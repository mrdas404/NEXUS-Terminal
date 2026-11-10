import type { MarketDataSource, QuotexMarketType } from '../types';
import { randomUUID } from 'node:crypto';
import { HistoricalCsvImporter, type HistoricalCsvResult } from './HistoricalCsvImporter';
import { HistoricalBacktestingEngine, type BacktestOptions, type BacktestReport } from './BacktestingEngine';
import { ResearchStore } from './ResearchStore';
export interface HistoricalStream {symbol:string;marketType:QuotexMarketType;source:MarketDataSource;}
export class HistoricalResearchService {
  constructor(private readonly store:ResearchStore,private readonly importer=new HistoricalCsvImporter()){}
  public importCsv(text:string,stream:HistoricalStream):HistoricalCsvResult{const result=this.importer.parse(text,stream);this.store.saveCandles(result.candles);return result;}
  public runBacktest(stream:HistoricalStream,options:Partial<BacktestOptions>={}):{reportId:string;report:BacktestReport}{
    const candles=this.store.getCandles(stream);if(!candles.length)throw new Error('No historical candles found for the selected stream');
    const report=new HistoricalBacktestingEngine(options).run(candles);const reportId=randomUUID();this.store.saveBacktestReport(report,reportId);return{reportId,report};
  }
}