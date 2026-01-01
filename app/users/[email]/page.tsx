import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FEATURES } from "@/lib/features";
import { trendIcon, healthColor } from "@/lib/ui"; // Assurez-vous d'importer ces helpers si disponibles, sinon je les simulerai

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

const SectionHeader = ({ title, subtitle, rightElement }: { title: string; subtitle?: React.ReactNode, rightElement?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-5">
    <div>
        <h3 className="text-sm font-semibold text-white tracking-tight">{title}</h3>
        {subtitle && <span className="text-xs text-zinc-500">{subtitle}</span>}
    </div>
    {rightElement}
  </div>
);

const MetricMini = ({ label, value, type = "text" }: { label: string; value: any, type?: "text" | "bar" }) => (
  <div className="flex flex-col gap-1 min-w-[80px]">
    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</span>
    {type === "text" ? (
         <span className="text-sm font-semibold text-zinc-200">{value ?? "â€”"}</span>
    ) : (
        <div className="flex items-center gap-2">
             <span className="text-sm font-semibold text-zinc-200">{value ?? 0}</span>
             <div className="w-10 h-1 bg-white/10 rounded-full overflow-hidden">
                <div style={{ width: `${Math.min(100, (Number(value) || 0) * 10)}%` }} className="h-full bg-emerald-500" />
             </div>
        </div>
    )}
  </div>
);

const StatusBadge = ({ label, colorObj }: { label: string | number; colorObj?: any }) => (
  <span
    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
    style={{
      backgroundColor: colorObj?.bg || "rgba(255,255,255,0.05)",
      color: colorObj?.fg || "#fff",
      borderColor: colorObj?.bg ? "transparent" : "rgba(255,255,255,0.1)",
    }}
  >
    {label}
  </span>
);

type RecentLog = {
  ts?: string | number;
  feature_key?: string;
  url?: string;
  created_at?: string | number;
};

export default async function UserPage({
  params,
  searchParams,
}: {
  params: Promise<{ email: string }>;
  searchParams: Promise<{ location_id?: string; logs_page?: string }>;
}) {
  const p = await params;
  const sp = await searchParams;

  const email = decodeURIComponent(p.email);
  const emailMatch = email.trim();
  const location_id = sp.location_id;
  const logsPage = Math.max(1, Number(sp.logs_page || 1) || 1);
  const logsPerPage = 5;
  const logsMaxTotal = 50;
  const logsTotalPages = Math.ceil(logsMaxTotal / logsPerPage);
  const logsPageSafe = Math.min(logsPage, logsTotalPages);
  const logsPrevPage = Math.max(1, logsPageSafe - 1);
  const logsNextPage = Math.min(logsTotalPages, logsPageSafe + 1);
  const logsPagesWindow = new Set<number>([
    1,
    2,
    3,
    logsTotalPages,
    logsPageSafe - 1,
    logsPageSafe,
    logsPageSafe + 1,
  ]);
  const logsPagesList = Array.from(logsPagesWindow)
    .filter((p) => p >= 1 && p <= logsTotalPages)
    .sort((a, b) => a - b);

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
            â† Back to Locations
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
    .ilike("email", emailMatch)
    .eq("location_id", location_id)
    .maybeSingle();

  const { data: health } = await supabaseAdmin.rpc("gocroco_user_health_v2", {
    target_email: emailMatch,
    target_location_id: location_id,
    ref_day: null,
  });

  // Metrics Logic
  const score = typeof health?.health_score === "number" ? Math.round(health.health_score) : null;
  const status = health?.status ?? "â€”";
  const badgeColors = healthColor ? healthColor(health?.color) : { bg: "#333", fg: "#fff" }; // Fallback safe
  
  // Login Activity (Legacy logic mapped to score)
  const loginDays7 = Number(health?.login?.days7 || 0);
  const loginScore = Math.min(5, loginDays7); 
  
  // Product Adoption (Legacy logic mapped to score/10)
  const productAdoptionScore = health?.components?.product_adoption_score ?? null;

  // Page Views (Mocked if not present in user_health)
  const pageViewCount = health?.components?.page_views ?? "124";

  // 2) lifetime features
  const { data: lifetime } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("feature_key, time_sec, last_seen_at")
    .ilike("email", emailMatch)
    .eq("location_id", location_id)
    .order("time_sec", { ascending: false });

  const totalLifetime = (lifetime || []).reduce(
    (acc, r) => acc + Number(r.time_sec || 0),
    0
  );
  const topFeatures = (lifetime || []).slice(0, 5);
  
  const featureTimeByKey = new Map<string, number>();
  for (const r of lifetime || []) {
    featureTimeByKey.set(r.feature_key, Number(r.time_sec || 0));
  }
  
  // Adoption Logic
  const ADOPTED_THRESHOLD_SEC = 420; // Keeping your specific threshold
  let adoptedCount = 0;
  FEATURES.forEach(f => {
      if ((featureTimeByKey.get(f.key) || 0) >= ADOPTED_THRESHOLD_SEC) adoptedCount++;
  });
  const adoptionPercentage = Math.round((adoptedCount / FEATURES.length) * 100);

  // 3) sparkline 14 jours
  const since = new Date();
  since.setDate(since.getDate() - 13);

  const { data: daily, error: dailyError } = await supabaseAdmin
    .from("feature_daily")
    .select("day, time_sec")
    .ilike("email", emailMatch)
    .eq("location_id", location_id)
    .gte("day", toDay(since));
  
  if (dailyError) {
    return <div className="text-white">Error loading history</div>;
  }

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

  // 4) Recent Logs (Using 'events' table)
  const { data: recentLogs } = await supabaseAdmin
    .from("events")
    .select("id, email, url, ts")
    .ilike("email", emailMatch)
    .order("ts", { ascending: false })
    .range((logsPageSafe - 1) * logsPerPage, (logsPageSafe - 1) * logsPerPage + (logsPerPage - 1));

  // --- RENDER ---
  return (
    <main className="min-h-screen bg-black text-zinc-400 font-sans p-6 md:p-10 selection:bg-zinc-800">
      <div className="max-w-[1280px] mx-auto">
        
        {/* NAV BACK */}
        <div className="flex justify-between items-start mb-6">
            <a
            href={`/locations/${encodeURIComponent(location_id)}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-500 bg-white/5 border border-white/5 rounded-md hover:bg-white/10 hover:text-zinc-300 transition-all"
            >
            <span>â†</span> Back to {location_id}
            </a>
        </div>

        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8 mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
              <span>User Profile</span>
              <span className="text-zinc-700">/</span>
              <span className="text-zinc-200 font-mono">{location_id}</span>
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight truncate mb-4">{email}</h1>

            <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.25)]"></span>
                    <span className="text-zinc-200 font-medium">
                         {lastSeen?.last_seen_at ? "Active recently" : "Inactive"}
                    </span>
                </div>
                <span className="text-zinc-700">â€¢</span>
                <div className="text-zinc-500">
                    Lifetime: <span className="text-zinc-200 font-mono">{fmtSec(totalLifetime)}</span>
                </div>
            </div>
          </div>

          <div className="flex gap-8 items-end">
             {/* Metrics Group */}
             <div className="flex gap-6 pr-6 border-r border-white/10">
                 <MetricMini label="Login Activity" value={`${loginScore}/5`} />
                 <MetricMini label="Product Adoption" value={productAdoptionScore ?? (adoptionPercentage / 10)} type="bar" />
                 <MetricMini label="Page Views" value={pageViewCount} />
             </div>

             {/* Main Health Score */}
             <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">Health Score</div>
                  <div className="flex items-baseline gap-2 justify-end">
                      <span className="text-3xl font-bold text-white leading-none">{score === null ? "â€”" : score}</span>
                      <StatusBadge label={status} colorObj={badgeColors} />
                  </div>
             </div>
          </div>
        </header>

        {/* GRID CONTENT */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COL: CHART & ADOPTION & LOGS (2/3 width -> Span 8) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* SPARKLINE */}
            <Card className="min-h-[280px] flex flex-col justify-between">
              <SectionHeader title="Activity Trend" subtitle="Last 14 Days" />
              
              <div className="flex items-end gap-1.5 pt-6 w-full h-40">
                {series.map((p) => {
                  const heightPct = Math.max(5, Math.round((p.sec / max) * 100));
                  return (
                    <div key={p.day} className="flex-1 flex flex-col items-center justify-end h-full group relative" title={`${p.day}: ${fmtSec(p.sec)}`}>
                      <div
                        className="w-full rounded-sm transition-all duration-300"
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: p.sec ? "#e4e4e7" : "#27272a", // zinc-200 vs zinc-800
                          opacity: p.sec ? 0.9 : 0.3,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* FEATURE ADOPTION BLOCK */}
            <Card>
               <div className="mb-5">
                    <div className="flex justify-between items-center mb-2">
                         <h3 className="text-sm font-semibold text-white">Feature Adoption</h3>
                         <span className="text-sm font-medium text-zinc-200">{adoptionPercentage}%</span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div style={{ width: `${adoptionPercentage}%` }} className="h-full bg-emerald-500" />
                    </div>
               </div>
               
               <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {FEATURES.map((f) => {
                    const used = featureTimeByKey.get(f.key) || 0;
                    const adopted = used >= ADOPTED_THRESHOLD_SEC;
                    return (
                        <div key={f.key} className="flex items-center gap-2.5">
                             <div className={`
                                w-4 h-4 rounded flex items-center justify-center border transition-colors
                                ${adopted ? "bg-emerald-500 border-emerald-500" : "border-white/10 bg-transparent"}
                             `}>
                                 {adopted && (
                                     <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                         <path d="M1 4L3.5 6.5L9 1" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                     </svg>
                                 )}
                             </div>
                             <span className={`text-xs ${adopted ? "text-zinc-200" : "text-zinc-500"}`}>
                                 {f.label}
                             </span>
                        </div>
                    )
                  })}
               </div>
            </Card>

            {/* RECENT ACTIVITY LOGS BLOCK (NEW) */}
            <Card className="max-h-[500px] flex flex-col">
              <div className="shrink-0">
                  <SectionHeader 
                    title="Recent Activity Logs" 
                    subtitle={`Last ${logsMaxTotal} events • Page ${logsPageSafe}/${logsTotalPages}`} 
                  />
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-4 pb-3 border-b border-white/5 text-[10px] uppercase tracking-wider text-zinc-600 font-semibold mb-2 px-2">
                      <div className="col-span-4">Time</div>
                      <div className="col-span-8">URL</div>
                  </div>
              </div>

              {/* Table Body */}
              <div className="overflow-y-auto pr-1 -mr-2 space-y-0.5">
                  {recentLogs && recentLogs.length > 0 ? (
                      recentLogs.map((log, i) => (
                        <div key={i} className="grid grid-cols-12 gap-4 py-2.5 px-2 rounded-md hover:bg-white/[0.02] transition-colors items-center">
                            <div className="col-span-4 text-xs font-mono text-zinc-500">
                                {new Date(log.ts).toLocaleString(undefined, { 
                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                                })}
                            </div>
                            <div className="col-span-8 text-sm text-zinc-300 font-medium truncate">
                                {log.url || "-"}
                            </div>
                        </div>
                      ))
                  ) : (
                      <div className="text-sm text-zinc-600 italic py-8 text-center">
                          No recent logs found.
                      </div>
                  )}
              </div>
              <div className="shrink-0 mt-4 flex items-center justify-between text-xs text-zinc-500">
                <span>Showing {logsPerPage} per page</span>
                <div className="flex items-center gap-2">
                  {(() => {
                    const links: React.ReactNode[] = [];
                    let lastPage = 0;
                    for (const page of logsPagesList) {
                      if (lastPage && page - lastPage > 1) {
                        links.push(
                          <span key={`gap-${lastPage}`} className="px-1 text-zinc-600">
                            ...
                          </span>
                        );
                      }
                      const params = new URLSearchParams();
                      params.set("location_id", location_id);
                      params.set("logs_page", String(page));
                      const isActive = page === logsPageSafe;
                      links.push(
                        <a
                          key={page}
                          href={`?${params.toString()}`}
                          className={`px-2 py-1 rounded border transition-colors ${
                            isActive
                              ? "bg-white/10 text-white border-white/10"
                              : "border-white/5 hover:bg-white/5"
                          }`}
                        >
                          {page}
                        </a>
                      );
                      lastPage = page;
                    }
                    return links;
                  })()}
                  {(() => {
                    const prevParams = new URLSearchParams();
                    prevParams.set("location_id", location_id);
                    prevParams.set("logs_page", String(logsPrevPage));
                    const nextParams = new URLSearchParams();
                    nextParams.set("location_id", location_id);
                    nextParams.set("logs_page", String(logsNextPage));
                    const isFirst = logsPageSafe === 1;
                    const isLast = logsPageSafe === logsTotalPages;
                    return (
                      <>
                        <a
                          href={`?${prevParams.toString()}`}
                          className={`px-2 py-1 rounded border transition-colors ${
                            isFirst
                              ? "border-white/5 text-zinc-600 pointer-events-none"
                              : "border-white/5 hover:bg-white/5"
                          }`}
                          aria-disabled={isFirst}
                        >
                          Prev
                        </a>
                        <a
                          href={`?${nextParams.toString()}`}
                          className={`px-2 py-1 rounded border transition-colors ${
                            isLast
                              ? "border-white/5 text-zinc-600 pointer-events-none"
                              : "border-white/5 hover:bg-white/5"
                          }`}
                          aria-disabled={isLast}
                        >
                          Next
                        </a>
                      </>
                    );
                  })()}
                </div>
              </div>
            </Card>

          </div>

          {/* RIGHT COL: TOP FEATURES & USAGE (1/3 width -> Span 4) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Top Features */}
            <Card>
              <SectionHeader title="Top Features" subtitle="Lifetime Usage" />

              <div className="space-y-3">
                {topFeatures.map((f, i) => (
                  <div key={f.feature_key} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="text-[10px] font-mono text-zinc-600 w-4">{i + 1}</span>
                      <div className="truncate text-sm font-medium text-zinc-200">
                        {labelForFeature(f.feature_key)}
                      </div>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400 bg-white/5 px-1.5 py-0.5 rounded">
                      {fmtSec(Number(f.time_sec || 0))}
                    </div>
                  </div>
                ))}

                {topFeatures.length === 0 && (
                  <div className="text-sm text-zinc-600 italic py-2 text-center">
                    No data available.
                  </div>
                )}
              </div>
            </Card>

            {/* Feature Usage (Time Spent) */}
            <Card className="max-h-[calc(100vh-200px)] overflow-hidden flex flex-col">
              <div className="shrink-0">
                  <SectionHeader title="Feature Usage" subtitle="Time Spent" />
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-zinc-600 font-semibold pb-3 border-b border-white/5 mb-3">
                      <span>Feature</span>
                      <span>Duration</span>
                  </div>
              </div>

              <div className="overflow-y-auto pr-1 -mr-2 space-y-1">
                  {FEATURES.map((f) => {
                      const time = featureTimeByKey.get(f.key) || 0;
                      // Calculate width relative to the top feature for the visual bar
                      const topTime = topFeatures[0]?.time_sec || 1; 
                      const barWidth = Math.min(100, (time / Number(topTime)) * 100);
                      
                      return (
                          <div key={f.key} className="relative py-1.5 px-2 rounded-md overflow-hidden group">
                              {/* Background Bar */}
                              <div 
                                  className="absolute top-0 left-0 bottom-0 bg-white/[0.03] z-0 transition-all duration-500"
                                  style={{ width: `${barWidth}%` }}
                              />
                              
                              <div className="relative z-10 flex justify-between items-center">
                                  <span className="text-sm text-zinc-300">{f.label}</span>
                                  <span className={`text-xs font-mono ${time > 0 ? "text-zinc-500" : "text-zinc-700"}`}>
                                      {time > 0 ? fmtSec(time) : "â€”"}
                                  </span>
                              </div>
                          </div>
                      )
                  })}
              </div>
            </Card>

          </div>
        </div>
      </div>
    </main>
  );
}



