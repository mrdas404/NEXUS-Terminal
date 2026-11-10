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


## Quotex Edition — Phase 3.1 historical import and persistence

- `HistoricalCsvImporter` accepts `timestamp` or `openTime`, plus `open,high,low,close` and optional `volume`. Numeric timestamps in seconds or milliseconds and ISO timestamps are supported; timestamps must align to a 1-minute boundary.
- The caller explicitly supplies `symbol`, `marketType` and `source`; these are not guessed from CSV. LIVE, OTC and provider streams stay separate.
- `HistoricalResearchService` imports validated candles and runs backtests against the selected stored stream, saving each report with a unique ID.
- `ResearchStore` stores candles, backtest reports, paper session snapshots and virtual trade history in SQLite. Duplicate candle timestamps are rejected transactionally.
- `PersistentPaperTradingService` saves a snapshot after every closed candle. The paper engine remains in-memory: saved sessions are durable history/audit records but are not yet resumable after a server restart. Resume/recovery and HTTP/dashboard integration remain future work.

CSV format:

```csv
timestamp,open,high,low,close,volume
1700000040000,100,103,99,102,12
1700000100000,102,104,101,103,8
```

These are backend service classes, not upload endpoints or dashboard screens. From `backend/`, run `npm test` and `npm run build`.


## Quotex Edition — Phase 3.2 API and paper-session recovery

Research API endpoints (all under `/api`):
- `POST /research/import-csv` — JSON body `{ csv, stream: { symbol, marketType, source } }`.
- `POST /research/backtests` — JSON body `{ stream, options? }`; returns report and report ID.
- `GET /research/backtests/:reportId` — retrieves a stored report.
- `POST /paper/sessions` — JSON body `{ sessionId, options? }`; creates or recovers a virtual session.
- `GET /paper/sessions/:sessionId` — returns persisted snapshot and trade history.
- `POST /paper/sessions/:sessionId/candles` — feeds one closed candle into the virtual engine.
- `POST /paper/sessions/:sessionId/reset` — resets the virtual session and its replay log.

Paper recovery stores each processed candle and replays them in chronological order on session creation/recovery. Engine options are stored with the snapshot and checked during recovery. Candle + snapshot writes are committed in one SQLite transaction. Reset clears the replay log and trade rows. Set `RESEARCH_DB_PATH` to choose a dedicated SQLite database; otherwise the backend's existing Prisma SQLite file is used.

These endpoints accept caller-provided historical/research candles. They do not connect to Quotex, fetch live market data, or place broker orders. Do not send untrusted provider data without validating its provenance.


### Phase 3.2 REST API and recovery

- `POST /api/research/import-csv` — JSON body: `{ "stream": { "symbol": "BTC/USDT", "marketType": "LIVE", "source": "PROVIDER_API" }, "csv": "timestamp,open,high,low,close\\n..." }`.
- `POST /api/research/backtests` — JSON body: `{ "stream": { ... }, "options": { "initialBalance": 10000, "stake": 10, "payoutRate": 0.8, "expiryCandles": 1 } }`.
- `GET /api/research/backtests/:reportId` — retrieve a saved report.
- `POST /api/paper/sessions` — create a virtual session; repeat with the same ID to recover it. Saved options are preserved and mismatched options are rejected.
- `GET /api/paper/sessions/:sessionId` — retrieve saved snapshot and trades.
- `POST /api/paper/sessions/:sessionId/candles` — process one closed 1-minute candle.
- `POST /api/paper/sessions/:sessionId/reset` — reset the virtual session and replay log.

Recovery rebuilds the in-memory engine by replaying persisted candles, then compares the reconstructed snapshot and trade ledger with the saved state. Corrupt or inconsistent recovery is rejected rather than silently continued. The research API is intended for a trusted local/development environment; do not expose it publicly without authentication, TLS, and request controls. Paper endpoints remain virtual-only.


## Quotex Edition — Phase 4 research dashboard

The frontend Research view provides historical CSV import, backtest execution/report review, and SQLite-backed paper-session creation/recovery. It displays report metrics and virtual trade history, and can submit a closed 1-minute candle to a paper session. Symbol, LIVE/OTC market type and data source are explicit selections and remain isolated.

