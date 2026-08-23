# Meridian Final

Personal multi-asset desk (V1–V4). Paper first. Live Kite stays off.

- **Signals / Paper / Paper auto-send** — ₹10L mock book. Signals proposes (Would BUY). Paper waits for Approve / Skip. Paper auto-send fills on its own. Live is locked.
- **Tape** — NSE, FX, COMEX/MCX, every Binance USDT pair
- **Book** — CSV cash ledger, separate from the paper clip book. META is n/a until the paper model promotes.
- **Greeks** — what-if calculator, not the live paper book
- **Research** — natural-language names, or empty if the query does not match
- **Advice** — spot / futures / options cards that respect session and promotion

**Run on your PC:** see [LOCAL.md](LOCAL.md) (`run.bat` on Windows, `run.sh` on macOS/Linux). localhost and 127.0.0.1 both sign in.

Test login: `WQ3137` / `Test@password`

Python engines: `meridian_final/`. Spec: [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md). UX: [docs/UX_BACKLOG.md](docs/UX_BACKLOG.md)

Kite keys never belong in git. This is personal software. You can lose the whole book. Nothing here is an order.
