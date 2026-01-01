import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FEATURES } from "@/lib/features";

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
  return FEATURES.find((x) => x.key === key)?.label ?? key;
}

function toDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function LocationPage({
  params,
}: {
  params: Promise<{ location_id: string }>;
}) {
  const p = await params;
  const location_id = decodeURIComponent(p.location_id);

  // A) Top features lifetime (location)
  const { data: lifetimeRows, error: e1 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("feature_key, time_sec")
    .eq("location_id", location_id);

  if (e1) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Location {location_id}</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{e1.message}</pre>
      </main>
    );
  }

  const featureTotals = new Map<string, number>();
  for (const r of lifetimeRows || []) {
    featureTotals.set(r.feature_key, (featureTotals.get(r.feature_key) || 0) + Number(r.time_sec || 0));
  }

  const topFeatures = Array.from(featureTotals.entries())
    .map(([feature_key, time_sec]) => ({ feature_key, time_sec }))
    .sort((a, b) => b.time_sec - a.time_sec)
    .slice(0, 12);

  const totalLifetime = Array.from(featureTotals.values()).reduce((a, b) => a + b, 0);

  // B) Users list (last seen) for this location
  const { data: usersSeen, error: e2 } = await supabaseAdmin
    .from("user_last_seen")
    .select("email, last_seen_at, last_url")
    .eq("location_id", location_id)
    .order("last_seen_at", { ascending: false })
    .limit(200);

  if (e2) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Location {location_id}</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{e2.message}</pre>
      </main>
    );
  }

  const emails = Array.from(new Set((usersSeen || []).map((u) => u.email)));

  // total lifetime par user (dans cette location)
  const { data: lifetimeByUserRows, error: e3 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("email, time_sec")
    .eq("location_id", location_id)
    .in("email", emails.length ? emails : ["__none__"]);

  if (e3) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Location {location_id}</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{e3.message}</pre>
      </main>
    );
  }

  const userTotals = new Map<string, number>();
  for (const r of lifetimeByUserRows || []) {
    userTotals.set(r.email, (userTotals.get(r.email) || 0) + Number(r.time_sec || 0));
  }

  // C) Sparkline 14 jours (temps total/jour pour la location)
  const since = new Date();
  since.setDate(since.getDate() - 13);

  const { data: dailyRows, error: e4 } = await supabaseAdmin
    .from("feature_daily")
    .select("day, time_sec")
    .eq("location_id", location_id)
    .gte("day", toDay(since));

  if (e4) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Location {location_id}</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{e4.message}</pre>
      </main>
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

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <a href="/locations" style={{ display: "inline-block", marginBottom: 16 }}>
        ← Back
      </a>

      <h1 style={{ fontSize: 28, marginBottom: 6 }}>Location</h1>
      <div style={{ opacity: 0.8, marginBottom: 10 }}>
        <b>{location_id}</b>
      </div>

      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        Lifetime time: <b>{fmtSec(totalLifetime)}</b> • Users: <b>{(usersSeen || []).length}</b>
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 10 }}>Last 14 days (total time)</h2>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 60, marginBottom: 18 }}>
        {series.map((p) => (
          <div key={p.day} title={`${p.day} • ${fmtSec(p.sec)}`} style={{ width: 10, height: 60 }}>
            <div
              style={{
                height: Math.max(2, Math.round((p.sec / max) * 60)),
                borderRadius: 6,
                background: "black",
                opacity: p.sec ? 1 : 0.15,
              }}
            />
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 10 }}>Top features (lifetime)</h2>
      <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
        {topFeatures.map((f) => (
          <div
            key={f.feature_key}
            style={{
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 800 }}>{labelForFeature(f.feature_key)}</div>
            <div style={{ fontWeight: 900 }}>{fmtSec(f.time_sec)}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 10 }}>Users (last seen)</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {(usersSeen || []).map((u) => {
          const total = userTotals.get(u.email) || 0;
          return (
            <a
              key={u.email}
              href={`/users/${encodeURIComponent(u.email)}?location=${encodeURIComponent(location_id)}`}
              style={{
                display: "block",
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800 }}>{u.email}</div>
                <div style={{ opacity: 0.75 }}>
                  {u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : "—"}
                </div>
              </div>

              <div style={{ opacity: 0.8, marginTop: 6 }}>
                Lifetime: <b>{fmtSec(total)}</b>
              </div>

              <div style={{ opacity: 0.7, marginTop: 6, wordBreak: "break-all" }}>
                {u.last_url || "—"}
              </div>
            </a>
          );
        })}
      </div>
    </main>
  );
}
