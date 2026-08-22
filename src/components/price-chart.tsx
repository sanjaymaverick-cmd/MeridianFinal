import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };

export function PriceChart({ bars, quote = "INR" }: { bars: Bar[]; quote?: "INR" | "USD" | "FX" }) {
  const data = bars.map((b) => ({
    t: new Date(b.t).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
    c: b.c,
  }));
  if (data.length < 2) {
    return <p className="text-sm text-muted">No history yet — Yahoo missed this ticker.</p>;
  }
  const up = (data[data.length - 1]?.c ?? 0) >= (data[0]?.c ?? 0);
  const color = up ? "#3dd68c" : "#f87171";
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pxFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis
            hide
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{ background: "#141416", border: "1px solid #2a2a2e", borderRadius: 12, fontSize: 12 }}
            formatter={(v: number) => [
              quote === "USD" ? `$${v.toFixed(v < 5 ? 4 : 2)}` : quote === "FX" ? v.toFixed(4) : `₹${v.toLocaleString("en-IN")}`,
              "Close",
            ]}
          />
          <Area type="monotone" dataKey="c" stroke={color} fill="url(#pxFill)" strokeWidth={1.6} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