Set `VITE_API_URL` when the backend is not at `http://localhost:3001`. Start backend and frontend separately. This interface is for historical research and virtual paper trading only; it does not place broker orders. Feed only candles from a verified source and never label simulated data as LIVE/OTC.


## Phase 5 — Read-only market data feed

The backend can connect to Binance's public Spot trade WebSocket for BTC/USDT, ETH/USDT and SOL/USDT. It uses no API keys and exposes no order-placement functionality. Trades are normalized into `LIVE` + `PROVIDER_API` ticks, aggregated into isolated 1-minute candles, and broadcast to connected dashboard clients as MessagePack events: `MARKET_TICK`, `MARKET_CANDLE`, `MARKET_CANDLE_CLOSED`, and `MARKET_FEED_STATUS`.

- `GET /api/market/feeds` reports provider, stream provenance, symbols, connection state, last-message time, reconnect attempts and last error.
- Reconnect uses capped exponential backoff; a feed with no message for 15 seconds is reported as `STALE`.
- Binance Spot data is not Quotex OTC data. OTC remains unavailable until a legitimate, authorized OTC data provider is configured. Do not relabel this crypto feed as Quotex pricing.
- The existing frontend terminal socket receives feed events; paper sessions are not automatically traded from live data. Explicit session selection and virtual-only controls remain required.


## Phase 5.2 — Frontend market feed monitor

The Market view now displays the public feed's connection state, provider, LIVE/PROVIDER_API provenance, last tick age, reconnect attempt and provider error. It shows the latest received BTC/USDT, ETH/USDT and SOL/USDT prices, and warns when the provider is stale, disconnected or the dashboard socket is offline.

Configure `VITE_WS_URL` for the backend WebSocket when it is not at `ws://localhost:3001`. The Binance public spot stream is not Quotex OTC pricing. OTC is shown as unavailable rather than fabricated. Live feed ticks are informational only and are not automatically submitted to paper sessions or broker execution.


## Phase 5.3 — Live candlestick chart and manual paper bridge

The Market view now retains validated Binance LIVE / PROVIDER_API one-minute candles (up to 300 per symbol) and renders them in a candlestick chart. This is an in-memory browser-session window; it is not historical backfill and clears on refresh.

The optional paper bridge is deliberately manual: the user must create/recover a virtual paper session, explicitly opt in, and press "Send one candle". It submits only the latest closed LIVE / PROVIDER_API 1m candle. There is no automatic feed forwarding and no broker order execution. The paper session is stream-locked by the backend; changing symbol/source within the same session is rejected by the paper engine. A fresh session is required for another stream.


## Phase 5.4 — Historical candle backfill and recovery

- `GET /api/market/candles?symbol=BTC%2FUSDT&limit=300` fetches up to 300 complete 1-minute candles from Binance Spot REST.
- Supported symbols are BTC/USDT, ETH/USDT and SOL/USDT. The API labels all results LIVE / PROVIDER_API and excludes the still-open candle.
- The frontend loads history on startup and again after the market WebSocket reconnects, merging by candle open time so recent live candles take precedence.
- The browser chart retains at most 300 candles per symbol. This is a bounded recent window, not a full archive.
- No OTC, simulated, or Quotex quote is inferred from Binance data. Paper trading remains a separate explicit manual action.


## Phase 5.5 — Persistent candle archive and offline recovery

- Every successful Binance Spot REST history refresh is upserted into SQLite `research_candles`, keyed by symbol, market type, source, timeframe and candle open time.
- Duplicate candles update the existing row; OHLCV and stream consistency are validated before a batch is written.
- The chart's existing history endpoint merges the recent SQLite archive with newly fetched provider candles. If Binance is unavailable, it serves cached candles with `cacheUsed: true` and a provider error message; it never relabels the cache as a different source.
- `GET /api/market/candles/archive` provides the persistent LIVE / PROVIDER_API archive with optional `startTime` and `endTime` Unix-millisecond filters.
- This archive persists across browser refreshes and backend restarts when the configured SQLite file is persistent. It does not guarantee recovery of data from periods when the service was offline; no provider backfill pagination beyond the requested latest 300 candles is implemented.
- OTC and SIMULATED streams remain separate; this chart archive endpoint is intentionally restricted to LIVE / PROVIDER_API.


