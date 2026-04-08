"use client";
import { APP_CONFIG } from "@/config";
import { TrendingUp } from "lucide-react";

// ── Mock data ───────────────────────────────────────────────

const MOCK_STATS = [
  { label: "ACTIVE", value: "14", color: "text-foreground" },
  { label: "OFFERS", value: "5", color: "text-primary" },
  { label: "DENIALS", value: "36", color: "text-destructive" },
  { label: "TOTAL", value: "55", color: "text-foreground" },
  { label: "SUCCESS RATE", value: "9.1%", color: "text-primary" },
];

const TREND_VALUES = [
  0.4, 0.6, 0.5, 0.7, 0.9, 1.1, 1.0, 1.3, 1.6, 1.4, 1.8, 2.1, 1.9, 2.3, 2.6,
  2.9,
];
const TREND_X_LABELS = ["02-14", "02-19", "02-26", "03-01", "03-06", "03-10"];
const TREND_Y_LABELS = [5, 4, 3, 2, 1];

const STEP_COLORS: Record<string, string> = {
  "Initial Screen": "hsl(258, 50%, 62%)",
  "Phase 2": "hsl(255, 48%, 64%)",
  "Phase 3": "hsl(252, 45%, 62%)",
  "Phase 4": "hsl(249, 50%, 60%)",
  Offer: "hsl(142, 60%, 45%)",
  Denied: "hsl(0, 72%, 55%)",
};

const MOCK_CONVERSION = [
  { name: "Initial Screen", value: 90 },
  { name: "Phase 2", value: 88 },
  { name: "Phase 3", value: 85 },
  { name: "Phase 4", value: 95 },
  { name: "Offer", value: 35 },
  { name: "Denied", value: 40 },
];

const MOCK_AVG_DAYS = [
  { name: "Initial Screen", days: 18 },
  { name: "Phase 2", days: 18 },
  { name: "Phase 3", days: 15 },
  { name: "Phase 4", days: 18 },
  { name: "Offer", days: 32 },
  { name: "Denied", days: 38 },
];

const MOCK_PLATFORMS = [
  { name: "LinkedIn", count: 20, pct: 36.4 },
  { name: "YCombinator", count: 10, pct: 18.2 },
  { name: "WeWorkRemotely", count: 15, pct: 27.3 },
  { name: "RemoteOK", count: 10, pct: 18.2 },
  { name: "Sigma", count: 5, pct: 9 },
];

// ── Sub-components ──────────────────────────────────────────

