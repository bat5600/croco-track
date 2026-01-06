import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fmtSec, healthColor, trendIcon, riskTags } from "@/lib/ui";

// --- Types ---
type LastSeenRow = {
  email: string;
  location_id: string;
  last_seen_at: string | null;
  last_url: string | null;
};

type EmailRow = {
  email: string;
  last_seen_at: string | null;
  last_url: string | null;
  locations: string[];
};

type ViewRow = EmailRow & {
  total_sec: number;
  health_score: number | null;
  health_status: string;
  health_color: string | undefined;
  trend: string | undefined;
  risk_tags: string[];
  login_days_capped: number;
  login_pct: number;
};

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

export default async function UsersPage({ searchParams }: { searchParams?: Promise<any> }) {
  const sp = await searchParams || {};
  const location_id = sp.location_id || sp.location || "";
  const q = String(sp.q || "").trim().toLowerCase();
  const healthFilter = String(sp.health || "").trim().toLowerCase();
  const sort = String(sp.sort || "last_seen");
  const limit = Math.min(Number(sp.limit || 200), 500);

  // 1) last seen
  let query = supabaseAdmin
    .from("user_last_seen")
    .select("email, location_id, last_seen_at, last_url")
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (location_id) {
    query = query.eq("location_id", location_id);
  }

  const { data: lastSeen, error: e1 } = await query;

  if (e1) {
    return (
      <main className="min-h-screen bg-black text-white p-10 flex items-center justify-center">
        <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-xl max-w-lg backdrop-blur-sm">
           <h1 className="text-xl font-bold text-red-400 mb-2">Error loading users</h1>
           <pre className="text-xs text-red-300/70 whitespace-pre-wrap font-mono">{e1.message}</pre>
        </div>
      </main>
    );
  }
  const rawRows = (lastSeen || []) as LastSeenRow[];

  // Filter in memory for search query (email)
  let filteredRows = rawRows;
  if (q) {
    filteredRows = filteredRows.filter(r => r.email.toLowerCase().includes(q));
  }

  const byEmail = new Map<string, { email: string; last_seen_at: string | null; last_url: string | null; locations: Set<string> }>();
  for (const r of filteredRows) {
    const existing = byEmail.get(r.email);
    if (!existing) {
      byEmail.set(r.email, {
        email: r.email,
        last_seen_at: r.last_seen_at ?? null,
        last_url: r.last_url ?? null,
        locations: new Set([r.location_id]),
      });
      continue;
    }
    existing.locations.add(r.location_id);
    const prev = existing.last_seen_at ? new Date(existing.last_seen_at).getTime() : 0;
    const curr = r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0;
    if (curr > prev) {
      existing.last_seen_at = r.last_seen_at ?? null;
      existing.last_url = r.last_url ?? null;
    }
  }

  const emailLocations = new Map<string, string[]>();
  const aggregatedRows: EmailRow[] = Array.from(byEmail.values()).map((r) => {
    const locations = Array.from(r.locations);
    emailLocations.set(r.email, locations);
    return {
      email: r.email,
      last_seen_at: r.last_seen_at,
      last_url: r.last_url,
      locations,
    };
  });

  // 2) lifetime totals
  const emails = Array.from(new Set(aggregatedRows.map(r => r.email)));
  const locations = Array.from(new Set(filteredRows.map(r => r.location_id)));

  const locationNameMap = new Map<string, string>();
  if (locations.length) {
    const { data: locationRows } = await supabaseAdmin
      .from("ghl_locations")
      .select("location_id, profile")
      .in("location_id", locations);
    for (const row of locationRows || []) {
      const id = String(row.location_id || "");
      if (!id) continue;
      locationNameMap.set(id, pickLocationName(row.profile, id));
    }
  }

  const { data: lifetime, error: e2 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("email, location_id, time_sec")
    .in("email", emails.length ? emails : ["__none__"])
    .in("location_id", locations.length ? locations : ["__none__"]);

  if (e2) {
    return (
      <main className="min-h-screen bg-black text-white p-10 flex items-center justify-center">
         <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-xl max-w-lg">
           <pre className="text-red-300">{e2.message}</pre>
        </div>
      </main>
    );
  }

  const totals = new Map<string, number>();
  for (const r of lifetime || []) {
    totals.set(r.email, (totals.get(r.email) || 0) + Number(r.time_sec || 0));
  }
  // 3) Health + Risk (First N)
  const ENRICH_LIMIT = 60;
  const toEnrich = aggregatedRows.slice(0, ENRICH_LIMIT);

  const healthMap = new Map<string, { score: number | null; status: string; color: string | undefined; trend: string | undefined; login_days_capped: number; login_pct: number }>();
  const riskMap = new Map<string, string[]>();

  await Promise.all(
    toEnrich.map(async (u) => {
      const locs = emailLocations.get(u.email) || [];
      const [healthList, riskList] = await Promise.all([
        Promise.all(
          locs.map(async (loc) => {
            const { data: health } = await supabaseAdmin.rpc("gocroco_user_health_v2", {
              target_email: u.email,
              target_location_id: loc,
              ref_day: null,
            });
            return health;
          })
        ),
        Promise.all(
          locs.map(async (loc) => {
            const { data: risk } = await supabaseAdmin.rpc("gocroco_user_risk_drivers", {
              target_email: u.email,
              target_location_id: loc,
              ref_day: null,
            });
            return risk;
          })
        ),
      ]);

      const scores = healthList
        .map((h) => (typeof h?.health_score === "number" ? Number(h.health_score) : null))
        .filter((n): n is number => typeof n === "number");
      const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      const worstHealth =
        healthList
          .filter((h) => typeof h?.health_score === "number")
          .sort((a, b) => Number(a.health_score) - Number(b.health_score))[0] || null;
      const status = String(worstHealth?.status || "Unknown");
      const loginDaysMax = Math.max(0, ...healthList.map((h) => Number(h?.login?.days7 || 0)));
      const loginDaysCapped = Math.min(5, loginDaysMax);

      const riskTagSet = new Set<string>();
      for (const risk of riskList) {
        for (const tag of riskTags(risk)) riskTagSet.add(tag);
      }

      healthMap.set(u.email, {
        score: avgScore,
        status,
        color: worstHealth?.color,
        trend: worstHealth?.trend?.indicator,
        login_days_capped: loginDaysCapped,
        login_pct: Math.round((loginDaysCapped / 5) * 100),
      });
      riskMap.set(u.email, Array.from(riskTagSet).slice(0, 2));
    })
  );
  // 4) Prepare View Data (Merge, Filter, Sort)
  const viewRows: ViewRow[] = aggregatedRows.map((u) => {
    const total = totals.get(u.email) || 0;
    const health = healthMap.get(u.email);
    const risk = riskMap.get(u.email) || [];
    
    return {
      ...u,
      total_sec: total,
      health_score: typeof health?.score === "number" ? Math.round(health.score) : null,
      health_status: health?.status || "Unknown",
      health_color: health?.color,
      trend: health?.trend,
      risk_tags: risk,
      login_days_capped: health?.login_days_capped ?? 0,
      login_pct: health?.login_pct ?? 0,
    };
  });

  // Filter
  const filtered = viewRows.filter((r) => {
    if (healthFilter && r.health_status.toLowerCase() !== healthFilter) return false;
    return true;
  });

  // Sort
  const sorted = filtered.sort((a, b) => {
    if (sort === "health") return (b.health_score ?? -999) - (a.health_score ?? -999);
    if (sort === "lifetime") return b.total_sec - a.total_sec;
    // Default: last_seen
    const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
    const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
    return tb - ta;
  });

  // --- RENDER ---

  const locationLabel = location_id ? (locationNameMap.get(location_id) || location_id) : "";

  return (
    <main className="min-h-screen bg-black text-zinc-400 font-sans p-6 md:p-10 selection:bg-zinc-800">
      <div className="max-w-[1600px] mx-auto space-y-8">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Users</h1>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
               {location_id ? (
                 <>
                   <span>Filtering by location:</span>
                   <span className="bg-white/5 px-2 py-0.5 rounded text-zinc-300 font-mono border border-white/5">{locationLabel}</span>
                 </>
               ) : (
                 <span>All locations</span>
               )}
               <span className="text-zinc-700">•</span>
               <span>Enriched health for top <b className="text-zinc-300">{ENRICH_LIMIT}</b></span>
            </div>
          </div>
          
          {location_id && (
            <a
              href={`/locations/${encodeURIComponent(location_id)}`}
              className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold text-zinc-900 bg-white hover:bg-zinc-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)]"
            >
              View Location Dashboard →
            </a>
          )}
        </header>

        {/* TOOLBAR */}
        <form className="flex flex-col lg:flex-row items-center gap-4 bg-zinc-900/20 p-2 rounded-xl border border-white/5 backdrop-blur-sm">
           {/* Preserve location_id in search params if present */}
           {location_id && <input type="hidden" name="location_id" value={location_id} />}
           
           <SearchInput name="q" defaultValue={q} placeholder="Search users by email..." />
           
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
                <option value="last_seen">Sort by Last Seen</option>
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
                href={location_id ? `/users?location_id=${encodeURIComponent(location_id)}` : "/users"}
                className="h-10 px-4 inline-flex items-center justify-center rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
              >
                Reset
              </a>
           </div>
        </form>

        {/* TABLE */}
        <div className="bg-zinc-900/40 border border-white/5 rounded-xl overflow-hidden backdrop-blur-sm shadow-xl shadow-black/20">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-6 py-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider w-1/4">User / Locations</th>
                  <th className="px-6 py-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider w-40">Health Status</th>
                  <th className="px-6 py-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider w-40">Last Seen</th>
                  <th className="px-6 py-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider w-48">Login Activity (7d)</th>
                  <th className="px-6 py-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider w-32">Lifetime</th>
                  <th className="px-6 py-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Risk Factors</th>
                  <th className="px-6 py-4 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sorted.map((u) => {
                  const key = `${u.email}`;
                  const isEnriched = u.health_score !== null;
                  const badge = healthColor(u.health_color);

                  return (
                    <tr key={key} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col max-w-[280px]">
                          <a 
                             href={location_id ? `/users/${encodeURIComponent(u.email)}?location_id=${encodeURIComponent(location_id)}` : `/users/${encodeURIComponent(u.email)}`}
                             className="text-sm font-bold text-zinc-200 truncate hover:text-white transition-colors"
                          >
                            {u.email}
                          </a>
                                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                             <span className="text-xs text-zinc-500">in</span>
                             {u.locations[0] && (
                               <a 
                                 href={`/locations/${encodeURIComponent(u.locations[0])}`}
                                 className="text-xs font-mono text-zinc-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/5 hover:border-white/20 transition-colors"
                               >
                                 {locationNameMap.get(u.locations[0]) || u.locations[0]}
                               </a>
                             )}
                             {u.locations.length > 1 && (
                               <span className="text-xs text-zinc-500">+{u.locations.length - 1}</span>
                             )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        {isEnriched ? (
                           <div className="flex flex-col gap-1.5 items-start">
                              <span 
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border shadow-sm backdrop-blur-sm"
                                style={{
                                    backgroundColor: badge.bg || "rgba(255,255,255,0.05)",
                                    color: badge.fg || "#fff",
                                    borderColor: badge.bg ? "transparent" : "rgba(255,255,255,0.1)",
                                }}
                              >
                                 <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: badge.fg, boxShadow: `0 0 6px ${badge.fg}40` }} />
                                 {u.health_score} • {u.health_status}
                                 {u.trend && <span className="opacity-80 ml-0.5">{trendIcon(u.trend)}</span>}
                              </span>
                           </div>
                        ) : (
                           <span className="text-[10px] text-zinc-600 font-mono italic">Waiting for data...</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="text-sm text-zinc-400 font-medium">
                           {u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString(undefined, {month:'short', day:'numeric'}) : "—"}
                        </div>
                        <div className="text-xs text-zinc-600 mt-0.5 font-mono truncate max-w-[140px]" title={u.last_url || ""}>
                           {u.last_url ? u.last_url.replace(/^https?:\/\//, '') : "—"}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                         <div className="flex flex-col gap-2">
                             <div className="flex justify-between items-baseline text-xs max-w-[120px]">
                                 <span className="font-semibold text-zinc-300">{u.login_days_capped}<span className="text-zinc-600 font-normal">/5 days</span></span>
                             </div>
                             <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden w-full max-w-[120px]">
                                <div 
                                  style={{ width: `${u.login_pct}%` }} 
                                  className="h-full bg-emerald-500 rounded-full opacity-80 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                                />
                             </div>
                         </div>
                      </td>

                      <td className="px-6 py-4">
                         <span className="text-sm font-mono text-zinc-300 font-medium">{fmtSec(u.total_sec)}</span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                           {u.risk_tags.length > 0 ? (
                             u.risk_tags.map((t: string) => (
                               <span 
                                 key={t} 
                                 className="px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900/50 text-[10px] text-zinc-400 font-medium whitespace-nowrap"
                               >
                                 {t}
                               </span>
                             ))
                           ) : (
                             <span className="text-zinc-700 text-xs">—</span>
                           )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                         <a
                            href={location_id ? `/users/${encodeURIComponent(u.email)}?location_id=${encodeURIComponent(location_id)}` : `/users/${encodeURIComponent(u.email)}`}
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
                       No users found matching current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center text-xs text-zinc-600 px-2 pb-10 gap-2">
           <div>Showing {sorted.length} users</div>
           <div>Sorted by <span className="text-zinc-400 font-medium">{sort}</span></div>
        </div>

      </div>
    </main>
  );
}





