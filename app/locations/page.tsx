import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

export default async function LocationsPage() {
  // On part de user_last_seen pour découvrir les locations existantes
  const { data: rows, error } = await supabaseAdmin
    .from("user_last_seen")
    .select("location_id, last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(1000);

  if (error) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Locations</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error.message}</pre>
      </main>
    );
  }

  // Aggregate : last_seen max par location
  const agg = new Map<string, { location_id: string; last_seen_at: string | null }>();
  for (const r of rows || []) {
    const id = String(r.location_id || "");
    if (!id) continue;
    const prev = agg.get(id);
    if (!prev) {
      agg.set(id, { location_id: id, last_seen_at: r.last_seen_at ?? null });
    } else {
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

  // Option : lifetime total par location (somme user_feature_lifetime)
  const ids = locations.map((x) => x.location_id);
  const { data: lifetimeRows, error: e2 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("location_id, time_sec")
    .in("location_id", ids.length ? ids : ["__none__"]);

  if (e2) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Locations</h1>
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

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Locations</h1>

      <div style={{ display: "grid", gap: 12 }}>
        {locations.map((l) => {
          const total = totals.get(l.location_id) || 0;
          return (
            <a
              key={l.location_id}
              href={`/locations/${encodeURIComponent(l.location_id)}`}
              style={{
                display: "block",
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800 }}>{l.location_id}</div>
                <div style={{ opacity: 0.75 }}>
                  {l.last_seen_at ? new Date(l.last_seen_at).toLocaleString() : "—"}
                </div>
              </div>

              <div style={{ opacity: 0.8, marginTop: 8 }}>
                Lifetime time: <b>{fmtSec(total)}</b>
              </div>
            </a>
          );
        })}
      </div>
    </main>
  );
}
