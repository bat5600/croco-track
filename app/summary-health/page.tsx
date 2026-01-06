import "server-only";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseAdmin } from "@/lib/supabaseAdmin";

type LatestRow = {
  location_id: string;
  health_score: number;
  login_score: number;
  features_score: number;
  trend_score: number;
  score_day: string;
  computed_at: string;
};

type DailyRow = {
  location_id: string;
  score_day: string;
  health_score: number;
  login_score: number;
  features_score: number;
  trend_score: number;
};

type DailyAgg = {
  sum: number;
  count: number;
  loginSum: number;
  featuresSum: number;
  trendSum: number;
  riskCount: number;
};

const DAYS = 14;

function scoreTier(score: number | null) {
  if (score === null) return { label: "Not computed", tone: "zinc" as const };
  if (score >= 80) return { label: "Thriving", tone: "emerald" as const };
  if (score >= 60) return { label: "Healthy", tone: "lime" as const };
  if (score >= 45) return { label: "Steady", tone: "amber" as const };
  return { label: "At-risk", tone: "red" as const };
}

function pickLocationName(profile: any, fallback: string) {
  if (!profile) return fallback;
  return (
    profile.name ||
    profile?.location?.name ||
    profile?.business?.name ||
    profile?.companyName ||
    fallback
  );
}

function toDateString(d: Date) {
  return d.toISOString().slice(0, 10);
}

