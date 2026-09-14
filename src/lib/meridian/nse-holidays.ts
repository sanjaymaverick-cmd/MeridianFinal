/**
 * NSE/BSE equity (CM + equity F&O) trading holidays.
 * Not the settlement/bank list. Currency derivatives are a different calendar.
 *
 * Fallback table: NSE holidays page + CMTR circular family for 2026.
 * Optional holiday-master fetch overlays extra dates; fetch failure keeps the table.
 */

/** Weekday CM/FO trading holidays 2026 (Asia/Kolkata calendar dates). */
export const NSE_EQUITY_HOLIDAYS_2026: ReadonlySet<string> = new Set([
  "2026-01-15", // Municipal Corporation Election — Maharashtra (equities list)
  "2026-01-26", // Republic Day
  "2026-03-03", // Holi
  "2026-03-26", // Shri Ram Navami
  "2026-03-31", // Shri Mahavir Jayanti
  "2026-04-03", // Good Friday
  "2026-04-14", // Dr. Baba Saheb Ambedkar Jayanti
  "2026-05-01", // Maharashtra Day
  "2026-05-28", // Bakri Id
  "2026-06-26", // Muharram
  "2026-09-14", // Ganesh Chaturthi
  "2026-10-02", // Mahatma Gandhi Jayanti
  "2026-10-20", // Dussehra
  "2026-11-08", // Diwali Laxmi Pujan (Sun) — closed until a circular posts Muhurat times
  "2026-11-10", // Diwali-Balipratipada
  "2026-11-24", // Prakash Gurpurb Sri Guru Nanak Dev
  "2026-12-25", // Christmas
]);

const extraHolidays = new Set<string>();

/** IST calendar YYYY-MM-DD from a UTC-shifted Date (sessionClock ist). */
export function istYmd(ist: Date): string {
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isNseEquityHolidayIst(ist: Date): boolean {
  const key = istYmd(ist);
  return NSE_EQUITY_HOLIDAYS_2026.has(key) || extraHolidays.has(key);
}

/** Cash + equity F&O regular session: 09:15–15:30 IST, no Sat/Sun, no CM/FO holiday. */
export function nseCashFoOpen(now: Date | number = new Date()): boolean {
  const t = typeof now === "number" ? now : now.getTime();
  const ist = new Date(t + 5.5 * 3600 * 1000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (minutes < 9 * 60 + 15 || minutes >= 15 * 60 + 30) return false;
  if (isNseEquityHolidayIst(ist)) return false;
  return true;
}

function parseHolidayDate(raw: string): string | null {
  const s = String(raw ?? "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!dmy) return null;
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const mm = months[dmy[2] ?? ""];
  if (!mm) return null;
  return `${dmy[3]}-${mm}-${dmy[1]}`;
}

/** Best-effort overlay. Never throws. Table remains the source of truth on failure. */
export async function refreshNseHolidays(fetchImpl: typeof fetch = fetch): Promise<number> {
  try {
    const res = await fetchImpl("https://www.nseindia.com/api/holiday-master?type=trading", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return 0;
    const json = (await res.json()) as Record<string, Array<{ tradingDate?: string }>>;
    const rows = [...(json.CM ?? []), ...(json.FO ?? [])];
    let n = 0;
    for (const row of rows) {
      const ymd = parseHolidayDate(String(row.tradingDate ?? ""));
      if (!ymd) continue;
      extraHolidays.add(ymd);
      n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}