function MockTrendChart() {
  const maxVal = Math.max(...TREND_VALUES);
  const W = 280;
  const H = 64;

  const pts = TREND_VALUES.map((v, i) => ({
    x: (i / (TREND_VALUES.length - 1)) * W,
    y: H - (v / maxVal) * (H - 8) - 4,
  }));

  // Catmull-Rom → cubic bezier conversion for smooth curves
  const f = (n: number) => n.toFixed(2);
  const linePath = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${f(p.x)},${f(p.y)}`;
    const p0 = pts[Math.max(i - 2, 0)];
    const p1 = pts[i - 1];
    const p2 = p;
    const p3 = pts[Math.min(i + 1, pts.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    return `${acc} C${f(cp1x)},${f(cp1y)} ${f(cp2x)},${f(cp2y)} ${f(p2.x)},${f(p2.y)}`;
  }, "");
  const fillPath = `${linePath} L${W},${H} L0,${H} Z`;

  return (
    <div
      className="animate-fade-in-up rounded-lg border border-border/40 bg-background/50 p-2.5"
      style={{ animationDelay: "800ms" }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-display text-[9px] font-semibold text-foreground">
          Application Trend
        </span>
        <div className="flex items-center gap-1 text-primary">
          <TrendingUp className="h-2.5 w-2.5" />
          <span className="font-display text-[8px] font-semibold">+25%</span>
        </div>
      </div>

      <div className="flex gap-1.5">
        {/* Y-axis labels */}
        <div
          className="flex shrink-0 flex-col justify-between pb-8"
          style={{ paddingTop: 2 }}
        >
          {TREND_Y_LABELS.map((v) => (
            <span
              key={v}
              className="text-[5.5px] tabular-nums leading-none text-muted-foreground"
            >
              {v}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-12 w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="mockTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity="0.3"
                />
                <stop
                  offset="100%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            {/* Grid lines */}
            {TREND_Y_LABELS.map((v) => {
              const y = H - (v / maxVal) * (H - 8) - 4;
              return (
                <line
                  key={v}
                  x1="0"
                  y1={y}
                  x2={W}
                  y2={y}
                  stroke="hsl(var(--border))"
                  strokeOpacity="0.5"
                  strokeWidth="0.5"
                />
              );
            })}
            <path d={fillPath} fill="url(#mockTrendFill)" />
            <path
              d={linePath}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Dots */}
            {pts
              .filter((_, i) => i % 3 === 0 || i === pts.length - 1)
              .map((p, i) => (
                <circle
                  key={i}
                  cx={p.x.toFixed(1)}
                  cy={p.y.toFixed(1)}
                  r="1.5"
                  fill="hsl(var(--primary))"
                />
              ))}
          </svg>

          {/* X-axis labels */}
          <div className="mt-0.5 flex justify-between">
            {TREND_X_LABELS.map((l) => (
              <span key={l} className="text-[5.5px] text-muted-foreground">
                {l}
              </span>
            ))}
          </div>

          {/* Range slider */}
          <div className="mt-2 px-1">
            <div className="relative h-0.5 w-full rounded-full bg-muted">
              <div className="absolute inset-0 rounded-full bg-primary" />
              <div className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-card shadow-sm" />
              <div className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full border border-primary bg-card shadow-sm" />
            </div>
            <div className="mt-1 flex justify-between">
              <span className="font-display text-[6px] font-medium text-primary">
                02-14
              </span>
              <span className="font-display text-[6px] font-medium text-primary">
                03-10
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockConversionChart() {
  const maxVal = 120;
  const yLabels = [120, 90, 60, 30, 0];
  const W = 160;
  const H = 72;
  const barW = 22;
  const gap = 6;

  return (
    <div
      className="animate-fade-in-up rounded-lg border border-border/40 bg-background/50 p-2.5"
      style={{ animationDelay: "1000ms" }}
    >
      <span className="font-display text-[8px] font-semibold text-foreground">
        Step Conversion
      </span>
      <div className="mt-1.5 flex gap-1">
        {/* Y-axis */}
        <div
          className="flex shrink-0 flex-col justify-between"
          style={{ paddingBottom: 14 }}
        >
          {yLabels.map((v) => (
            <span
              key={v}
              className="text-[5.5px] tabular-nums leading-none text-muted-foreground"
            >
              {v}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-14 w-full"
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            {yLabels.map((v) => {
              const y = H - (v / maxVal) * H;
              return (
                <line
                  key={v}
                  x1="0"
                  y1={y}
                  x2={W}
                  y2={y}
                  stroke="hsl(var(--border))"
                  strokeOpacity="0.4"
                  strokeWidth="0.5"
                />
              );
            })}
            {/* Bars */}
            {MOCK_CONVERSION.map((s, i) => {
              const barH = (s.value / maxVal) * H;
              const x = i * (barW + gap);
              return (
                <rect
                  key={s.name}
                  x={x}
                  y={H - barH}
                  width={barW}
                  height={barH}
                  fill={STEP_COLORS[s.name]}
                  rx="1.5"
                />
              );
            })}
          </svg>
          {/* X-axis labels */}
          <div
            className="mt-0.5 flex w-full justify-around"
            style={{ gap: `${gap}px` }}
          >
            {MOCK_CONVERSION.map((s) => {
              const parts = s.name.split(" ");
              return (
                <div
                  key={s.name}
                  className="overflow-hidden text-center"
                  style={{ width: barW, flexShrink: 0 }}
                >
                  {parts.map((p, pi) => (
                    <span
                      key={pi}
                      className="block text-[5px] leading-tight text-muted-foreground"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MockAvgDaysChart() {
  const xLabels = [0, 10, 20, 30, 40];

  return (
    <div
      className="animate-fade-in-up rounded-lg border border-border/40 bg-background/50 p-2.5"
      style={{ animationDelay: "1100ms" }}
    >
      <span className="font-display text-[8px] font-semibold text-foreground">
        Avg Days / Step
      </span>
      <div className="mt-2 space-y-1.5">
        {MOCK_AVG_DAYS.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5">
            <span className="w-10 shrink-0 truncate text-right text-[5.5px] leading-none text-muted-foreground">
              {s.name}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-muted">
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${(s.days / 40) * 100}%`,
                  backgroundColor: STEP_COLORS[s.name],
                }}
              />
            </div>
          </div>
        ))}
        {/* X-axis */}
        <div className="flex justify-between pl-12">
          {xLabels.map((v) => (
            <span key={v} className="text-[5.5px] text-muted-foreground">
              {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockPlatformBreakdown() {
  return (
    <div
      className="animate-fade-in-up rounded-lg border border-border/40 bg-background/50 p-2.5"
      style={{ animationDelay: "1200ms" }}
    >
      <span className="font-display text-[8px] font-semibold text-foreground">
        By Platform
      </span>
      <div
        className="mt-1.5 space-y-1"
        style={{ maxHeight: 76, overflow: "hidden" }}
      >
        {MOCK_PLATFORMS.map((p) => (
          <div key={p.name} className="flex items-center gap-1">
            <span className="w-14 shrink-0 truncate text-[6px] text-muted-foreground">
              {p.name}
            </span>
            <span className="flex-1 border-b border-dashed border-border/50" />
            <span className="shrink-0 text-[6px] font-semibold tabular-nums text-foreground">
              {p.count}
            </span>
            <span className="w-4 shrink-0 text-right text-[6px] tabular-nums text-muted-foreground">
              {p.pct.toFixed(1)}%
            </span>
            <div className="h-0.5 w-6 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${p.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockActiveVsPassive() {
  const cx = 18,
    cy = 18,
    R = 14,
    r = 8;
  const activePct = 0.7;
  const start = -Math.PI / 2;
  const activeEnd = start + activePct * 2 * Math.PI;

  const ax1 = cx + R * Math.cos(start);
  const ay1 = cy + R * Math.sin(start);
  const ax2 = cx + R * Math.cos(activeEnd);
  const ay2 = cy + R * Math.sin(activeEnd);
  const aix1 = cx + r * Math.cos(activeEnd);
  const aiy1 = cy + r * Math.sin(activeEnd);
  const aix2 = cx + r * Math.cos(start);
  const aiy2 = cy + r * Math.sin(start);

  const px1 = ax2,
    py1 = ay2;
  const passiveEnd = start + 2 * Math.PI;
  const px2 = cx + R * Math.cos(passiveEnd);
  const py2 = cy + R * Math.sin(passiveEnd);
  const pix1 = cx + r * Math.cos(passiveEnd);
  const piy1 = cy + r * Math.sin(passiveEnd);
  const pix2 = aix1,
    piy2 = aiy1;

  const f = (n: number) => n.toFixed(3);

  return (
    <div
      className="animate-fade-in-up rounded-lg border border-border/40 bg-background/50 p-2.5"
      style={{ animationDelay: "1300ms" }}
    >
      <span className="font-display text-[8px] font-semibold text-foreground">
        Active vs Passive
      </span>
      <div className="mt-2 flex items-center justify-center gap-3">
        <svg viewBox="0 0 36 36" className="h-14 w-14 shrink-0">
          {/* Active arc (70%) */}
          <path
            d={`M${f(ax1)},${f(ay1)} A${R},${R} 0 1,1 ${f(ax2)},${f(ay2)} L${f(aix1)},${f(aiy1)} A${r},${r} 0 1,0 ${f(aix2)},${f(aiy2)} Z`}
            fill="hsl(var(--primary))"
          />
          {/* Passive arc (30%) */}
          <path
            d={`M${f(px1)},${f(py1)} A${R},${R} 0 0,1 ${f(px2)},${f(py2)} L${f(pix1)},${f(piy1)} A${r},${r} 0 0,0 ${f(pix2)},${f(piy2)} Z`}
            fill="hsl(var(--muted-foreground))"
          />
        </svg>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span className="text-[6px] text-muted-foreground">Active</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
            <span className="text-[6px] text-muted-foreground">Passive</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────

export function DashboardMockup() {
  return (
    <div className="stagger-4 relative animate-fade-in-up">
      <div className="dark:bg-primary/8 absolute -inset-8 rounded-3xl bg-primary/5 blur-3xl" />

      <div
        className="shadow-elevated pointer-events-none relative select-none overflow-hidden rounded-2xl border border-border/60 bg-card"
        style={{
          transform: "perspective(1200px) rotateY(-2deg) rotateX(1deg)",
        }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-border/40 bg-card px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-destructive/50" />
            <div className="h-2.5 w-2.5 rounded-full bg-warning/50" />
            <div className="h-2.5 w-2.5 rounded-full bg-primary/40" />
          </div>
          <div className="flex flex-1 justify-center">
            <div className="flex h-3 items-center rounded-md bg-muted/60 px-8">
              <span className="font-display text-[9px] tracking-wide text-muted-foreground">
                {`${APP_CONFIG.name.toLowerCase()} / dashboard`}
              </span>
            </div>
          </div>
          <div className="w-12" />
        </div>

        <div className="space-y-2.5 p-3">
          {/* Stat cards */}
          <div className="grid grid-cols-5 gap-1.5">
            {MOCK_STATS.map((s, i) => (
              <div
                key={s.label}
                className="animate-fade-in-up rounded-lg border border-border/40 bg-background/50 p-2"
                style={{ animationDelay: `${500 + i * 70}ms` }}
              >
                <span className="block font-display text-[7px] font-medium leading-none tracking-wide-label text-muted-foreground">
                  {s.label}
                </span>
                <p
                  className={`mt-0.5 font-display text-base font-bold tabular-nums leading-tight ${s.color}`}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <MockTrendChart />

          <div className="grid grid-cols-2 gap-2">
            <MockConversionChart />
            <MockAvgDaysChart />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <MockPlatformBreakdown />
            <MockActiveVsPassive />
          </div>
        </div>
      </div>
    </div>
  );
}