function sparkPoints(data: number[]) {
  if (!data.length) return "";
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(1, max - min);
  return data
    .map((v, i) => {
      const x = (i / Math.max(1, data.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");
}

function riskReasons(row: LatestRow) {
  const tags: string[] = [];
  if (row.login_score <= 15) tags.push("Low activity");
  if (row.features_score <= 10) tags.push("Low adoption");
  if (row.trend_score <= 5) tags.push("Negative trend");
  if (!tags.length) tags.push("Score drop");
  return tags.slice(0, 3);
}

export default async function SummaryHealthPage() {
  const { data: latestRowsRaw, error: latestError } = await supabaseAdmin
    .from("location_health_latest")
    .select(
      "location_id, health_score, login_score, features_score, trend_score, score_day, computed_at"
    );

  if (latestError) {
    return (
      <main className="min-h-screen bg-black text-white p-10 flex items-center justify-center">
        <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-xl max-w-lg backdrop-blur-sm">
          <h1 className="text-xl font-bold text-red-400 mb-2">
            Error loading health data
          </h1>
          <pre className="text-xs text-red-300/70 whitespace-pre-wrap font-mono">
            {latestError.message}
          </pre>
        </div>
      </main>
    );
  }

  const latestRows = (latestRowsRaw || []) as LatestRow[];
  const totalLocations = latestRows.length;

  if (!totalLocations) {
    return (
      <main className="min-h-screen bg-black text-zinc-400 font-sans p-6 md:p-10 selection:bg-zinc-800">
        <div className="max-w-[1200px] mx-auto space-y-6">
          <header className="border-b border-white/5 pb-6">
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Summary Health
            </h1>
            <p className="text-sm text-zinc-500 mt-2">
              No health data available yet.
            </p>
          </header>
          <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-10 text-center text-zinc-500">
            Run the daily scoring job to populate this dashboard.
          </div>
        </div>
      </main>
    );
  }

  let latestDay = latestRows
    .map((r) => r.score_day)
    .sort()
    .slice(-1)[0];

  const { data: latestDayRow } = await supabaseAdmin
    .from("location_health_daily")
    .select("score_day")
    .order("score_day", { ascending: false })
    .limit(1);

  if (latestDayRow?.length) {
    latestDay = latestDayRow[0].score_day || latestDay;
  }

  const latestDayDate = latestDay ? new Date(latestDay) : null;
  const startDay = latestDayDate
    ? toDateString(
        new Date(latestDayDate.getTime() - (DAYS - 1) * 24 * 60 * 60 * 1000)
      )
    : null;

  const dailyRows: DailyRow[] = [];
  if (latestDay && startDay) {
    const { data: dailyRaw } = await supabaseAdmin
      .from("location_health_daily")
      .select(
        "location_id, score_day, health_score, login_score, features_score, trend_score"
      )
      .gte("score_day", startDay)
      .lte("score_day", latestDay);
    dailyRows.push(...((dailyRaw || []) as DailyRow[]));
  }

  const avgHealth =
    Math.round(
      latestRows.reduce((acc, r) => acc + (r.health_score || 0), 0) /
        totalLocations
    ) || 0;
  const avgLogin =
    Math.round(
      latestRows.reduce((acc, r) => acc + (r.login_score || 0), 0) /
        totalLocations
    ) || 0;
  const avgFeatures =
    Math.round(
      latestRows.reduce((acc, r) => acc + (r.features_score || 0), 0) /
        totalLocations
    ) || 0;
  const avgTrend =
    Math.round(
      latestRows.reduce((acc, r) => acc + (r.trend_score || 0), 0) /
        totalLocations
    ) || 0;

  const tierCounts = {
    thriving: 0,
    healthy: 0,
    steady: 0,
    risk: 0,
  };
  for (const row of latestRows) {
    if (row.health_score >= 80) tierCounts.thriving += 1;
    else if (row.health_score >= 60) tierCounts.healthy += 1;
    else if (row.health_score >= 45) tierCounts.steady += 1;
    else tierCounts.risk += 1;
  }
  const tierPct = {
    thriving: Math.round((tierCounts.thriving / totalLocations) * 100),
    healthy: Math.round((tierCounts.healthy / totalLocations) * 100),
    steady: Math.round((tierCounts.steady / totalLocations) * 100),
    risk: Math.round((tierCounts.risk / totalLocations) * 100),
  };

  const dailyAgg = new Map<string, DailyAgg>();
  const byLocation = new Map<string, Map<string, number>>();
  for (const row of dailyRows) {
    if (!dailyAgg.has(row.score_day)) {
      dailyAgg.set(row.score_day, {
        sum: 0,
        count: 0,
        loginSum: 0,
        featuresSum: 0,
        trendSum: 0,
        riskCount: 0,
      });
    }
    const agg = dailyAgg.get(row.score_day)!;
    agg.sum += row.health_score || 0;
    agg.count += 1;
    agg.loginSum += row.login_score || 0;
    agg.featuresSum += row.features_score || 0;
    agg.trendSum += row.trend_score || 0;
    if (row.health_score < 45) agg.riskCount += 1;

    if (!byLocation.has(row.location_id)) {
      byLocation.set(row.location_id, new Map());
    }
    byLocation.get(row.location_id)!.set(row.score_day, row.health_score);
  }

  const daysSorted = Array.from(dailyAgg.keys()).sort();
  const avgSeries = daysSorted.map((d) =>
    Math.round((dailyAgg.get(d)!.sum / dailyAgg.get(d)!.count) || 0)
  );
  const loginSeries = daysSorted.map((d) =>
    Math.round((dailyAgg.get(d)!.loginSum / dailyAgg.get(d)!.count) || 0)
  );
  const featureSeries = daysSorted.map((d) =>
    Math.round((dailyAgg.get(d)!.featuresSum / dailyAgg.get(d)!.count) || 0)
  );
  const trendSeries = daysSorted.map((d) =>
    Math.round((dailyAgg.get(d)!.trendSum / dailyAgg.get(d)!.count) || 0)
  );
  const riskSeries = daysSorted.map((d) =>
    Math.round(
      ((dailyAgg.get(d)!.riskCount / dailyAgg.get(d)!.count) || 0) * 100
    )
  );

  const latestAvg = avgSeries.length ? avgSeries[avgSeries.length - 1] : null;
  const prevAvg =
    avgSeries.length > 1 ? avgSeries[avgSeries.length - 2] : null;
  const avgDelta =
    latestAvg !== null && prevAvg !== null ? latestAvg - prevAvg : null;

  const atRiskRows = [...latestRows]
    .sort((a, b) => a.health_score - b.health_score)
    .slice(0, 8);

  const atRiskIds = atRiskRows.map((r) => r.location_id);
  const { data: locationRows } = await supabaseAdmin
    .from("ghl_locations")
    .select("location_id, profile")
    .in("location_id", atRiskIds.length ? atRiskIds : ["__none__"]);
  const nameById = new Map<string, string>();
  for (const row of locationRows || []) {
    const id = String(row.location_id || "");
    if (!id) continue;
    nameById.set(id, pickLocationName(row.profile, id));
  }

  const prevDay =
    daysSorted.length > 1 ? daysSorted[daysSorted.length - 2] : null;
  const riskWithDelta = atRiskRows.map((r) => {
    const locDays = byLocation.get(r.location_id);
    const prev = prevDay ? locDays?.get(prevDay) ?? null : null;
    const curr = latestDay ? locDays?.get(latestDay) ?? null : null;
    const delta =
      typeof curr === "number" && typeof prev === "number" ? curr - prev : null;
    return { ...r, delta };
  });

  const dayLabel = latestDay
    ? new Date(latestDay).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "n/a";

  return (
    <main className="min-h-screen bg-black text-zinc-300 font-sans p-6 md:p-10 selection:bg-emerald-500/20">
      <div className="max-w-[1400px] mx-auto space-y-10">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-white/5 pb-8">
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-[0.3em]">
              Health overview
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mt-2">
              Summary Health
            </h1>
            <p className="text-sm text-zinc-500 mt-2 max-w-xl">
              Global health snapshot, average score drivers, top risk accounts,
              and fast trends in one view.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <div className="bg-white/5 px-3 py-2 rounded-lg border border-white/10">
              Last score day
              <div className="text-sm text-white font-semibold mt-1">
                {dayLabel}
              </div>
            </div>
            <div className="bg-white/5 px-3 py-2 rounded-lg border border-white/10">
              Locations scored
              <div className="text-sm text-white font-semibold mt-1">
                {totalLocations}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/60 p-6">
            <div
              className="absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(600px 240px at 20% 0%, rgba(16,185,129,0.3), transparent 70%)",
              }}
            />
            <div className="relative space-y-4">
              <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                Global health
              </div>
              <div className="flex items-end gap-4">
                <div className="text-5xl font-bold text-white">{avgHealth}</div>
                <div className="text-xs text-zinc-400 mb-2">/ 100</div>
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <span className="text-white font-semibold">
                  {scoreTier(avgHealth).label}
                </span>
                <span className="text-zinc-600">|</span>
                <span>
                  Delta vs prev day:{" "}
                  <span className="text-white font-semibold">
                    {avgDelta === null
                      ? "--"
                      : `${avgDelta > 0 ? "+" : ""}${avgDelta}`}
                  </span>
                </span>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Thriving</span>
                  <span>{tierPct.thriving}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${tierPct.thriving}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Healthy</span>
                  <span>{tierPct.healthy}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-lime-500"
                    style={{ width: `${tierPct.healthy}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Steady</span>
                  <span>{tierPct.steady}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${tierPct.steady}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>At-risk</span>
                  <span>{tierPct.risk}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${tierPct.risk}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-6">
            <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
              Average health
            </div>
            <div className="mt-4 flex flex-col sm:flex-row gap-6">
              <div className="flex items-center justify-center">
                <div
                  className="h-28 w-28 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                  style={{
                    background: `conic-gradient(#10b981 ${avgHealth}%, #27272a 0)`,
                  }}
                >
                  {avgHealth}
                </div>
              </div>
              <div className="flex-1 space-y-4">
                {[
                  {
                    label: "Login score",
                    value: avgLogin,
                    color: "bg-emerald-500",
                  },
                  {
                    label: "Feature score",
                    value: avgFeatures,
                    color: "bg-sky-500",
                  },
                  {
                    label: "Trend score",
                    value: avgTrend,
                    color: "bg-amber-500",
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs text-zinc-500">
                      <span>{item.label}</span>
                      <span className="text-zinc-300 font-semibold">
                        {item.value}
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full ${item.color}`}
                        style={{ width: `${Math.min(100, item.value)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-6">
            <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
              Coverage
            </div>
            <div className="mt-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-[0.2em]">
                    Locations scored
                  </div>
                  <div className="text-3xl font-bold text-white mt-2">
                    {totalLocations}
                  </div>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center text-zinc-300">
                  100%
                </div>
              </div>
              <div className="text-sm text-zinc-500">
                Latest scoring day:{" "}
                <span className="text-zinc-200 font-medium">{dayLabel}</span>
              </div>
              <div className="text-sm text-zinc-500">
                Health computed for all active locations.
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                  Top accounts at risk
                </div>
                <h2 className="text-xl text-white font-semibold mt-2">
                  Focus list
                </h2>
              </div>
              <div className="text-xs text-zinc-500">
                Worst scores (latest day)
              </div>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-white/5">
                  <tr>
                    <th className="py-3 pr-4">Account</th>
                    <th className="py-3 pr-4">Score</th>
                    <th className="py-3 pr-4">Delta</th>
                    <th className="py-3 pr-4">Signals</th>
                    <th className="py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {riskWithDelta.map((row) => {
                    const tier = scoreTier(row.health_score);
                    const name =
                      nameById.get(row.location_id) || row.location_id;
                    return (
                      <tr key={row.location_id} className="hover:bg-white/[0.02]">
                        <td className="py-4 pr-4">
                          <div className="text-zinc-200 font-medium truncate max-w-[260px]">
                            {name}
                          </div>
                          <div className="text-xs text-zinc-600 font-mono mt-1">
                            {row.location_id}
                          </div>
                        </td>
                        <td className="py-4 pr-4">
                          <span
                            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                              tier.tone === "emerald"
                                ? "border-emerald-400/30 text-emerald-200 bg-emerald-500/10"
                                : tier.tone === "lime"
                                  ? "border-lime-400/30 text-lime-200 bg-lime-500/10"
                                  : tier.tone === "amber"
                                    ? "border-amber-400/30 text-amber-200 bg-amber-500/10"
                                    : tier.tone === "red"
                                      ? "border-red-400/30 text-red-200 bg-red-500/10"
                                      : "border-white/10 text-zinc-300 bg-white/5"
                            }`}
                          >
                            {row.health_score}
                            <span className="text-[10px] text-zinc-500 uppercase">
                              {tier.label}
                            </span>
                          </span>
                        </td>
                        <td className="py-4 pr-4 text-zinc-300 font-semibold">
                          {row.delta === null
                            ? "--"
                            : `${row.delta > 0 ? "+" : ""}${row.delta}`}
                        </td>
                        <td className="py-4 pr-4">
                          <div className="flex flex-wrap gap-2">
                            {riskReasons(row).map((tag) => (
                              <span
                                key={tag}
                                className="text-[11px] px-2 py-1 rounded-md bg-white/5 text-zinc-400 border border-white/10"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-4 text-right">
                          <a
                            href={`/locations/${encodeURIComponent(
                              row.location_id
                            )}`}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-white/5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
                          >
                            Open
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-6">
            <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">
              Trend highlights
            </div>
            <h2 className="text-xl text-white font-semibold mt-2">
              Fast signals
            </h2>
            <div className="mt-6 space-y-4">
              {[
                {
                  label: "Avg health",
                  value: latestAvg ?? avgHealth,
                  series: avgSeries,
                },
                {
                  label: "Login score",
                  value: loginSeries[loginSeries.length - 1] ?? avgLogin,
                  series: loginSeries,
                },
                {
                  label: "Feature score",
                  value: featureSeries[featureSeries.length - 1] ?? avgFeatures,
                  series: featureSeries,
                },
                {
                  label: "At-risk share",
                  value: riskSeries[riskSeries.length - 1] ?? tierPct.risk,
                  series: riskSeries,
                  suffix: "%",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-white/5 bg-black/30 px-4 py-3"
                >
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>{item.label}</span>
                    <span className="text-zinc-200 font-semibold">
                      {item.value}
                      {item.suffix || ""}
                    </span>
                  </div>
                  <svg
                    viewBox="0 0 100 100"
                    className="w-full h-12 mt-3"
                    preserveAspectRatio="none"
                  >
                    <polyline
                      fill="none"
                      stroke="rgba(16,185,129,0.7)"
                      strokeWidth="3"
                      points={sparkPoints(item.series)}
                    />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
