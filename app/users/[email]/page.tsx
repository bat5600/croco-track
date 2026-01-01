import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FEATURES } from "@/lib/features";

// --- Helpers ---
function fmtSec(sec: number) {
  const n = Number(sec || 0);
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const r = n % 60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

function labelForFeature(key: string) {
  return FEATURES.find((f) => f.key === key)?.label ?? key;
}

function toDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

// --- Components ---

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

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ email: string }>;
  searchParams: Promise<{ location_id?: string }>;
}) {
  const p = await params;
  const sp = await searchParams;

  const email = decodeURIComponent(p.email);
  const location_id = sp.location_id;

  // --- ERROR STATE ---
  if (!location_id) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black p-6 font-sans">
        <div className="bg-zinc-900/40 border border-white/10 rounded-xl p-8 max-w-sm w-full text-center backdrop-blur-sm">
          <h1 className="text-xl font-semibold text-white mb-3">Missing Context</h1>
          <p className="text-sm text-zinc-400 mb-6">
            The parameter <code className="text-blue-400 font-mono bg-blue-500/10 px-1 rounded">location_id</code> is missing from the URL.
          </p>
          <a
            href="/locations"
            className="inline-flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-zinc-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
          >
            ← Back to Locations
          </a>
        </div>
      </main>
    );
  }

  // --- DATA FETCHING ---

  // 1) last seen
  const { data: lastSeen } = await supabaseAdmin
    .from("user_last_seen")
    .select("last_seen_at, last_url")
    .eq("email", email)
    .eq("location_id", location_id)
    .maybeSingle();

  // 2) lifetime features
  const { data: lifetime } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("feature_key, time_sec, last_seen_at")
    .eq("email", email)
    .eq("location_id", location_id)
    .order("time_sec", { ascending: false })
    .limit(20);

  const totalLifetime = (lifetime || []).reduce(
    (acc, r) => acc + Number(r.time_sec || 0),
    0
  );

  // 3) sparkline 14 jours
  const since = new Date();
  since.setDate(since.getDate() - 13);

  const { data: daily } = await supabaseAdmin
    .from("feature_daily")
    .select("day, time_sec")
    .eq("email", email)
    .eq("location_id", location_id)
    .gte("day", toDay(since));

  const dayMap = new Map<string, number>();
  for (const r of daily || []) {
    const k = String(r.day);
    dayMap.set(k, (dayMap.get(k) || 0) + Number(r.time_sec || 0));
  }

  const series = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const k = toDay(d);
    series.push({ day: k, sec: dayMap.get(k) || 0 });
  }

  const max = Math.max(1, ...series.map((s) => s.sec));

  // --- RENDER ---
  return (
    <main className="min-h-screen bg-black text-zinc-400 font-sans p-6 md:p-10 selection:bg-zinc-800">
      <div className="max-w-5xl mx-auto">
        
        {/* NAV BACK */}
        <a
          href={`/locations/${encodeURIComponent(location_id)}`}
          className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 text-xs font-medium text-zinc-500 bg-white/5 border border-white/5 rounded-md hover:bg-white/10 hover:text-zinc-300 transition-all"
        >
          <span>←</span> Back to {location_id}
        </a>

        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8 mb-8">
          <div className="overflow-hidden min-w-0">
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
              <span>User Profile</span>
              <span className="text-zinc-700">/</span>
              <span className="text-zinc-200 font-mono">{location_id}</span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight truncate mb-4">{email}</h1>

            <div className="flex gap-8 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">Last Seen</div>
                <div className="text-zinc-200 font-medium">
                  {lastSeen?.last_seen_at
                    ? new Date(lastSeen.last_seen_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">Total Lifetime</div>
                <div className="text-zinc-200 font-medium font-mono">{fmtSec(totalLifetime)}</div>
              </div>
            </div>
          </div>

          <div className="text-left md:text-right max-w-md w-full md:w-auto">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1.5">Last Activity</div>
            <div className="text-xs text-zinc-300 bg-white/5 border border-white/5 px-3 py-2 rounded-lg break-all">
              {lastSeen?.last_url || "No activity recorded"}
            </div>
          </div>
        </header>

        {/* GRID CONTENT */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* LEFT COL: CHART (2/3 width) */}
          <div className="md:col-span-2 space-y-6">
            <Card className="min-h-[300px] flex flex-col">
              <SectionHeader title="Activity History" subtitle="Last 14 Days" />
              
              <div className="flex-1 flex items-end gap-1.5 pt-6 w-full">
                {series.map((p) => {
                  const heightPct = Math.max(4, Math.round((p.sec / max) * 100));
                  return (
                    <div key={p.day} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-8 bg-zinc-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-white/10 pointer-events-none">
                        {p.day}: {fmtSec(p.sec)}
                      </div>
                      
                      <div
                        className="w-full rounded-sm transition-all duration-300"
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: p.sec ? "#e4e4e7" : "#27272a", // zinc-200 vs zinc-800
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
            </Card>
          </div>

          {/* RIGHT COL: FEATURES (1/3 width) */}
          <div className="md:col-span-1 space-y-6">
            <Card>
              <SectionHeader title="Top Features" subtitle="Lifetime Usage" />

              <div className="space-y-2">
                {(lifetime || []).map((f) => (
                  <div
                    key={f.feature_key}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/5 transition-colors group"
                  >
                    <div className="overflow-hidden pr-3">
                      <div className="text-sm font-medium text-zinc-300 truncate group-hover:text-white transition-colors">
                        {labelForFeature(f.feature_key)}
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-0.5">
                        Last: {f.last_seen_at ? new Date(f.last_seen_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                      </div>
                    </div>
                    <div className="text-xs font-mono font-semibold text-zinc-400 group-hover:text-zinc-200">
                      {fmtSec(Number(f.time_sec || 0))}
                    </div>
                  </div>
                ))}

                {(lifetime || []).length === 0 && (
                  <div className="text-sm text-zinc-600 italic py-2 text-center">
                    No feature usage data found.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}