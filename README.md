# 🌌 NEXUS Terminal V5 — Institutional Crypto Analytics

The **NEXUS Terminal** is an institutional-grade, real-time cryptocurrency arbitrage and quantitative analytics platform. It is designed to provide traders with a high-performance, low-latency environment for detecting market inefficiencies across centralized (Binance, Coinbase) and decentralized (Uniswap V3) exchanges.

![Demo Recording](https://raw.githubusercontent.com/Anushreebasics/NEXUS-Terminal/main/nexus_terminal_v5_full_demo.webp) *(Replace with actual hosted gif/image after push)*

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v18.x or higher)
- **npm** (v9.x or higher)
- **C++ Build Tools** (Required for `better-sqlite3` and `msgpackr` native optimizations)

### 1. Installation
Clone the repository and install dependencies for both the frontend and backend.

```bash
# Clone the repository
git clone https://github.com/Anushreebasics/NEXUS-Terminal.git
cd NEXUS-Terminal

# Install Backend dependencies
cd backend
npm install

# Install Frontend dependencies
cd ../frontend
npm install
```

### 2. Configuration (`backend/.env`)
Create a `.env` file in the `backend/` directory to configure your environment.

```env
PORT=3001
# Use a stable RPC for Uniswap V3 (LlamaRPC or Alchemy recommended)
RPC_URL="https://eth.llamarpc.com"
DATABASE_URL="file:./dev.db"
```

### 3. Launching the Terminal
You need to run both the backend and frontend simultaneously.

**In Terminal 1 (Backend):**
```bash
cd backend
npm run dev
```

**In Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## 🛠️ Key Features & How to Use Them

### 1. Live Market Matrix (Arbitrage Detection)
The matrix aggregates prices from Binance, Coinbase, and Uniswap.
- **How to use**: Watch the `SPREAD` column. When a spread exceeds your configured threshold (default 0.5%), a real-time alert is triggered in the **Detection Engine Alerts** feed.
- **Paper Trading**: The system automatically simulates a $10,000 spot trade for every viable arbitrage detected, calculating fees and updating your **Virtual PnL** in the header.

### 2. Level 2 Order Book (Market Depth)
Located in the center of the dashboard, this streams live bids and asks directly from **Coinbase**.
- **Visual Heatmap**: The blue and red bars represent relative volume at each price level.
- **Live Spread**: The center display shows the current bid-ask spread in real-time.

### 3. NLP Sentiment Engine (Fear & Greed)
The top-left gauge analyzes the latest crypto headlines from global RSS feeds.
- **Real-time Scoring**: Headlines are processed via a financial lexicon to produce a score from -100 (Extreme Fear) to +100 (Extreme Greed).
- **Transparency**: Hover or look below the gauge to see the *actual headline* that triggered the most recent sentiment shift.

### 4. Interactive Settings Panel
Click the **Gear Icon** (top right) to open the configuration menu.
- **Dynamic Thresholds**: Adjust Arbitrage, Anomaly, and Spike detection sensitivity on the fly.
- **No Restart Required**: Changes are pushed to the backend over a REST API and applied instantly to the live data stream.

### 5. Persistent State
Thanks to the **SQLite + WAL** architecture, your **Virtual PnL** and recent signals survive server restarts. You can close the terminal and return later without losing your session history.

---

## 🧬 Technical Architecture

- **Binary Protocol**: Uses **MessagePack** (`msgpackr`) for WebSocket communication, slashing payload sizes by ~80% compared to standard JSON.
- **High-Concurrency DB**: Powered by `better-sqlite3` in Write-Ahead Logging (WAL) mode for synchronous, high-speed persistence.
- **On-Chain Polling**: Custom `ethers.js` adapter for Uniswap V3 `slot0` contract calls with a demo-fallback mechanism for RPC resilience.
- **Quant Logic**: Implements a rolling Z-Score algorithm (100-tick window) for statistical anomaly detection.

---

## 📜 License
ISC License - Feel free to use this for your own trading research or as a portfolio piece.

---

*Built by [Anushreebondia](https://github.com/Anushreebasics) — Institutional Crypto Engineering.*


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


## Quotex Edition — Phase 2 indicator and signal foundation

Phase 2 adds deterministic, read-only technical analysis utilities. These functions consume chronologically ordered 1-minute candles from one symbol, market type and source stream.

### Indicator calculations
- RSI (14), using Wilder smoothing.
- EMA (9, 21, 50).
- MACD (12, 26, 9).
- Bollinger Bands (20, 2 standard deviations).
- Stochastic RSI (14, 14, 3, 3).

### Multi-confirmation signal engine
- Evaluates five independent rule groups and returns `CALL`, `PUT` or `WAIT`.
- Default minimum: three aligned confirmations.
- Returns the contributing reasons, indicator snapshot, market type and data source.
- Confidence is the percentage of aligned rule groups (20-point increments), **not a calibrated probability** and not a guarantee of future performance.
- Rejects mixed symbol, timeframe, market-type or source candle sequences.
- Does not place orders or connect to a Quotex account.

### Phase 2 files
- `backend/src/services/TechnicalIndicators.ts`: reusable indicator calculations.
- `backend/src/services/MultiConfirmationSignalEngine.ts`: rule-based CALL/PUT/WAIT evaluation.

### Validation
Run `npm install` and then `npm run build` from `backend/` to run the strict TypeScript compiler check. No test runner is configured yet; historical-data backtesting and paper-trading execution remain follow-up work. Do not interpret the confidence score as a win probability or use unvalidated signals for real-money trades.


## Quotex Edition — Phase 3 backtesting and paper trading

Phase 3 adds a historical candle replay engine and an in-memory virtual-balance simulator. Both are read-only research tools; neither connects to a Quotex account or sends real orders.

### Historical backtesting

- Replays chronological 1-minute candles from exactly one symbol, market type and data source.
- A signal is evaluated only after candle `i` closes; entry uses candle `i+1` open, and expiry uses the configured future candle close. This avoids same-candle look-ahead.
- Reports wins, losses, ties, win rate (ties excluded), net P&L, ending balance, return, max drawdown and profit factor.
- Fixed-stake binary payout model: a win earns `stake × payoutRate`, a loss loses the stake, and an exact-price tie refunds the stake.
- The payout rate is a configurable assumption, not a broker quote. Fees, slippage, quote differences and execution latency are not modelled.

### Paper trading

- Uses a virtual balance only; the stake is reserved when a paper position opens.
- Signals are queued at candle close and entered at the next candle open.
- Supports configurable stake, payout rate and expiry measured in 1-minute candles.
- Exposes an in-memory snapshot and trade history; call `reset()` to clear the session.
- Each engine instance is locked to one symbol/market/source stream. Use separate instances for LIVE and OTC, and for distinct providers.

### Validation

From `backend/` run:

```bash
npm ci
npm test
npm run build
```

A GitHub Actions workflow runs the backend test and TypeScript build checks on pushes and pull requests targeting `feature/quotex-edition`. These results must be green before treating the code as validated.

### Limitations and risk

The backtester and paper trader are not evidence of a profitable strategy. A high historical win rate can be caused by overfitting, small samples or unrealistic payout assumptions. Use out-of-sample data, realistic provider-specific OTC/LIVE candles and a sufficiently large sample. Signal confidence remains a rule-alignment score, not a probability. No real-money automation is included.
