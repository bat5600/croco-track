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
  return FEATURES.find(f => f.key === key)?.label ?? key;
}

function toDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

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

  if (!location_id) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 28 }}>{email}</h1>
        <p style={{ opacity: 0.8 }}>
          Il manque <code>?location_id=...</code> dans l’URL.
        </p>
        <a href="/users">← Back</a>
      </main>
    );
  }

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

  const max = Math.max(1, ...series.map(s => s.sec));

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <a
        href={`/users?location_id=${encodeURIComponent(location_id)}`}
        style={{ display: "inline-block", marginBottom: 16 }}
      >
        ← Back
      </a>

      <h1 style={{ fontSize: 28 }}>{email}</h1>
      <div style={{ opacity: 0.8, marginBottom: 10 }}>
        Location: <b>{location_id}</b>
      </div>

      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        Last seen:{" "}
        <b>{lastSeen?.last_seen_at ? new Date(lastSeen.last_seen_at).toLocaleString() : "—"}</b>
        {" • "}
        Lifetime: <b>{fmtSec(totalLifetime)}</b>
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 10 }}>Last 14 days</h2>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 60, marginBottom: 20 }}>
        {series.map(p => (
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

      <h2 style={{ fontSize: 18, marginBottom: 10 }}>Top features</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {(lifetime || []).map(f => (
          <div
            key={f.feature_key}
            style={{
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontWeight: 800 }}>{labelForFeature(f.feature_key)}</div>
              <div style={{ opacity: 0.7 }}>
                last used: {f.last_seen_at ? new Date(f.last_seen_at).toLocaleString() : "—"}
              </div>
            </div>
            <div style={{ fontWeight: 900 }}>{fmtSec(Number(f.time_sec || 0))}</div>
          </div>
        ))}
      </div>
    </main>
  );
}