import type { LiveTechnicalSignal } from '../types';

function format(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

export function TechnicalSignalPanel({ signals }: { signals: LiveTechnicalSignal[] }) {
  const latest = signals[0];
  const directionClass = latest?.direction === 'CALL' ? 'text-neonGreen border-neonGreen/40' :
    latest?.direction === 'PUT' ? 'text-neonRed border-neonRed/40' : 'text-neonYellow border-neonYellow/40';
  return (
    <section className="bg-darkSurface border border-darkBorder rounded-xl p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold tracking-widest text-gray-100">TECHNICAL CALL / PUT SIGNALS</h2>
          <p className="text-[11px] text-gray-500 mt-1">1-minute completed candles · multi-confirmation analysis</p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded border border-yellow-500/30 text-yellow-300">BINANCE SPOT LIVE · NOT QUOTEX OTC</span>
      </div>
      {!latest ? (
        <div className="rounded-lg bg-black/20 border border-darkBorder p-5 text-center">
          <div className="text-lg font-bold text-neonYellow">WAIT</div>
          <p className="text-xs text-gray-400 mt-2">Closed candles are being collected. A signal appears after enough consecutive 1m candles are available.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className={`rounded-lg border bg-black/20 p-4 ${directionClass}`}>
            <div className="text-[10px] text-gray-500">{latest.symbol}</div>
            <div className="text-3xl font-black mt-1">{latest.direction}</div>
            <div className="text-xs mt-2 text-gray-400">{latest.confirmations}/{latest.totalChecks} rule groups</div>
          </div>
          <div className="rounded-lg border border-darkBorder bg-black/20 p-4">
            <div className="text-[10px] text-gray-500">RULE ALIGNMENT SCORE</div>
            <div className="text-2xl font-bold text-gray-100 mt-1">{latest.confidence}%</div>
            <p className="text-[10px] text-gray-500 mt-2">Not a probability of profit</p>
          </div>
          <div className="rounded-lg border border-darkBorder bg-black/20 p-4">
            <div className="text-[10px] text-gray-500">INDICATORS</div>
            <div className="text-xs text-gray-300 mt-2">RSI: {format(latest.indicators.rsi)}</div>
            <div className="text-xs text-gray-300 mt-1">EMA 9 / 21 / 50: {format(latest.indicators.ema9)} / {format(latest.indicators.ema21)} / {format(latest.indicators.ema50)}</div>
            <div className="text-xs text-gray-300 mt-1">MACD histogram: {format(latest.indicators.macd?.histogram, 5)}</div>
            <div className="text-xs text-gray-300 mt-1">Stoch RSI K/D: {format(latest.indicators.stochasticRsi?.k)} / {format(latest.indicators.stochasticRsi?.d)}</div>
          </div>
        </div>
      )}
      {latest && <div className="text-xs text-gray-400">
        <span className="text-gray-500">Confirmations: </span>{latest.reasons.join(' · ')}
        <span className="block text-[10px] text-gray-600 mt-2">Last completed candle: {new Date(latest.timestamp).toLocaleString()}</span>
      </div>}
      <p className="text-[10px] text-gray-500 border-t border-darkBorder pt-3">Read-only educational signal. Binance Spot prices are not Quotex OTC quotes. CALL/PUT labels are analytical directions, not trade instructions or guaranteed outcomes.</p>
    </section>
  );
}
