## Quotex Edition — Phase 1 foundation

This fork is being prepared for **read-only market analysis and paper testing** on Quotex-style markets. Phase 1 does not connect to a Quotex account and does not place trades.

### Data integrity rules
- Uniswap RPC prices are tagged as live; demo fallback prices are tagged as simulated.
- Simulated Uniswap fallback values are stored separately and excluded from the existing arbitrage detector.
- Quotex market data types distinguish `LIVE` from `OTC`.
- Data source identifiers distinguish a third-party provider API from an unofficial Quotex WebSocket adapter.
- The 1-minute candle builder keeps each market type and source in a separate stream. It will not combine LIVE and OTC candles or merge provider and WebSocket ticks.

### Phase 1 files
- `backend/src/types.ts`: shared market, source, tick, candle and price provenance types.
- `backend/src/services/PriceStore.ts`: separate live and simulated price storage.
- `backend/src/exchanges/Uniswap.ts`: explicit live/simulated tagging.
- `backend/src/services/CandleBuilder.ts`: isolated 1-minute OHLC candle construction.

### Important limitations
No Quotex feed or third-party provider is configured in this phase. A source must be connected and validated before its data can be described as live. OTC prices must come from an OTC-capable source; LIVE prices must never be substituted for OTC. Do not commit Quotex passwords, session cookies, SSIDs or other account tokens to this repository. Validate signals with historical/replay data and paper trading before considering any real-money use.
