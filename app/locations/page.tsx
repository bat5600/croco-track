import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fmtSec, healthColor } from "@/lib/ui";
import SavedViews from "./saved-views";

// --- Types & Helpers ---

type Row = { location_id: string; last_seen_at: string | null; email: string | null };
type HealthRow = {
  location_id: string;
  health_score: number;
  login_score: number;
  features_score: number;
  trend_score: number;
  score_day: string;
  computed_at: string;
};

type ViewRow = {
  location_id: string;
  display_name: string;
  last_seen_at: string | null;
  total_sec: number;
  total_pct: number;
  login_days_7: number;
  login_activity_pct: number;
  health_score: number | null;
  health_status: string;
  health_pct: number;
  health_color: string | undefined;
  score_day: string | null;
  computed_at: string | null;
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

function scoreToStatus(score: number | null) {
  if (score === null) return "Not computed";
  if (score >= 80) return "Thriving";
  if (score >= 60) return "Healthy";
  if (score >= 45) return "Steady";
  return "At-risk";
}

function scoreToColor(score: number | null): string | undefined {
  if (score === null) return undefined;
  if (score >= 80) return "dark_green";
  if (score >= 60) return "light_green";
  if (score >= 45) return "yellow";
  return "red";
}

function buildPageUrl(params: URLSearchParams, offset: number) {
  const next = new URLSearchParams(params);
  next.set("offset", String(offset));
  const qs = next.toString();
  return `/locations${qs ? `?${qs}` : ""}`;
}

function buildFilterUrl(params: URLSearchParams, patch: Record<string, string | null>) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (!value) next.delete(key);
    else next.set(key, value);
  }
  next.delete("offset");
  const qs = next.toString();
  return `/locations${qs ? `?${qs}` : ""}`;
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
  const limit = Math.min(Math.max(Number(sp.limit || 50), 1), 200);
  const offset = Math.max(Number(sp.offset || 0), 0);
  const qRaw = String(sp.q || "");
  const q = qRaw.trim().toLowerCase();
  const riskOnly = String(sp.risk || "") === "1";
  const dropMin = Math.max(Number(sp.drop || 0), 0);
  const noLogin7d = String(sp.no_login_7d || "") === "1";
  const sortDir = (sp.sort === "asc" || sp.sort === "desc")
    ? sp.sort
    : (riskOnly ? "asc" : "desc");

  let dropLocationIds: string[] | null = null;
  if (dropMin > 0) {
    const { data: lastDays } = await supabaseAdmin
      .from("location_health_daily")
      .select("score_day")
      .order("score_day", { ascending: false })
      .limit(2);
    const latestDay = lastDays?.[0]?.score_day || null;
    const prevDay = lastDays?.[1]?.score_day || null;
    if (latestDay && prevDay) {
      const { data: deltaRows } = await supabaseAdmin
        .from("location_health_daily")
        .select("location_id, score_day, health_score")
        .in("score_day", [prevDay, latestDay]);
      const byLocation = new Map<string, { prev?: number; curr?: number }>();
      for (const row of deltaRows || []) {
        const id = String(row.location_id || "");
        if (!id) continue;
        if (!byLocation.has(id)) byLocation.set(id, {});
        const entry = byLocation.get(id)!;
        if (row.score_day === prevDay) entry.prev = Number(row.health_score || 0);
        if (row.score_day === latestDay) entry.curr = Number(row.health_score || 0);
      }
      dropLocationIds = [];
      for (const [id, entry] of byLocation.entries()) {
        if (typeof entry.prev === "number" && typeof entry.curr === "number") {
          if (entry.curr - entry.prev <= -dropMin) dropLocationIds.push(id);
        }
      }
    } else {
      dropLocationIds = [];
    }
  }
  const dropIdsForQuery = dropLocationIds
    ? (dropLocationIds.length ? dropLocationIds : ["__none__"])
    : null;

  // 1) load scored locations (paged) from location_health_latest
  let scoredCount = 0;
  {
    let countQuery = supabaseAdmin
      .from("location_health_latest")
      .select("location_id", { count: "exact", head: true });
    if (riskOnly) countQuery = countQuery.lt("health_score", 45);
    if (dropIdsForQuery) countQuery = countQuery.in("location_id", dropIdsForQuery);
    const { count, error: countError } = await countQuery;
    if (countError) {
      return (
        <main className="min-h-screen bg-black text-white p-10 flex items-center justify-center">
          <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-xl max-w-lg backdrop-blur-sm">
             <h1 className="text-xl font-bold text-red-400 mb-2">Error loading health scores</h1>
             <pre className="text-xs text-red-300/70 whitespace-pre-wrap font-mono">{countError.message}</pre>
          </div>
        </main>
      );
    }
    scoredCount = count || 0;
  }

  let pageQuery = supabaseAdmin
    .from("location_health_latest")
    .select("location_id, health_score, login_score, features_score, trend_score, score_day, computed_at")
    .order("health_score", { ascending: sortDir === "asc" })
    .order("location_id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (riskOnly) pageQuery = pageQuery.lt("health_score", 45);
  if (dropIdsForQuery) pageQuery = pageQuery.in("location_id", dropIdsForQuery);
  const { data: scoredRows, error: scoredError } = await pageQuery;

  if (scoredError) {
    return (
      <main className="min-h-screen bg-black text-white p-10 flex items-center justify-center">
        <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-xl max-w-lg backdrop-blur-sm">
           <h1 className="text-xl font-bold text-red-400 mb-2">Error loading health scores</h1>
           <pre className="text-xs text-red-300/70 whitespace-pre-wrap font-mono">{scoredError.message}</pre>
        </div>
      </main>
    );
  }

  const scored = (scoredRows || []) as HealthRow[];
  const scoredIds = scored.map((r) => r.location_id);
  const healthById = new Map(scored.map((r) => [r.location_id, r]));

  let missingIds: string[] = [];
  let missingCount: number | null = null;
  const needMissing = !riskOnly && dropMin === 0 && (offset + limit) > scoredCount;
  if (needMissing) {
    const { data: allLocations, error: allLocationsError } = await supabaseAdmin
      .from("ghl_locations")
      .select("location_id");
    if (allLocationsError) {
      return (
        <main className="min-h-screen bg-black text-white p-10 flex items-center justify-center">
          <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-xl max-w-lg backdrop-blur-sm">
             <h1 className="text-xl font-bold text-red-400 mb-2">Error loading locations</h1>
             <pre className="text-xs text-red-300/70 whitespace-pre-wrap font-mono">{allLocationsError.message}</pre>
          </div>
        </main>
      );
    }

    const { data: allHealthIds, error: allHealthError } = await supabaseAdmin
      .from("location_health_latest")
      .select("location_id");
    if (allHealthError) {
      return (
        <main className="min-h-screen bg-black text-white p-10 flex items-center justify-center">
          <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-xl max-w-lg backdrop-blur-sm">
             <h1 className="text-xl font-bold text-red-400 mb-2">Error loading health scores</h1>
             <pre className="text-xs text-red-300/70 whitespace-pre-wrap font-mono">{allHealthError.message}</pre>
          </div>
        </main>
      );
    }

    const healthIdSet = new Set((allHealthIds || []).map((r: { location_id: string }) => r.location_id));
    const allLocationIds = (allLocations || [])
      .map((r: { location_id: string }) => String(r.location_id || ""))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    missingIds = allLocationIds.filter((id) => !healthIdSet.has(id));
    missingCount = missingIds.length;
  }

  const remaining = Math.max(0, limit - scoredIds.length);
  let missingPage: string[] = [];
  if (remaining > 0 && !riskOnly) {
    const missingOffset = Math.max(0, offset - scoredCount);
    missingPage = missingIds.slice(missingOffset, missingOffset + remaining);
  }

  const pageLocationIds = [...scoredIds, ...missingPage];

  if (!pageLocationIds.length) {
    return (
      <main className="min-h-screen bg-black text-zinc-400 font-sans p-6 md:p-10 selection:bg-zinc-800">
        <div className="max-w-[1600px] mx-auto space-y-8">
          <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Locations</h1>
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                 <span className="bg-white/5 px-2 py-0.5 rounded text-zinc-300 font-mono">0</span>
                 <span>locations found</span>
              </div>
            </div>
          </header>
          <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-10 text-center text-zinc-500 italic">
            No locations match the current filters.
          </div>
        </div>
      </main>
    );
  }

  // 2) last seen + login activity (7d via gocroco_user_health_v2)
  const { data: lastSeenRows, error: lastSeenError } = await supabaseAdmin
    .from("user_last_seen")
    .select("location_id, last_seen_at, email")
    .in("location_id", pageLocationIds);

  if (lastSeenError) {
    return (
      <main className="min-h-screen bg-black text-white p-10 flex items-center justify-center">
        <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-xl max-w-lg backdrop-blur-sm">
           <h1 className="text-xl font-bold text-red-400 mb-2">Error loading last seen data</h1>
           <pre className="text-xs text-red-300/70 whitespace-pre-wrap font-mono">{lastSeenError.message}</pre>
        </div>
      </main>
    );
  }

  const lastSeenByLocation = new Map<string, Row>();
  const userEmailsByLocation = new Map<string, Set<string>>();
  for (const r of lastSeenRows || []) {
    const id = String(r.location_id || "");
    if (!id) continue;
    const prev = lastSeenByLocation.get(id);
    if (!prev) {
      lastSeenByLocation.set(id, {
        location_id: id,
        last_seen_at: r.last_seen_at ?? null,
        email: r.email ?? null,
      });
    }
    else {
      const a = prev.last_seen_at ? new Date(prev.last_seen_at).getTime() : 0;
      const b = r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0;
      if (b > a) prev.last_seen_at = r.last_seen_at ?? prev.last_seen_at;
    }

    const email = r.email ? String(r.email) : "";
    if (email) {
      if (!userEmailsByLocation.has(id)) userEmailsByLocation.set(id, new Set());
      userEmailsByLocation.get(id)?.add(email);
    }
  }

  const MAX_USERS_PER_LOCATION = 50;
  const loginDaysByLocation = new Map<string, number>();
  await Promise.all(
    pageLocationIds.map(async (locationId) => {
      const emails = Array.from(userEmailsByLocation.get(locationId) || []).slice(0, MAX_USERS_PER_LOCATION);
      if (!emails.length) {
        loginDaysByLocation.set(locationId, 0);
        return;
      }
      const healthList = await Promise.all(
        emails.map(async (email) => {
          const { data: health } = await supabaseAdmin.rpc("gocroco_user_health_v2", {
            target_email: email,
            target_location_id: locationId,
            ref_day: null,
          });
          return health;
        })
      );
      const maxDays = Math.max(0, ...healthList.map((h) => Number(h?.login?.days7 || 0)));
      loginDaysByLocation.set(locationId, maxDays);
    })
  );

  // 3) lifetime totals by location
  const ids = pageLocationIds;
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

  // 4) resolve display names from ghl_locations (fallback to id)
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

  const viewRows: ViewRow[] = pageLocationIds.map((locationId) => {
    const total = totals.get(locationId) || 0;
    const health = healthById.get(locationId);
    const score = typeof health?.health_score === "number" ? Math.round(health.health_score) : null;
    const status = scoreToStatus(score);
    const color = scoreToColor(score);
    const days7 = loginDaysByLocation.get(locationId) || 0;
    const loginDaysCapped = Math.min(5, days7);
    const loginPct = Math.round((loginDaysCapped / 5) * 100);
    const displayName = nameMap.get(locationId) || locationId;
    const lastSeen = lastSeenByLocation.get(locationId)?.last_seen_at ?? null;
    return {
      location_id: locationId,
      display_name: displayName,
      last_seen_at: lastSeen,
      total_sec: total,
      total_pct: toPct(total, maxTotal),
      login_days_7: days7,
      login_activity_pct: loginPct,
      health_score: score,
      health_status: status,
      health_pct: score === null ? 0 : Math.max(0, Math.min(100, score)),
      health_color: color,
      score_day: health?.score_day ?? null,
      computed_at: health?.computed_at ?? null,
    };
  });

  const filtered = viewRows.filter((r) => {
    if (q && !r.location_id.toLowerCase().includes(q) && !r.display_name.toLowerCase().includes(q)) return false;
    if (noLogin7d) {
      if (!r.last_seen_at) return true;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      if (new Date(r.last_seen_at).getTime() >= cutoff.getTime()) return false;
    }
    return true;
  });

  const params = new URLSearchParams();
  if (qRaw) params.set("q", qRaw);
  if (riskOnly) params.set("risk", "1");
  if (sortDir) params.set("sort", sortDir);
  if (limit !== 50) params.set("limit", String(limit));
  if (dropMin > 0) params.set("drop", String(dropMin));
  if (noLogin7d) params.set("no_login_7d", "1");

  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const totalKnown = riskOnly ? scoredCount : (missingCount !== null ? scoredCount + missingCount : null);
  const hasPrev = offset > 0;
  const hasNext = totalKnown === null ? filtered.length === limit : nextOffset < totalKnown;

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
               <span className="bg-white/5 px-2 py-0.5 rounded text-zinc-300 font-mono">{filtered.length}</span>
               <span>locations on this page</span>
               <span className="text-zinc-700">ƒ?›</span>
               <span>Scores from <b className="text-zinc-300">location_health_latest</b></span>
            </div>
          </div>
        </header>

        {/* --- TOOLBAR --- */}
        <form className="flex flex-col lg:flex-row items-center gap-4 bg-zinc-900/20 p-2 rounded-xl border border-white/5 backdrop-blur-sm">
           <SearchInput name="q" defaultValue={sp.q || ""} placeholder="Search locations..." />
           
           <div className="flex gap-3 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
             <Select name="sort" defaultValue={sortDir}>
                <option value="desc">Best health first</option>
                <option value="asc">Worst health first</option>
             </Select>

             <Select name="risk" defaultValue={riskOnly ? "1" : ""}>
                <option value="">All locations</option>
                <option value="1">Risk only (score &lt; 45)</option>
             </Select>
             <Select name="drop" defaultValue={dropMin ? String(dropMin) : ""}>
                <option value="">No drop filter</option>
                <option value="10">Drop &gt; 10</option>
                <option value="15">Drop &gt; 15</option>
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

        <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <a
              href={buildFilterUrl(params, { risk: "1" })}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                riskOnly ? "border-red-400/40 bg-red-500/10 text-red-200" : "border-white/10 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              At-risk
            </a>
            <a
              href={buildFilterUrl(params, { drop: "10" })}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                dropMin >= 10 ? "border-amber-400/40 bg-amber-500/10 text-amber-200" : "border-white/10 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Drop &gt; 10
            </a>
            <a
              href={buildFilterUrl(params, { no_login_7d: "1" })}
              className={`px-3 py-1 rounded-full text-xs border transition ${
                noLogin7d ? "border-sky-400/40 bg-sky-500/10 text-sky-200" : "border-white/10 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              No login 7d
            </a>
            <a
              href={buildFilterUrl(params, { risk: null, drop: null, no_login_7d: null })}
              className="px-3 py-1 rounded-full text-xs border border-white/10 text-zinc-400 hover:text-zinc-200 transition"
            >
              Clear filters
            </a>
          </div>
          <SavedViews />
        </div>

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
                {filtered.map((l) => {
                  const badge = healthColor(l.health_color);
                  const healthLabel = l.health_score === null
                    ? "Not computed"
                    : `${l.health_status} ${l.health_score}%`;
                  const scoreDayLabel = l.score_day ? new Date(l.score_day).toLocaleDateString() : "n/a";
                  const computedAtLabel = l.computed_at ? new Date(l.computed_at).toLocaleString() : "n/a";
                  
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
                            View users <span className="text-[10px]">ƒ+'</span>
                          </a>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="text-sm text-zinc-400 font-medium">
                           {l.last_seen_at ? new Date(l.last_seen_at).toLocaleDateString(undefined, {month:'short', day:'numeric'}) : "n/a"}
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
                                title={`score_day: ${scoreDayLabel}\ncomputed_at: ${computedAtLabel}`}
                                style={{
                                    backgroundColor: badge.bg || "rgba(255,255,255,0.05)",
                                    color: badge.fg || "#fff",
                                    borderColor: badge.bg ? "transparent" : "rgba(255,255,255,0.1)",
                                }}
                              >
                                 <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: badge.fg, boxShadow: `0 0 6px ${badge.fg}40` }} />
                                 {healthLabel}
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
                
                {filtered.length === 0 && (
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
           <div>Showing {filtered.length} locations (offset {offset}, limit {limit})</div>
           <div className="flex items-center gap-3">
             {hasPrev ? (
               <a
                 href={buildPageUrl(params, prevOffset)}
                 className="px-3 py-1 rounded border border-white/10 text-zinc-400 hover:text-white hover:border-white/30 transition-colors"
               >
                 Prev
               </a>
             ) : (
               <span className="px-3 py-1 rounded border border-white/5 text-zinc-600">Prev</span>
             )}
             {hasNext ? (
               <a
                 href={buildPageUrl(params, nextOffset)}
                 className="px-3 py-1 rounded border border-white/10 text-zinc-400 hover:text-white hover:border-white/30 transition-colors"
               >
                 Next
               </a>
             ) : (
               <span className="px-3 py-1 rounded border border-white/5 text-zinc-600">Next</span>
             )}
             <span>Sorted by <span className="text-zinc-400 font-medium">health_score {sortDir}</span></span>
           </div>
        </div>
        
      </div>
    </main>
  );
}
