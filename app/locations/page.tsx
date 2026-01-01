import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fmtSec, healthColor, trendIcon, cardStyle, pageShell } from "@/lib/ui";

type Row = { location_id: string; last_seen_at: string | null };

export default async function LocationsPage({ searchParams }: { searchParams?: any }) {
  const limit = Math.min(Number(searchParams?.limit || 1000), 3000);

  // 1) discover locations from user_last_seen
  const { data: rows, error } = await supabaseAdmin
    .from("user_last_seen")
    .select("location_id, last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (error) {
    return (
      <main style={pageShell()}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Locations</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error.message}</pre>
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

  const locations = Array.from(agg.values()).sort((a, b) => {
    const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
    const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
    return tb - ta;
  });

  // 2) lifetime totals by location
  const ids = locations.map((x) => x.location_id);
  const { data: lifetimeRows, error: e2 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("location_id, time_sec")
    .in("location_id", ids.length ? ids : ["__none__"]);

  if (e2) {
    return (
      <main style={pageShell()}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Locations</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{e2.message}</pre>
      </main>
    );
  }

  const totals = new Map<string, number>();
  for (const r of lifetimeRows || []) {
    const id = String(r.location_id || "");
    if (!id) continue;
    totals.set(id, (totals.get(id) || 0) + Number(r.time_sec || 0));
  }

  // 3) health enrichment (first N locations)
  const ENRICH_LIMIT = 40;
  const healthMap = new Map<string, any>();

  await Promise.all(
    locations.slice(0, ENRICH_LIMIT).map(async (l) => {
      const { data } = await supabaseAdmin.rpc("gocroco_location_health", {
        target_location_id: l.location_id,
        ref_day: null,
      });
      healthMap.set(l.location_id, data);
    })
  );

  return (
    <main style={pageShell()}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 6 }}>Locations</h1>
          <div style={{ opacity: 0.75 }}>
            Enriched health: first <b>{ENRICH_LIMIT}</b> locations • Total: <b>{locations.length}</b>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {locations.map((l) => {
          const total = totals.get(l.location_id) || 0;

          const health = healthMap.get(l.location_id);
          const score = typeof health?.health_score === "number" ? Math.round(health.health_score) : null;
          const status = health?.status ?? null;
          const trend = health?.trend?.indicator;
          const badge = healthColor(health?.color);

          return (
            <a
              key={l.location_id}
              href={`/locations/${encodeURIComponent(l.location_id)}`}
              style={{ ...cardStyle(), display: "block", textDecoration: "none", color: "inherit" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>{l.location_id}</div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  {score !== null ? (
                    <span
                      style={{
                        padding: "5px 10px",
                        borderRadius: 999,
                        background: badge.bg,
                        color: badge.fg,
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      {score} • {status} • {trendIcon(trend)}
                    </span>
                  ) : (
                    <span style={{ opacity: 0.6, fontWeight: 800, fontSize: 12 }}>
                      Health: loading… (enriched only first {ENRICH_LIMIT})
                    </span>
                  )}

                  <span style={{ opacity: 0.7, fontWeight: 700 }}>
                    {l.last_seen_at ? new Date(l.last_seen_at).toLocaleString() : "—"}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", opacity: 0.85 }}>
                <span>
                  Lifetime time: <b>{fmtSec(total)}</b>
                </span>
                <span style={{ opacity: 0.75 }}>
                  Open users →{" "}
                  <span style={{ fontWeight: 800 }}>
                    /users?location_id={l.location_id}
                  </span>
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </main>
  );
}}
