# Meridian Final

Personal multi-asset desk (V1–V4). Paper first. Live Kite stays off.

- **Modes** — Signals (propose) · Paper (approve/skip) · Auto (paper auto-send). Live locked. Pause control is **Halt** / **Resume paper** — never Arm.
- **Auto paper** — ₹10L book, farm sleeve (labels + costs) and PnL sleeve (Kelly, opens only after meta promote: n≥2000, test AUC≥0.55, test hit>52%). Binance overnight; NSE cash/F&O only in the cash session. 10× is a return target, not a promise.
- **Tape** — NSE, FX, COMEX/MCX, every Binance USDT pair
- **Book** — paper clips first; imported CSV is Holdings. META is n/a until promoted.
- **Greeks** — what-if calculator + gamma reviews (not an order)
- **Research** — rank the query or return empty
- **Advice** — spot / futures / options cards. Always “(not an order)”

**Run on your PC:** Windows setup exe (`npm run dist:win` → `release/MeridianFinal-Setup-1.0.2.exe`), or [LOCAL.md](LOCAL.md) (`run.bat` / `run.sh`).

Test login: `WQ3137` / `Test@password`

Python engines: `meridian_final/`. Spec: [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)

Kite keys never belong in git. This is personal software. You can lose the whole book. Nothing here is an order.
