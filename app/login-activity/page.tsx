import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extractLocationIdFromUrl } from "@/lib/urlParsing";
import LoginActivityOverview from "./LoginActivityOverview";

type LastSeenRow = {
  email: string | null;
  location_id: string | null;
  last_seen_at: string | null;
};

type EventRow = {
  email: string | null;
  url: string | null;
  ts: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDay(d: Date) {
  return d.toISOString().slice(0, 10);
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

async function fetchAll<T>(table: string, select: string, apply?: (q: any) => any) {
  const batch = 10000;
  let from = 0;
  const all: T[] = [];

  while (true) {
    let query = supabaseAdmin.from(table).select(select).range(from, from + batch - 1);
    if (apply) query = apply(query);
    const { data, error } = await query;
    if (error) return { data: null as T[] | null, error };
    all.push(...((data || []) as T[]));
    if (!data || data.length < batch) break;
    from += batch;
  }

  return { data: all, error: null };
}

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-zinc-900/40 border border-white/5 rounded-xl p-6 backdrop-blur-sm ${className}`}>
    {children}
  </div>
);

const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-5">
    <h3 className="text-sm font-semibold text-white tracking-tight">{title}</h3>
    {subtitle && <span className="text-xs text-zinc-500">{subtitle}</span>}
  </div>
);

type Entry = {
  key: string;
  ts: string | null;
};

type ListItem = {
  key: string;
  label: string;
  href: string;
  meta?: string | null;
};

export default async function LoginActivityPage({ searchParams }: { searchParams?: Promise<any> }) {
  const sp = await searchParams || {};
  const view = sp.view === "locations" ? "locations" : "users";

  const { data: lastSeenRows, error: lastSeenError } = await fetchAll<LastSeenRow>(
    "user_last_seen",
    "email, location_id, last_seen_at"
  );

  if (lastSeenError) {
    return <ErrorState title="Error loading last seen data" message={lastSeenError.message} />;
  }

  const userLastSeen = new Map<string, string | null>();
  const locationLastSeen = new Map<string, string | null>();

  for (const r of lastSeenRows || []) {
    const email = r.email ? String(r.email) : "";
    const locationId = r.location_id ? String(r.location_id) : "";
    const ts = r.last_seen_at;

    if (email) updateLatest(userLastSeen, email, ts);
    if (locationId) updateLatest(locationLastSeen, locationId, ts);
  }

  const baseMap = view === "users" ? userLastSeen : locationLastSeen;
  const totalEntities = baseMap.size;
  const nowMs = Date.now();

  const bucketCounts = new Map<string, number>([
    ["1d", 0],
    ["7d", 0],
    ["15d", 0],
    ["30d", 0],
    ["30+d", 0],
    ["never", 0],
  ]);

  let activeCount = 0;
  const bucketEntries: Record<string, Entry[]> = {
    "1d": [],
    "7d": [],
    "15d": [],
    "30d": [],
    "30+d": [],
    never: [],
  };
  const activeEntries: Entry[] = [];
  const last1dEntries: Entry[] = [];

  for (const [key, ts] of baseMap.entries()) {
    if (!ts) {
      bucketCounts.set("never", (bucketCounts.get("never") || 0) + 1);
      bucketEntries.never.push({ key, ts: null });
      continue;
    }
    const days = Math.max(0, Math.floor((nowMs - new Date(ts).getTime()) / DAY_MS));
    if (days <= 1) {
      bucketCounts.set("1d", (bucketCounts.get("1d") || 0) + 1);
      bucketEntries["1d"].push({ key, ts });
      last1dEntries.push({ key, ts });
    } else if (days <= 7) {
      bucketCounts.set("7d", (bucketCounts.get("7d") || 0) + 1);
      bucketEntries["7d"].push({ key, ts });
    } else if (days <= 15) {
      bucketCounts.set("15d", (bucketCounts.get("15d") || 0) + 1);
      bucketEntries["15d"].push({ key, ts });
    } else if (days <= 30) {
      bucketCounts.set("30d", (bucketCounts.get("30d") || 0) + 1);
      bucketEntries["30d"].push({ key, ts });
    } else {
      bucketCounts.set("30+d", (bucketCounts.get("30+d") || 0) + 1);
      bucketEntries["30+d"].push({ key, ts });
    }

    if (days <= 7) {
      activeCount += 1;
      activeEntries.push({ key, ts });
    }
  }

  const activePct = totalEntities ? Math.round((activeCount / totalEntities) * 100) : 0;

  const since30 = new Date();
  since30.setDate(since30.getDate() - 29);
  const since7 = new Date();
  since7.setDate(since7.getDate() - 6);
  const since28 = new Date();
  since28.setDate(since28.getDate() - 27);

  const { data: eventRows, error: eventError } = await fetchAll<EventRow>(
    "events",
    "email, url, ts",
    (q) => q.gte("ts", since30.toISOString())
  );

  if (eventError) {
    return <ErrorState title="Error loading events" message={eventError.message} />;
  }

  const counts7 = new Map<string, number>();
  const counts28 = new Map<string, number>();
  const dailyCounts = new Map<string, number>();

  const since7Ms = since7.getTime();
  const since28Ms = since28.getTime();

  for (const r of eventRows || []) {
    if (!r.ts) continue;
    const ts = new Date(r.ts);
    if (Number.isNaN(ts.getTime())) continue;

    const key = view === "users"
      ? (r.email ? String(r.email) : "")
      : extractLocationIdFromUrl(String(r.url || "")) || "";

    if (!key) continue;

    const day = toDay(ts);
    dailyCounts.set(day, (dailyCounts.get(day) || 0) + 1);

    const ms = ts.getTime();
    if (ms >= since7Ms) counts7.set(key, (counts7.get(key) || 0) + 1);
    if (ms >= since28Ms) counts28.set(key, (counts28.get(key) || 0) + 1);
  }

  let powerCount = 0;
  for (const key of baseMap.keys()) {
    const c7 = counts7.get(key) || 0;
    const c28 = counts28.get(key) || 0;
    if (c7 >= 5 || c28 >= 20) powerCount += 1;
  }

  const powerPct = totalEntities ? Math.round((powerCount / totalEntities) * 100) : 0;

  const powerKeys = Array.from(baseMap.keys()).filter((key) => {
    const c7 = counts7.get(key) || 0;
    const c28 = counts28.get(key) || 0;
    return c7 >= 5 || c28 >= 20;
  });

  const powerWithScore = await (async () => {
    if (view === "users") {
      const locationsByUser = new Map<string, Set<string>>();
      for (const r of lastSeenRows || []) {
        const email = r.email ? String(r.email) : "";
        const locationId = r.location_id ? String(r.location_id) : "";
        if (!email || !locationId) continue;
        if (!locationsByUser.has(email)) locationsByUser.set(email, new Set());
        locationsByUser.get(email)!.add(locationId);
      }

      const items = await Promise.all(
        powerKeys.map(async (email) => {
          const locations = Array.from(locationsByUser.get(email) || []);
          const healthList = await Promise.all(
            locations.map(async (loc) => {
              const { data: health } = await supabaseAdmin.rpc("gocroco_user_health_v2", {
                target_email: email,
                target_location_id: loc,
                ref_day: null,
              });
              return health;
            })
          );

          const scores = healthList
            .map((h) => (typeof h?.health_score === "number" ? Number(h.health_score) : null))
            .filter((n): n is number => typeof n === "number");
          const avgScore = scores.length
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : null;

          return { key: email, score: avgScore };
        })
      );

      return items;
    }

    const items = await Promise.all(
      powerKeys.map(async (locationId) => {
        const { data: health } = await supabaseAdmin.rpc("gocroco_location_health_v2", {
          target_location_id: locationId,
          ref_day: null,
        });
        const score = typeof health?.health_score === "number" ? Math.round(health.health_score) : null;
        return { key: locationId, score };
      })
    );

    return items;
  })();

  const powerSorted = powerWithScore
    .slice()
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .slice(0, 10);

  const farthest = Array.from(baseMap.entries())
    .filter(([, ts]) => !!ts)
    .map(([key, ts]) => ({ key, ts: ts as string }))
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    .slice(0, 10);

  const locationNameMap = new Map<string, string>();
  if (view === "locations") {
    const ids = Array.from(
      new Set([
        ...farthest.map((i) => i.key),
        ...powerSorted.map((i) => i.key),
        ...activeEntries.map((i) => i.key),
        ...last1dEntries.map((i) => i.key),
        ...Object.values(bucketEntries).flat().map((i) => i.key),
      ])
    ).filter(Boolean);
    if (ids.length) {
      const { data: locationRows } = await supabaseAdmin
        .from("ghl_locations")
        .select("location_id, profile")
        .in("location_id", ids);
      for (const row of locationRows || []) {
        const id = String(row.location_id || "");
        if (!id) continue;
        locationNameMap.set(id, pickLocationName(row.profile, id));
      }
    }
  }

  const series30 = buildSeries(30, dailyCounts);
  const series7 = series30.slice(-7);
  const max30 = Math.max(1, ...series30.map((s) => s.count));
  const max7 = Math.max(1, ...series7.map((s) => s.count));

  const bucketData = [
    { key: "1d", label: "1d" },
    { key: "7d", label: "7d" },
    { key: "15d", label: "15d" },
    { key: "30d", label: "30d" },
    { key: "30+d", label: "30+d" },
    { key: "never", label: "never" },
  ].map((b) => ({
    ...b,
    count: bucketCounts.get(b.key) || 0,
  }));

  const bucketMax = Math.max(1, ...bucketData.map((b) => b.count));

  const viewLabel = view === "users" ? "Users" : "Locations";

  return (
    <main className="min-h-screen bg-black text-zinc-400 font-sans p-6 md:p-10 selection:bg-zinc-800">
      <div className="max-w-[1400px] mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
          <div>
            <div className="text-xs text-zinc-500 mb-2">Engagement</div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Login activity</h1>
            <p className="text-sm text-zinc-500 mt-2">
              Buckets, activity rates, and trends for {viewLabel.toLowerCase()}.
            </p>
          </div>
          <div className="inline-flex rounded-lg bg-zinc-900/50 border border-white/10 p-1">
            <a
              href="/login-activity?view=users"
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                view === "users"
                  ? "bg-white text-black"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Users
            </a>
            <a
              href="/login-activity?view=locations"
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                view === "locations"
                  ? "bg-white text-black"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Locations
            </a>
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label={`Total ${viewLabel.toLowerCase()}`} value={totalEntities.toLocaleString()} />
          <StatCard label="Active (7d)" value={`${activePct}%`} hint={`${activeCount.toLocaleString()} active`} />
          <StatCard
            label={view === "users" ? "Power users" : "Power locations"}
            value={`${powerPct}%`}
            hint={`${powerCount.toLocaleString()} power`}
            href="#power-list"
          />
          <StatCard label="Last login <= 1d" value={(bucketCounts.get("1d") || 0).toLocaleString()} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <SectionHeader title="Last login buckets" subtitle="1 / 7 / 15 / 30 days" />
            <div className="flex items-end gap-3 h-48">
              {bucketData.map((b) => {
                const heightPct = Math.max(6, Math.round((b.count / bucketMax) * 100));
                return (
                  <div key={b.key} className="flex-1 flex flex-col items-center justify-end h-full group">
                    <div className="text-[10px] text-zinc-500 mb-2">{b.count}</div>
                    <div
                      className="w-full rounded-sm transition-all duration-300"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: b.count ? "#e4e4e7" : "#27272a",
                        opacity: b.count ? 0.9 : 0.3,
                      }}
                    />
                    <div className="text-[10px] text-zinc-600 mt-2 font-mono">{b.label}</div>
                  </div>
                );
              })}
            </div>
            <div className="text-xs text-zinc-500 mt-4">
              Based on last seen timestamps.
            </div>
          </Card>

          <Card>
            <SectionHeader
              title={view === "users" ? "Power users rule" : "Power locations rule"}
              subtitle="7d or 28d threshold"
            />
            <div className="text-sm text-zinc-300 space-y-2">
              <div className="flex items-center justify-between">
                <span>7 days</span>
                <span className="font-mono text-zinc-400">&gt;= 5 connections</span>
              </div>
              <div className="flex items-center justify-between">
                <span>28 days</span>
                <span className="font-mono text-zinc-400">&gt;= 20 connections</span>
              </div>
            </div>
            <div className="mt-6 text-xs text-zinc-500">
              Connections counted from tracked events.
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <SectionHeader title="Login trend" subtitle="Last 7 days" />
            <div className="flex items-end gap-1.5 pt-4 w-full h-40">
              {series7.map((p) => {
                const heightPct = Math.max(4, Math.round((p.count / max7) * 100));
                return (
                  <div key={p.day} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div className="absolute -top-8 bg-zinc-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-white/10 pointer-events-none">
                      {p.day}: {p.count}
                    </div>
                    <div
                      className="w-full rounded-sm transition-all duration-300"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: p.count ? "#e4e4e7" : "#27272a",
                        opacity: p.count ? 0.9 : 0.3,
                      }}
                    />
                    <div className="text-[10px] text-zinc-600 mt-2 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      {p.day.slice(8)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <SectionHeader title="Login trend" subtitle="Last 30 days" />
            <div className="flex items-end gap-1 pt-4 w-full h-40">
              {series30.map((p) => {
                const heightPct = Math.max(4, Math.round((p.count / max30) * 100));
                return (
                  <div key={p.day} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div className="absolute -top-8 bg-zinc-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-white/10 pointer-events-none">
                      {p.day}: {p.count}
                    </div>
                    <div
                      className="w-full rounded-sm transition-all duration-300"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: p.count ? "#d4d4d8" : "#27272a",
                        opacity: p.count ? 0.8 : 0.3,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <SectionHeader title="Furthest last login" subtitle={`Top 10 ${viewLabel.toLowerCase()}`} />
            <div className="space-y-2">
              {farthest.map((item, idx) => (
                <div key={item.key} className="flex items-center justify-between text-sm">
                  <a
                    href={
                      view === "users"
                        ? `/users/${encodeURIComponent(item.key)}`
                        : `/locations/${encodeURIComponent(item.key)}`
                    }
                    className="text-zinc-300 truncate hover:text-white transition-colors"
                  >
                    {idx + 1}. {view === "locations" ? locationNameMap.get(item.key) || item.key : item.key}
                  </a>
                  <div className="text-xs font-mono text-zinc-500">
                    {new Date(item.ts).toLocaleDateString()}
                  </div>
                </div>
              ))}
              {farthest.length === 0 && (
                <div className="text-sm text-zinc-600 italic py-2 text-center">
                  No last login data found.
                </div>
              )}
            </div>
          </Card>

          <Card>
            <SectionHeader
              title={view === "users" ? "Power users" : "Power locations"}
              subtitle="Sorted by health score"
            />
            <div className="space-y-2" id="power-list">
              {powerSorted.map((item, idx) => (
                <div key={item.key} className="flex items-center justify-between text-sm">
                  <a
                    href={
                      view === "users"
                        ? `/users/${encodeURIComponent(item.key)}`
                        : `/locations/${encodeURIComponent(item.key)}`
                    }
                    className="text-zinc-300 truncate hover:text-white transition-colors"
                  >
                    {idx + 1}. {view === "locations" ? locationNameMap.get(item.key) || item.key : item.key}
                  </a>
                  <div className="text-xs font-mono text-zinc-400">
                    {item.score === null ? "n/a" : `${item.score}%`}
                  </div>
                </div>
              ))}
              {powerSorted.length === 0 && (
                <div className="text-sm text-zinc-600 italic py-2 text-center">
                  No power {viewLabel.toLowerCase()} found.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

function updateLatest(map: Map<string, string | null>, key: string, ts: string | null) {
  if (!map.has(key)) {
    map.set(key, ts ?? null);
    return;
  }
  if (!ts) return;
  const prev = map.get(key);
  if (!prev || new Date(ts).getTime() > new Date(prev).getTime()) {
    map.set(key, ts);
  }
}

function buildSeries(days: number, dayMap: Map<string, number>) {
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const series: { day: string; count: number }[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const k = toDay(d);
    series.push({ day: k, count: dayMap.get(k) || 0 });
  }
  return series;
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <main className="min-h-screen bg-black text-white p-10 flex items-center justify-center">
      <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-xl max-w-lg backdrop-blur-sm">
        <h1 className="text-xl font-bold text-red-400 mb-2">{title}</h1>
        <pre className="text-xs text-red-300/70 whitespace-pre-wrap font-mono">{message}</pre>
      </div>
    </main>
  );
}