## Phase 5.6 — Data integrity and recovery hardening

- Binance trade IDs are retained on parsed ticks and used for bounded idempotency (last 5,000 IDs per stream key). Duplicate events do not double-count candle volume.
- The candle builder rejects out-of-order timestamps, keeps market/source/symbol streams isolated, and emits explicit missing-minute gap metadata. Missing candles are not fabricated.
- Gap events are broadcast to clients; the frontend records recent gaps, requests a fresh historical backfill, and aborts pending recovery requests on disconnect/unmount. Reconnect timers are cancelled on cleanup.
- SQLite candle writes validate canonical one-minute boundaries and OHLCV values. Strict CSV imports retain duplicate rejection; provider history uses a separate transactional upsert method.
- Added integrity tests for event parsing, duplicate ingestion, out-of-order ticks, gap detection, stream isolation, transactional rollback, strict-import vs upsert behavior, SQLite close/reopen recovery, and persistent paper-session replay.
- These checks do not make Binance Spot equivalent to Quotex LIVE/OTC quotes. No synthetic candles are created to fill gaps, and no real-money orders are sent.


## Phase 5.7 — Production readiness hardening

- Added `/health` for process liveness and `/ready` for SQLite connectivity plus research database `quick_check` integrity.
- Added configurable browser CORS allowlist via `CORS_ORIGINS`; request JSON body limit reduced to 2 MB.
- WebSocket server now caps incoming payloads at 1 MB, disables per-message compression, sends 30-second heartbeat pings, and drops clients whose outbound buffer exceeds 1 MB.
- Added SIGINT/SIGTERM graceful shutdown: stop market feed, close WebSocket clients/server, and close SQLite handles, with a bounded shutdown timeout.
- Core and research SQLite paths can be configured independently and parent directories are created before opening the database. Keep these paths on persistent writable storage in deployment.
- Provider upsert now enforces the same canonical one-minute timestamp and OHLCV validation as strict imports.
- Added readiness and provider-upsert integrity tests, plus a production smoke test that launches the compiled backend on an ephemeral port, checks `/health` and `/ready`, verifies the binary MessagePack WebSocket `INIT_STATE`, and confirms SIGTERM shutdown. Added `backend/.env.example`.
- GitHub Actions Backend validation: **43 tests passed, 0 failed**, and TypeScript build passed, including the compiled-server smoke test. Frontend production build has a passing CI run from the current frontend code. CI validates backend tests and TypeScript build; frontend CI validates its production build. These checks are not a substitute for deployment-specific browser, reverse-proxy, TLS, real network and long-duration soak testing.
- Binance public Spot remains LIVE crypto reference data only, not Quotex LIVE/OTC account data. The system remains read-only with virtual paper trading only.

### Production configuration

Copy `backend/.env.example` to `backend/.env`, set an explicit `CORS_ORIGINS` list for the deployed frontend origin, and configure `CORE_DB_PATH` and `RESEARCH_DB_PATH` to persistent writable paths. Do not commit secrets or session credentials. Put the backend behind HTTPS/WSS at the deployment proxy and configure `VITE_API_URL` / `VITE_WS_URL` for the frontend build.


## Quotex Edition — Phase 5.8 deployment, monitoring and operational security

### Private-by-default Docker deployment

