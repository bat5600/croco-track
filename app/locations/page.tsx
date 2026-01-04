import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fmtSec, healthColor, trendIcon } from "@/lib/ui";

// --- Types & Helpers ---

type Row = { location_id: string; last_seen_at: string | null };

type ViewRow = {
  location_id: string;
  display_name: string;
  last_seen_at: string | null;
  total_sec: number;
  total_pct: number;
  login_days_7: number;
  login_days_30: number;
  login_activity_pct: number;
  health_score: number | null;
  health_status: string;
  health_pct: number;
  health_color: string | undefined;
  trend: string | undefined;
};

function toPct(n: number, max: number) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, Math.round((n / max) * 100)));
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

// --- Components ---

const SearchInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="relative group flex-1 min-w-[200px]">
    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
      <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
    </div>
    <input
      {...props}
      className="h-10 pl-9 pr-4 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/5 w-full transition-all hover:bg-zinc-900/80"
    />
  </div>
);

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="relative min-w-[160px]">
    <select
      {...props}
      className="h-10 pl-3 pr-8 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-white/20 appearance-none w-full transition-all cursor-pointer hover:bg-zinc-900/80"
    />
    <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
      <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
    </div>
  </div>
);

// --- Page ---

export default async function LocationsPage({ searchParams }: { searchParams?: any }) {
  const sp = await searchParams || {};
  const limit = Math.min(Number(sp.limit || 1000), 3000);
  const q = String(sp.q || "").trim().toLowerCase();
  const healthFilter = String(sp.health || "").trim().toLowerCase();
  const sort = String(sp.sort || "last_seen");

  // 1) discover locations from user_last_seen
  const { data: rows, error } = await supabaseAdmin
    .from("user_last_seen")
    .select("location_id, last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (error) {
    return (
      <main className="min-h-screen bg-black text-white p-10 flex items-center justify-center">
        <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-xl max-w-lg backdrop-blur-sm">
           <h1 className="text-xl font-bold text-red-400 mb-2">Error loading locations</h1>
           <pre className="text-xs text-red-300/70 whitespace-pre-wrap font-mono">{error.message}</pre>
        </div>
      </main>
    );
  }

  // aggregate max last_seen per location
  const agg = new Map<string, Row>();
  for (const r of rows || []) {
    const id = String(r.location_id || "");
    if (!id) continue;
    const prev = agg.get(id);
    if (!prev) agg.set(id, { location_id: id, last_seen_at: r.last_seen_at ?? null });
    else {
      const a = prev.last_seen_at ? new Date(prev.last_seen_at).getTime() : 0;
      const b = r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0;
      if (b > a) prev.last_seen_at = r.last_seen_at ?? prev.last_seen_at;
    }
  }

  const locations = Array.from(agg.values());

  // 2) lifetime totals by location
  const ids = locations.map((x) => x.location_id);
  const { data: lifetimeRows, error: e2 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("location_id, time_sec")
    .in("location_id", ids.length ? ids : ["__none__"]);

  if (e2) {
    return (
      <main className="min-h-screen bg-black text-white p-10 flex items-center justify-center">
        <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-xl max-w-lg backdrop-blur-sm">
           <h1 className="text-xl font-bold text-red-400 mb-2">Error loading lifetime data</h1>
           <pre className="text-xs text-red-300/70 whitespace-pre-wrap font-mono">{e2.message}</pre>
        </div>
      </main>
    );
  }

  const totals = new Map<string, number>();
  for (const r of lifetimeRows || []) {
    const id = String(r.location_id || "");
    if (!id) continue;
    totals.set(id, (totals.get(id) || 0) + Number(r.time_sec || 0));
  }

  const maxTotal = Math.max(0, ...Array.from(totals.values()));

  // 2b) resolve display names from ghl_locations (fallback to id)
  const nameMap = new Map<string, string>();
  if (ids.length) {
    const { data: locationRows } = await supabaseAdmin
      .from("ghl_locations")
      .select("location_id, profile")
      .in("location_id", ids);
    for (const row of locationRows || []) {
      const id = String(row.location_id || "");
      if (!id) continue;
      nameMap.set(id, pickLocationName(row.profile, id));
    }
  }

  // 3) health enrichment (first N locations)
  const ENRICH_LIMIT = 40;
  const healthMap = new Map<string, any>();

  await Promise.all(
    locations.slice(0, ENRICH_LIMIT).map(async (l) => {
      const { data } = await supabaseAdmin.rpc("gocroco_location_health_v2", {
        target_location_id: l.location_id,
        ref_day: null,
      });
      healthMap.set(l.location_id, data);
    })
  );

  const viewRows: ViewRow[] = locations.map((l) => {
    const total = totals.get(l.location_id) || 0;
    const health = healthMap.get(l.location_id);
    const score = typeof health?.health_score === "number" ? Math.round(health.health_score) : null;
    const status = String(health?.status || "Unknown");
    const color = health?.color;
    const days7 = Number(health?.login?.days7 || 0);
    const days30 = Number(health?.login?.days30 || 0);
    const loginDaysCapped = Math.min(5, days7);
    const loginPct = Math.round((loginDaysCapped / 5) * 100);
    const displayName = nameMap.get(l.location_id) || l.location_id;
    return {
      location_id: l.location_id,
      display_name: displayName,
      last_seen_at: l.last_seen_at,
      total_sec: total,
      total_pct: toPct(total, maxTotal),
      login_days_7: days7,
      login_days_30: days30,
      login_activity_pct: loginPct,
      health_score: score,
      health_status: status,
      health_pct: score === null ? 0 : Math.max(0, Math.min(100, score)),
      health_color: color,
      trend: health?.trend?.indicator,
    };
  });

  const filtered = viewRows.filter((r) => {
    if (q && !r.location_id.toLowerCase().includes(q) && !r.display_name.toLowerCase().includes(q)) return false;
    if (healthFilter && r.health_status.toLowerCase() !== healthFilter) return false;
    return true;
  });

  const sorted = filtered.sort((a, b) => {
    if (sort === "health") return (b.health_score ?? -1) - (a.health_score ?? -1);
    if (sort === "lifetime") return b.total_sec - a.total_sec;
    const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
    const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
    return tb - ta;
  });

  // ---------------------------------------------------------
  // 4. RENDER
  // ---------------------------------------------------------

  return (
    <main className="min-h-screen bg-black text-zinc-400 font-sans p-6 md:p-10 selection:bg-zinc-800">
      <div className="max-w-[1600px] mx-auto space-y-8">
        
        {/* --- HEADER --- */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Locations</h1>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
               <span className="bg-white/5 px-2 py-0.5 rounded text-zinc-300 font-mono">{locations.length}</span>
               <span>total locations found</span>
               <span className="text-zinc-700">•</span>
               <span>Enriched health for top <b className="text-zinc-300">{ENRICH_LIMIT}</b></span>
            </div>
          </div>
        </header>

        {/* --- TOOLBAR --- */}
        <form className="flex flex-col lg:flex-row items-center gap-4 bg-zinc-900/20 p-2 rounded-xl border border-white/5 backdrop-blur-sm">
           <SearchInput name="q" defaultValue={sp.q || ""} placeholder="Search locations..." />
           
           <div className="flex gap-3 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
             <Select name="health" defaultValue={healthFilter}>
                <option value="">All Health Status</option>
                <option value="thriving">Thriving</option>
                <option value="healthy">Healthy</option>
                <option value="steady">Steady</option>
                <option value="at-risk">At-risk</option>
                <option value="unknown">Unknown</option>
             </Select>

             <Select name="sort" defaultValue={sort}>
                <option value="last_seen">Sort by Last Updated</option>
                <option value="health">Sort by Health Score</option>
                <option value="lifetime">Sort by Lifetime</option>
             </Select>
           </div>

           <div className="flex items-center gap-3 w-full lg:w-auto justify-end ml-auto pl-2 border-t lg:border-t-0 border-white/5 pt-3 lg:pt-0">
              <button
                type="submit"
                className="h-10 px-6 rounded-lg bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)] whitespace-nowrap"
              >
                Apply
              </button>
              <a
                href="/locations"
                className="h-10 px-4 inline-flex items-center justify-center rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
              >
                Reset
              </a>
           </div>
        </form>

        {/* --- DATA TABLE --- */}
        <div className="bg-zinc-900/40 border border-white/5 rounded-xl overflow-hidden backdrop-blur-sm shadow-xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-6 py-4 w-12 text-center">
                     <input type="checkbox" className="rounded border-zinc-700 bg-zinc-800/50 text-white focus:ring-0 focus:ring-offset-0 cursor-pointer" aria-label="select all" />
                  </th>
                  <th className="px-6 py-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider w-40">Last Updated</th>
                  <th className="px-6 py-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider w-56">Login Activity (7d)</th>
                  <th className="px-6 py-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider w-56">Lifetime Time</th>
                  <th className="px-6 py-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider w-64">Health Status</th>
                  <th className="px-6 py-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sorted.map((l) => {
                  const badge = healthColor(l.health_color);
                  const healthLabel = `${l.health_status}${l.health_score === null ? "" : ` ${l.health_score}%`}`;
                  
                  return (
                    <tr key={l.location_id} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 text-center">
                        <input type="checkbox" className="rounded border-zinc-700 bg-zinc-800/50 text-white focus:ring-0 focus:ring-offset-0 opacity-40 group-hover:opacity-100 transition-opacity cursor-pointer" aria-label={`select ${l.location_id}`} />
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                           <a
                            href={`/locations/${encodeURIComponent(l.location_id)}`}
                            className="text-sm font-bold text-zinc-200 group-hover:text-white group-hover:underline decoration-zinc-700 underline-offset-4 transition-all"
                          >
                            {l.display_name}
                          </a>
                          <a
                            href={`/users?location_id=${encodeURIComponent(l.location_id)}`}
                            className="text-xs text-zinc-600 mt-1 hover:text-zinc-400 transition-colors w-fit flex items-center gap-1"
                          >
                            View users <span className="text-[10px]">→</span>
                          </a>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="text-sm text-zinc-400 font-medium">
                           {l.last_seen_at ? new Date(l.last_seen_at).toLocaleDateString(undefined, {month:'short', day:'numeric'}) : "—"}
                        </div>
                        <div className="text-xs text-zinc-600 mt-0.5 font-mono">
                           {l.last_seen_at ? new Date(l.last_seen_at).toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'}) : ""}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                         <div className="flex flex-col gap-2">
                             <div className="flex justify-between items-baseline text-xs">
                                 <span className="font-semibold text-zinc-300">{Math.min(5, l.login_days_7)}<span className="text-zinc-600 font-normal">/5 days</span></span>
                                 <span className="text-zinc-500 font-mono text-[10px]">{l.login_activity_pct}%</span>
                             </div>
                             <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden w-full max-w-[140px]">
                                <div 
                                  style={{ width: `${l.login_activity_pct}%` }} 
                                  className="h-full bg-emerald-500 rounded-full opacity-80 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                                />
                             </div>
                         </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2">
                           <div className="flex items-center justify-between max-w-[140px]">
                              <span className="text-sm font-mono text-zinc-300 font-medium">{fmtSec(l.total_sec)}</span>
                           </div>
                           <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden w-full max-w-[140px]">
                              <div 
                                style={{ width: `${l.total_pct}%` }} 
                                className="h-full bg-zinc-400 rounded-full opacity-60 group-hover:opacity-100 transition-opacity"
                              />
                           </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2">
                           <div className="flex items-center">
                              <span 
                                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shadow-sm backdrop-blur-sm transition-transform group-hover:scale-105"
                                style={{
                                    backgroundColor: badge.bg || "rgba(255,255,255,0.05)",
                                    color: badge.fg || "#fff",
                                    borderColor: badge.bg ? "transparent" : "rgba(255,255,255,0.1)",
                                }}
                              >
                                 <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: badge.fg, boxShadow: `0 0 6px ${badge.fg}40` }} />
                                 {healthLabel}
                                 {l.trend && <span className="opacity-80 ml-0.5">{trendIcon(l.trend)}</span>}
                              </span>
                           </div>
                           
                           {l.health_score !== null && (
                               <div className="h-1 bg-zinc-800/50 rounded-full overflow-hidden w-full max-w-[140px]">
                                  <div 
                                    style={{ width: `${l.health_pct}%`, backgroundColor: badge.fg }} 
                                    className="h-full rounded-full opacity-60"
                                  />
                               </div>
                           )}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 text-right">
                         <a
                            href={`/locations/${encodeURIComponent(l.location_id)}`}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-white/5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
                          >
                            Open
                          </a>
                      </td>
                    </tr>
                  );
                })}
                
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-zinc-500 italic">
                       No locations match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Footer info */}
        <div className="flex flex-col sm:flex-row justify-between items-center text-xs text-zinc-600 px-2 pb-10 gap-2">
           <div>Showing {sorted.length} locations</div>
           <div>Sorted by <span className="text-zinc-400 font-medium">{sort}</span></div>
        </div>
        
      </div>
    </main>
  );
}
