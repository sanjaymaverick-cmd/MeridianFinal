# Meridian Final — UX backlog (paper desk)

Shipped on this branch. Constraint: mock capital. Analyzer / Paper only. Kite disarmed. Never “Arm”.

| ID | Item | Where |
|---|---|---|
| UX-01 | Identity strip: MOCK · mode · ENGINE ON\|PAUSED · KITE DISARMED. Modes Signals / Paper / Paper auto-send / Live (locked). No `:live` fill suffix. | `desk-shell`, `ux-copy` |
| UX-02 | Pause ≠ Flatten. Pause keeps exits. Flatten confirms. Resume paper. Duplicate Kill gone. | `desk-shell`, `paper-engine` |
| UX-03 | Promotion verdict in English with n / AUC / hit pass-fail. Quality vs time-stop share. | `promotion-strip` |
| UX-04 | Book META is n/a until promote. Factor Buy decoupled. Two ledgers. | `portfolio.ts`, `portfolio.tsx` |
| UX-05 | localhost and 127.0.0.1 on :3000 and :8080. Guest cannot Pause/Reset/mode. Origin error in English. | `auth/server`, `login`, `desk-shell` |
| UX-06 | Paper mode pending Approve / Skip / Size (15s auto-skip). Flatten-one on clips. Auto-send is explicit. | `paper-engine`, `auto.tsx` |
| UX-07 | Signals last scan stays live with Would BUY / Would SELL. No new fills. | `paper-engine` tick |
| UX-08 | Research returns empty + reason on mismatch. Guest heuristic labelled. Run history. | `research-rank`, `research.tsx` |
| UX-09 | Last decision sentence. Heat vs cap. Farm hold countdown. PnL idle named. | `auto.tsx` |
| UX-10 | English fill/scan reasons. Quote source is not the word live. | `ux-copy` |
| UX-11 | Reset confirms. Not in the header thumb zone next to Pause. | `auto.tsx` |
| UX-12 | Download is the fit set; hold class labelled; count mismatch noted. | `auto.tsx`, `listSamples` |
| UX-13 | Weekend/cash-closed advice does not work NSE cash. Unpromoted meta is not a 0.55 gate to work. | `advice.ts` |
| UX-14 | Mode chips on mobile. Clip cards under md. No forced 720px table. | `desk-shell`, `auto.tsx` |
| UX-15 | Fresh desk starts Signals + paused. Start paper is labelled. | `emptyEngine`, header |
| UX-16 | Greeks titled what-if / calculator. Snapshot marks. | `greeks.tsx` |
| UX-17 | One timestamp column on Command fills. | `index.tsx` |
| UX-18 | Header is the mode source. Auto chips labelled mirrors. | `desk-shell`, `auto.tsx` |
| UX-19 | Book Block. Research Watch / Ignore. Greeks Queue paper hedge / Dismiss. | `desk.ts`, pages |

Preserve: Kite off. Kill/Pause in the header. Pause does not flatten. Resume never sneaks to live.