The repository now includes a Docker Compose deployment:
- `backend/Dockerfile`: multi-stage Node 22 image, compiled TypeScript runtime, non-root application user, read-only root filesystem, persistent SQLite volume and readiness health check.
- `frontend/Dockerfile` + `frontend/nginx.conf`: static frontend served by unprivileged Nginx on port 8080; same-origin `/api/`, `/health`, `/ready` and `/ws` proxy routes.
- `docker-compose.yml`: backend is internal-only (not published to the host); frontend binds to loopback by default (`127.0.0.1:8080)); containers drop Linux capabilities and disallow privilege escalation.
- WebSocket now uses the dedicated `/ws` path. The frontend defaults to same-origin HTTP/HTTPS and WS/WSS URLs, avoiding hard-coded localhost URLs in the production bundle.

Start locally:
```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```
Open `http://127.0.0.1:8080`. To bind a different local port, set `APP_PORT` in the root `.env`. The frontend port is intentionally bound to loopback; the backend has no host-published port.

### Important security boundary

**This application does not yet implement user authentication, authorization, API keys, or per-user sessions. CORS is not authentication.** Do not publish the Compose frontend directly to the public internet. If remote access is required, keep the service behind an authenticated VPN or an identity-aware reverse proxy, terminate TLS there, and allow only trusted users. Configure `CORS_ORIGINS` to the exact browser origin (for example, `https://terminal.example.com`); do not use a wildcard. Do not place Quotex credentials, cookies, SSIDs, tokens, RPC secrets or other credentials in Git. No real-money trading or broker order endpoint is enabled.

### Monitoring and logs

- Container health checks call backend `/ready` (SQLite connectivity and research DB integrity) and frontend HTTP health.
- `/health` is process liveness; `/ready` is readiness. A healthy HTTP process does not prove the upstream market feed is connected.
- Backend HTTP requests emit structured JSON logs with method, path, status and duration; avoid adding secrets or request bodies to logs.
- Inspect status/logs with:
```bash
docker compose ps
docker compose logs --tail=200 backend
docker compose logs -f frontend backend
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/ready
```

### SQLite backup

A backup utility uses SQLite's online backup API, runs `quick_check` before and after copying, and applies configurable retention (1–365 days). Run it manually:
```bash
docker compose --profile backup run --rm backup
```
Backups are stored in the persistent Docker volume `backup-data`. Export that volume to encrypted off-host storage as part of the host's backup process. The utility is not a scheduler; configure a host-level scheduler and alert on non-zero exit codes. Keep at least one off-host copy. A production restore drill and off-host retention policy are still required before claiming disaster-recovery readiness.

### Deployment validation

The `Deployment validation` GitHub Actions workflow checks Compose syntax and builds both production container images. Backend and frontend test/build workflows continue to run independently. This CI does not deploy to a cloud host, configure DNS/TLS, test a particular reverse proxy, or validate a live Quotex/OTC feed.

### Operational limitations before public production

- Add authentication and authorization before any public exposure.
- Configure and test TLS, authenticated ingress, firewall rules, DNS and secret management on the actual host.
- Schedule off-host backups and perform a documented restore drill.
- Add external uptime/alerting and retention for logs; monitor feed staleness separately from process health.
- Define a tested deployment rollback procedure and pin/scan production image dependencies.
- Run browser-level, long-duration network and host-restart tests in the target environment.
- Binance public Spot remains LIVE crypto reference data only; it is not Quotex OTC data. LIVE and OTC streams must remain separate.


### Security audit status — deployment blocker

The backend dependency audit on 2026-11-10 reported **9 advisories: 1 critical, 4 high and 4 moderate** (including transitive packages such as `proxy-addr`, `ws`, `body-parser` and `path-to-regexp`). npm reports available fixes, but they have not yet been applied to the lockfile or revalidated. Do not treat this branch as public-production-ready until dependency remediation is reviewed, committed, and the audit is rerun with no critical/high findings.


## Phase 5.9 — Single-admin authentication and dependency security

The terminal now uses one server-configured administrator password. Configure these values before starting the backend:

- `ADMIN_PASSWORD`: unique password with at least 16 characters.
- `SESSION_SECRET`: random secret with at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.
- Copy root `.env.example` to `.env`, fill both values, and never commit the real `.env` file. The Compose deployment refuses to start without both values.

Authentication behavior:
- `POST /api/auth/login` creates a signed, eight-hour administrator session.
- Session cookie is HttpOnly, SameSite=Strict, scoped to the site, and Secure when the request is HTTPS.
- `POST /api/auth/logout` clears the cookie; `GET /api/auth/session` reports session state.
- All other `/api/*` routes require a valid session. The `/health` and `/ready` probes remain unauthenticated for container health checks.
- WebSocket `/ws` requires the same session cookie and an allowed browser origin.
- Login attempts are limited to five failures per source IP per 15-minute window. Mutating API requests and login/logout validate the Origin header when supplied.
- Missing or weak server credentials cause startup to fail closed. Do not set wildcard CORS origins. Always deploy behind HTTPS/TLS; an HTTP local development session will not receive the Secure cookie flag.

The frontend shows an administrator sign-in screen before opening the terminal WebSocket. Use a same-origin reverse proxy so browser API, cookie and WebSocket requests share the same host.

Dependency security:
- `.github/workflows/dependency-security-audit.yml` runs `npm ci` and `npm audit --json` separately for backend and frontend lockfiles.
- It reports direct/transitive advisory data and blocks critical/high findings. Moderate/low findings remain visible in the audit output.
- A successful image build or unit-test workflow is not a clean dependency audit. Public deployment remains blocked until the current branch head has a fresh successful audit, all critical/high findings are resolved, and deployment has been reviewed.

This is a single-admin gate, not multi-user identity management. It does not add account recovery, MFA, password rotation, persistent session revocation, or distributed rate limiting. Keep the service behind a private network or identity-aware ingress until those controls and production restore/monitoring checks are complete. No real-money trade execution is enabled.


## Hybrid deployment — Vercel frontend + persistent Render backend

This deployment profile keeps the React/Vite frontend on Vercel and runs the long-lived Node.js API/WebSocket process in a Docker web service with a persistent disk on Render. It is intended for read-only market analytics, historical research and virtual paper trading only.

### 1. Deploy the backend on Render

1. In Render, create a Blueprint from this repository and select branch `feature/quotex-edition`.
2. Review `render.yaml`. It creates one Docker web service in Singapore, a 1 GB persistent disk at `/data`, and a `/ready` health check.
3. Set `ADMIN_PASSWORD` to a unique password with at least 16 characters.
4. Keep the generated `SESSION_SECRET` private (at least 32 characters).
5. Set `CORS_ORIGINS` to the exact frontend origin(s), comma-separated, with no wildcard. After Vercel creates the project domain, add that exact origin here.
6. Deploy and wait for the service health check to pass. Copy the HTTPS service URL.

SQLite is intentionally configured for one backend instance because its database files live on the persistent disk. Do not scale this service horizontally. The Render disk must be mounted writable by the non-root container user; verify database initialization and restart recovery in the Render logs before using it. Backups must be copied off the service disk to independent storage before treating them as disaster recovery.

### 2. Deploy the frontend on Vercel

1. Import this repository in Vercel and select branch `feature/quotex-edition`.
2. Set **Root Directory** to `frontend`.
3. Use the Vite framework preset, build command `npm run build`, and output directory `dist` (also recorded in `frontend/vercel.json`).
4. Add environment variable `VITE_API_URL` with the backend HTTPS origin, e.g. `https://YOUR-RENDER-SERVICE.onrender.com` (no trailing slash).
5. Deploy the frontend. Copy its exact production origin and add it to Render's `CORS_ORIGINS`, then redeploy the backend if needed.

The frontend derives its secure WebSocket URL from `VITE_API_URL` and uses the same backend origin for login, REST and WebSocket requests. An optional `VITE_WS_URL` can override the derived `wss://.../ws` URL.

### 3. Cookie and domain requirements

The admin session is an HttpOnly cookie. Cross-origin requests use credentials and the backend allows only explicitly configured origins. For the most reliable browser cookie behavior, use custom hostnames under the same registrable domain, for example `app.example.com` on Vercel and `api.example.com` on Render, and configure `VITE_API_URL=https://api.example.com`. Separate default Vercel and Render hostnames are cross-site; browser third-party-cookie restrictions may block the session cookie even when CORS is correct. Test login, page refresh, REST calls and WebSocket reconnect in the target browsers before production use.

### 4. Production gate

**Do not expose this deployment as a public production trading service yet.** The latest recorded dependency audit on branch head `6077365fb9a8f0c2e59a71d1876f715aa535011d` failed with critical/high findings in backend and frontend dependencies. Re-run the dependency audit against the final deployment commit and resolve all critical/high findings first. Also verify persistent-disk write access, backup/restore to off-host storage, session expiry, login throttling, HTTPS, CORS and WebSocket authentication. This application does not place real-money trades.
