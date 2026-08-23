# Meridian Final

**Canonical product.** V2 Greeks + V3 auto desk + V4 meta-label, in one paper desk.

Paper first. Live Kite stays off. Mock book ₹10,00,000.

Older trees are **frozen**. Do not patch V3/V4. Do not use the MeridianV4 repo.

- **Signals / Paper / Paper auto-send** — Signals proposes (Would BUY). Paper waits for Approve / Skip / Size. Paper auto-send fills on its own. Live is locked.
- **Tape** — NSE, FX, COMEX/MCX, every Binance USDT pair
- **Book** — CSV cash ledger, separate from the paper clip book. META is n/a until the paper model promotes.
- **Greeks** — what-if calculator (V2), not the live paper book
- **Research** — natural-language names, or empty if the query does not match
- **Advice** — spot / futures / options cards that respect session and promotion

**Run on your PC:** see [LOCAL.md](LOCAL.md) (`run.bat` on Windows, `run.sh` on macOS/Linux). localhost and 127.0.0.1 both sign in.

Test login: `WQ3137` / `Test@password`

| Doc | |
|-----|--|
| Lineage (V1→Final) | [docs/LINEAGE.md](docs/LINEAGE.md) |
| Build spec | [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) |
| UX contract | [docs/UX_BACKLOG.md](docs/UX_BACKLOG.md) |
| Python math ports | `meridian_final/` |

Kite keys never belong in git. This is personal software. You can lose the whole book. Nothing here is an order.
