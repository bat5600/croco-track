import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FEATURES } from "@/lib/features";
import { fmtSec } from "@/lib/ui";

type LastSeenRow = {
  email: string | null;
  location_id: string | null;
  last_seen_at: string | null;
};

type LifetimeRow = {
  email: string | null;
  location_id: string | null;
  feature_key: string | null;
  time_sec: number | null;
};

const KEY_SEP = "::";
const USER_ADOPTED_SEC = 420;
const COMPANY_ADOPTED_SEC = 3600;

function toDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function labelForFeature(key: string) {
  return FEATURES.find((f) => f.key === key)?.label ?? key;
}

async function fetchAll<T>(
  table: string,
  select: string,
  apply?: (q: any) => any
) {
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

const StatCard = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => (
  <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</div>
    <div className="text-lg font-semibold text-zinc-100 mt-1">{value}</div>
    {hint && <div className="text-[11px] text-zinc-600 mt-1">{hint}</div>}
  </div>
);

export default async function ProductAdoptionPage() {
  const { data: lastSeenRows, error: lastSeenError } = await fetchAll<LastSeenRow>(
    "user_last_seen",
    "email, location_id, last_seen_at"
  );

  if (lastSeenError) {
    return (
      <ErrorState title="Error loading users" message={lastSeenError.message} />
    );
  }

  const users = new Set<string>();
  const locations = new Set<string>();
  const activeUsers = new Set<string>();
  const activeLocations = new Set<string>();

  const since7 = new Date();
  since7.setDate(since7.getDate() - 6);
  const since7Ms = since7.getTime();

  for (const r of lastSeenRows || []) {
    if (r.email) users.add(r.email);
    if (r.location_id) locations.add(r.location_id);
    if (r.last_seen_at) {
      const ts = new Date(r.last_seen_at).getTime();
      if (ts >= since7Ms) {
        if (r.email) activeUsers.add(r.email);
        if (r.location_id) activeLocations.add(r.location_id);
      }
    }
  }

  const { data: lifetimeRows, error: lifetimeError } = await fetchAll<LifetimeRow>(
    "user_feature_lifetime",
    "email, location_id, feature_key, time_sec"
  );

  if (lifetimeError) {
    return (
      <ErrorState title="Error loading usage data" message={lifetimeError.message} />
    );
  }

  const featureTotals = new Map<string, number>();
  const userFeatureTotals = new Map<string, number>();
  const locationFeatureTotals = new Map<string, number>();
  const userTotals = new Map<string, number>();
  const locationTotals = new Map<string, number>();

  for (const r of lifetimeRows || []) {
    const feature = r.feature_key || "other";
    const time = Number(r.time_sec || 0);
    featureTotals.set(feature, (featureTotals.get(feature) || 0) + time);

    if (r.email) {
      const k = `${r.email}${KEY_SEP}${feature}`;
      userFeatureTotals.set(k, (userFeatureTotals.get(k) || 0) + time);
      userTotals.set(r.email, (userTotals.get(r.email) || 0) + time);
    }

    if (r.location_id) {
      const k = `${r.location_id}${KEY_SEP}${feature}`;
      locationFeatureTotals.set(k, (locationFeatureTotals.get(k) || 0) + time);
      locationTotals.set(r.location_id, (locationTotals.get(r.location_id) || 0) + time);
    }
  }

  const adoptedUsersByFeature = new Map<string, number>();
  for (const [key, time] of userFeatureTotals) {
    if (time < USER_ADOPTED_SEC) continue;
    const feature = key.slice(key.indexOf(KEY_SEP) + KEY_SEP.length);
    adoptedUsersByFeature.set(feature, (adoptedUsersByFeature.get(feature) || 0) + 1);
  }

  const adoptedLocationsByFeature = new Map<string, number>();
  for (const [key, time] of locationFeatureTotals) {
    if (time < COMPANY_ADOPTED_SEC) continue;
    const feature = key.slice(key.indexOf(KEY_SEP) + KEY_SEP.length);
    adoptedLocationsByFeature.set(feature, (adoptedLocationsByFeature.get(feature) || 0) + 1);
  }

  const featureKeys = new Set<string>();
  FEATURES.forEach((f) => featureKeys.add(f.key));
  featureTotals.forEach((_v, k) => featureKeys.add(k));
  adoptedUsersByFeature.forEach((_v, k) => featureKeys.add(k));
  adoptedLocationsByFeature.forEach((_v, k) => featureKeys.add(k));

  const featureStats = Array.from(featureKeys).map((key) => ({
    key,
    label: labelForFeature(key),
    time_sec: featureTotals.get(key) || 0,
    users_adopted: adoptedUsersByFeature.get(key) || 0,
    locations_adopted: adoptedLocationsByFeature.get(key) || 0,
  }));

  const totalLifetimeSec = featureStats.reduce((acc, r) => acc + r.time_sec, 0);
  const totalUsers = users.size || 0;
  const totalLocations = locations.size || 0;

  const overallUserAdoptionPct = totalUsers
    ? Math.round(
        (featureStats.reduce((acc, r) => acc + r.users_adopted, 0) /
          (totalUsers * featureStats.length || 1)) *
          100
      )
    : 0;

  const overallLocationAdoptionPct = totalLocations
    ? Math.round(
        (featureStats.reduce((acc, r) => acc + r.locations_adopted, 0) /
          (totalLocations * featureStats.length || 1)) *
          100
      )
    : 0;

  const topFeatures = featureStats
    .slice()
    .sort((a, b) => b.time_sec - a.time_sec)
    .slice(0, 5);

  const sortedUsage = featureStats
    .slice()
    .sort((a, b) => b.time_sec - a.time_sec);

  const powerUsers = Array.from(userTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const powerCompanies = Array.from(locationTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const adoptionByUsers = featureStats
    .slice()
    .sort((a, b) => b.users_adopted - a.users_adopted)
    .slice(0, 10);

  const adoptionByLocations = featureStats
    .slice()
    .sort((a, b) => b.locations_adopted - a.locations_adopted)
    .slice(0, 10);

  const since = new Date();
  since.setDate(since.getDate() - 13);

  const { data: dailyRows, error: dailyError } = await supabaseAdmin
    .from("feature_daily")
    .select("day, time_sec")
    .gte("day", toDay(since));

  if (dailyError) {
    return (
      <ErrorState title="Error loading daily activity" message={dailyError.message} />
    );
  }

  const dayMap = new Map<string, number>();
  for (const r of dailyRows || []) {
    const k = String(r.day);
    dayMap.set(k, (dayMap.get(k) || 0) + Number(r.time_sec || 0));
  }

  const series: { day: string; sec: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const k = toDay(d);
    series.push({ day: k, sec: dayMap.get(k) || 0 });
  }

  const max = Math.max(1, ...series.map((s) => s.sec));
  const total14Sec = series.reduce((acc, s) => acc + s.sec, 0);

  return (
    <main className="min-h-screen bg-black text-zinc-400 font-sans p-6 md:p-10 selection:bg-zinc-800">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
          <div>
            <div className="text-xs text-zinc-500 mb-2">Overview</div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Product Adoption</h1>
            <p className="text-sm text-zinc-500 mt-2">
              Aggregate usage and adoption across all locations and users.
            </p>
          </div>
          <div className="text-xs text-zinc-500">
            Updated: {new Date().toLocaleString()}
          </div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="Total users" value={totalUsers.toLocaleString()} />
          <StatCard label="Active users (7d)" value={activeUsers.size.toLocaleString()} />
          <StatCard label="Total locations" value={totalLocations.toLocaleString()} />
          <StatCard label="Active locations (7d)" value={activeLocations.size.toLocaleString()} />
          <StatCard label="Lifetime time" value={fmtSec(totalLifetimeSec)} />
          <StatCard
            label="Adoption (users)"
            value={`${overallUserAdoptionPct}%`}
            hint={`Companies: ${overallLocationAdoptionPct}%`}
          />
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card className="min-h-[280px] flex flex-col">
              <SectionHeader title="Activity history" subtitle="Last 14 days" />
              <div className="flex items-end gap-1.5 pt-6 w-full h-48 md:h-56">
                {series.map((p) => {
                  const heightPct = Math.max(4, Math.round((p.sec / max) * 100));
                  return (
                    <div
                      key={p.day}
                      className="flex-1 flex flex-col items-center justify-end h-full group relative"
                    >
                      <div className="absolute -top-8 bg-zinc-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-white/10 pointer-events-none">
                        {p.day}: {fmtSec(p.sec)}
                      </div>
                      <div
                        className="w-full rounded-sm transition-all duration-300"
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: p.sec ? "#e4e4e7" : "#27272a",
                          opacity: p.sec ? 0.9 : 0.3,
                        }}
                      />
                      <div className="text-[10px] text-zinc-600 mt-2 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                        {p.day.slice(8)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-xs text-zinc-500 mt-4">
                Total time tracked: <span className="text-zinc-300 font-mono">{fmtSec(total14Sec)}</span>
              </div>
            </Card>

            <Card>
              <SectionHeader title="Adoption by users" subtitle={`Threshold: ${fmtSec(USER_ADOPTED_SEC)}`} />
              <div className="space-y-3">
                {adoptionByUsers.map((f) => {
                  const pct = totalUsers ? Math.round((f.users_adopted / totalUsers) * 100) : 0;
                  return (
                    <div key={f.key} className="flex items-center gap-3">
                      <div className="w-40 text-sm text-zinc-300 truncate">{f.label}</div>
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-20 text-right text-xs font-mono text-zinc-400">
                        {f.users_adopted}/{totalUsers}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <SectionHeader
                title="Adoption by companies"
                subtitle={`Threshold: ${fmtSec(COMPANY_ADOPTED_SEC)}`}
              />
              <div className="space-y-3">
                {adoptionByLocations.map((f) => {
                  const pct = totalLocations
                    ? Math.round((f.locations_adopted / totalLocations) * 100)
                    : 0;
                  return (
                    <div key={f.key} className="flex items-center gap-3">
                      <div className="w-40 text-sm text-zinc-300 truncate">{f.label}</div>
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-400" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-20 text-right text-xs font-mono text-zinc-400">
                        {f.locations_adopted}/{totalLocations}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="md:col-span-1 space-y-6">
            <Card>
              <SectionHeader title="Power users" subtitle="Top 5 by time" />
              <div className="space-y-2">
                {powerUsers.map(([email, time], idx) => (
                  <div key={email} className="flex items-center justify-between text-sm">
                    <div className="text-zinc-300 truncate">
                      {idx + 1}. {email}
                    </div>
                    <div className="text-xs font-mono text-zinc-500">{fmtSec(time)}</div>
                  </div>
                ))}
                {powerUsers.length === 0 && (
                  <div className="text-sm text-zinc-600 italic py-2 text-center">
                    No user usage data found.
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <SectionHeader title="Power companies" subtitle="Top 5 by time" />
              <div className="space-y-2">
                {powerCompanies.map(([locationId, time], idx) => (
                  <div key={locationId} className="flex items-center justify-between text-sm">
                    <div className="text-zinc-300 truncate">
                      {idx + 1}. {locationId}
                    </div>
                    <div className="text-xs font-mono text-zinc-500">{fmtSec(time)}</div>
                  </div>
                ))}
                {powerCompanies.length === 0 && (
                  <div className="text-sm text-zinc-600 italic py-2 text-center">
                    No company usage data found.
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <SectionHeader title="Top features" subtitle="Lifetime usage" />
              <div className="space-y-2">
                {topFeatures.map((f, idx) => (
                  <div
                    key={f.key}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/5 transition-colors"
                  >
                    <div className="overflow-hidden pr-3">
                      <div className="text-sm font-medium text-zinc-300 truncate">
                        {idx + 1}. {f.label}
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-0.5">
                        Share: {totalLifetimeSec ? Math.round((f.time_sec / totalLifetimeSec) * 100) : 0}%
                      </div>
                    </div>
                    <div className="text-xs font-mono font-semibold text-zinc-400">
                      {fmtSec(Number(f.time_sec || 0))}
                    </div>
                  </div>
                ))}
                {topFeatures.length === 0 && (
                  <div className="text-sm text-zinc-600 italic py-2 text-center">
                    No feature usage data found.
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <SectionHeader title="Total usage reports" subtitle="Time by feature" />
              <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                {sortedUsage.map((f) => {
                  const pct = totalLifetimeSec
                    ? Math.round((f.time_sec / totalLifetimeSec) * 100)
                    : 0;
                  return (
                    <div key={f.key} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 truncate">{f.label}</span>
                        <span className="text-zinc-500 font-mono">{fmtSec(f.time_sec)}</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-zinc-200" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
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
