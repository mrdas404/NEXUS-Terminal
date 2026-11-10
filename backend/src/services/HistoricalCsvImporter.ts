import type { Candle, MarketDataSource, QuotexMarketType } from '../types';
export interface HistoricalCsvOptions { symbol: string; marketType: QuotexMarketType; source: MarketDataSource; }
export interface HistoricalCsvResult { candles: Candle[]; rowsRead: number; firstOpenTime: number; lastOpenTime: number; }
export class HistoricalCsvImporter {
  public parse(csvText: string, options: HistoricalCsvOptions): HistoricalCsvResult {
    if (!options.symbol.trim()) throw new Error('A symbol is required');
    if (!csvText.trim()) throw new Error('CSV content is empty');
    const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) throw new Error('CSV must contain a header and at least one data row');
    const headers = this.parseRow(lines[0]).map(h => h.trim().toLowerCase());
    const timeColumn = headers.includes('timestamp') ? 'timestamp' : 'opentime';
    const indexes = new Map(headers.map((h, i) => [h, i]));
    for (const name of [timeColumn, 'open', 'high', 'low', 'close']) if (!indexes.has(name)) throw new Error(`Missing required CSV column: ${name}`);
    const read = (cells: string[], name: string) => {
      const i = indexes.get(name); const value = i === undefined ? '' : (cells[i] ?? '').trim();
      if (!value) throw new Error(`Missing value for ${name}`); return value;
    };
    const num = (value: string, name: string) => {
      const n = Number(value); if (!Number.isFinite(n)) throw new Error(`Invalid number for ${name}`); return n;
    };
    const time = (value: string) => {
      const n = Number(value);
      const t = value !== '' && Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : Date.parse(value);
      if (!Number.isFinite(t) || t % 60000 !== 0) throw new Error('Timestamp must align to a 1-minute candle boundary');
      return t;
    };
    const candles: Candle[] = [];
    for (let i = 1; i < lines.length; i++) {
      try {
        const cells = this.parseRow(lines[i]);
        const openTime = time(read(cells, timeColumn));
        const open = num(read(cells, 'open'), 'open'), high = num(read(cells, 'high'), 'high');
        const low = num(read(cells, 'low'), 'low'), close = num(read(cells, 'close'), 'close');
        const vi = indexes.get('volume'), volume = num(vi === undefined ? '0' : ((cells[vi] ?? '').trim() || '0'), 'volume');
        if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0 || high < Math.max(open, close, low) || low > Math.min(open, close, high)) throw new Error('OHLCV values are outside valid ranges');
        if (candles.length && openTime <= candles[candles.length - 1].openTime) throw new Error('Rows must be strictly chronological with no duplicate timestamps');
        candles.push({symbol:options.symbol.trim(),marketType:options.marketType,source:options.source,timeframe:'1m',openTime,closeTime:openTime+59999,open,high,low,close,volume});
      } catch (e) { throw new Error(`CSV row ${i+1}: ${e instanceof Error ? e.message : 'invalid row'}`); }
    }
    return {candles,rowsRead:candles.length,firstOpenTime:candles[0].openTime,lastOpenTime:candles[candles.length-1].openTime};
  }
  private parseRow(line: string): string[] {
    const cells:string[]=[]; let value=''; let quoted=false;
    for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'&&quoted&&line[i+1]==='"'){value+='"';i++;}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){cells.push(value);value='';}else value+=c;}
    if(quoted) throw new Error('Unclosed quoted CSV field'); cells.push(value); return cells;
  }
}