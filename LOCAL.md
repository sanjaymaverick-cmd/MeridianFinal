# Run Meridian Final on your machine

Paper desk. Live Binance last for crypto fills. NSE/Yahoo when the cash session is open. Not Kite. Not an order.

## What you need

- **Node.js 22 LTS** — [https://nodejs.org](https://nodejs.org) (include npm)
- Windows, macOS, or Linux
- Unzip this folder, e.g. `D:\work Dir\MeridianFinal`

No Postgres required. The app uses embedded PGLite unless you set `DATABASE_URL`.

## Quick start (Windows)

1. Unzip to `D:\work Dir\MeridianFinal`
2. Double-click **`run.bat`**
   - First run: `npm install` (a few minutes)
   - Copies `.env.example` → `.env` if missing
3. Open [http://localhost:3000](http://localhost:3000)

**Test login**

| | |
|---|---|
| ID | `WQ3137` |
| Password | `Test@password` |

Leave the window open overnight. Auto paper stays on the **server process**, not the browser tab.

## Quick start (macOS / Linux)

```bash
cd MeridianFinal
chmod +x run.sh
./run.sh
```

Then open [http://localhost:3000](http://localhost:3000) and sign in with `WQ3137` / `Test@password`.

## Manual commands

```bash
cd MeridianFinal
copy .env.example .env          # Windows
# cp .env.example .env          # macOS / Linux

npm install
npm run dev:local
```

`dev:local` binds `127.0.0.1:3000`. The sandbox `npm run dev` still uses port 8080.

## What runs

| Path | What |
|---|---|
| `/` | Command — indices, crypto, advice |
| `/markets` | Tape — **Crypto** tab is every Binance USDT pair |
| `/portfolio` | Book CSV → Buy/Hold/Sell |
| `/auto` | Overnight paper loop: farm sleeve (labels) + PnL sleeve (Kelly, armed after meta promote). NSE F&O only in the cash session. |
| `/greeks` | Gamma book |
| `/research` | Natural-language names |

Overnight (and weekends) the engine trades **Binance USDT only**, at **live last**. Cash/F&O wait for the NSE session.

Training files (created while Auto is on):

```
data/paper-samples.jsonl      labelled clips (features + fwd return)
data/paper-heartbeat.json     last tick, open count, live names
data/pglite/                  embedded DB if PGLITE_DATA_DIR is set
```

On Auto, **Download samples** dumps JSON from the DB.

## Keep it alive overnight

- Do **not** close the terminal running `npm run dev:local`
- Sleep/hibernate on the PC will pause Node — set Windows sleep to Never if you want a full night
- Kill switch or mode **Advisory** pauses new clips
- **Reset paper** clears open clips, not `paper-samples.jsonl`

## Optional env

Edit `.env`:

| Key | Local default |
|---|---|
| `PGLITE_DATA_DIR` | `./data/pglite` — persist login + samples DB |
| `BETTER_AUTH_URL` | `http://localhost:3000` |
| `XAI_API_KEY` | research LLM; heuristic if empty |
| `DATABASE_URL` | leave empty unless you have Postgres |

Kite keys stay out of git. Paper first.

## If something fails

**`npm` not found** — reinstall Node 22 and reopen the terminal.

**Port 3000 in use** — change the port in `package.json` script `dev:local`.

**Login 401** — first page load seeds `WQ3137`. Refresh once, then sign in.

**Binance 451 / empty crypto** — this PC’s region blocked `api.binance.com`. The desk uses `https://data-api.binance.vision` (public). If that fails too, check firewall/VPN.

**Gold/Nifty look stale** — Yahoo is delayed; NSE archives are often blocked. Crypto last is Binance.

**PGLite WASM abort / `Aborted()`** — `data/pglite` is corrupt (hard kill or crash). The desk moves it to `data/pglite-corrupt-*` and starts empty. Sign in again with `WQ3137`. Paper fills in the old dir are not loaded (`data/paper-samples.jsonl` is unchanged). Node 22+; 24 is fine. Node 18 is not.

## Zip contents

Source only (`src`, `migrations`, `meridian_final`, configs). No `node_modules`. Run `npm install` on the machine.

This is personal software. You can lose the whole paper book.
