import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FEATURES } from "@/lib/features";
import { fmtSec, healthColor, trendIcon, cardStyle, pageShell } from "@/lib/ui";

function labelForFeature(key: string) {
  return FEATURES.find((f) => f.key === key)?.label ?? key;
}

function toDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function UserPage({
  params,
  searchParams,
}: {
  params: { email: string };
  searchParams?: { location_id?: string; location?: string };
}) {
  const decodedEmail = decodeURIComponent(params.email);
  const location_id = searchParams?.location_id || searchParams?.location || "";

  if (!location_id) {
    return (
      <main style={pageShell()}>
        <h1 style={{ fontSize: 28 }}>{decodedEmail}</h1>
        <p style={{ opacity: 0.8 }}>
          Il manque <code>?location_id=...</code> dans l’URL.
        </p>
        <a href="/users">← Back</a>
      </main>
    );
  }

  // 1) last seen
  const { data: lastSeen, error: e1 } = await supabaseAdmin
    .from("user_last_seen")
    .select("email, location_id, last_seen_at, last_url")
    .eq("email", decodedEmail)
    .eq("location_id", location_id)
    .maybeSingle();

  if (e1) {
    return (
      <main style={pageShell()}>
        <h1 style={{ fontSize: 28 }}>{decodedEmail}</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{e1.message}</pre>
      </main>
    );
  }

  // 2) health + risk
  const [{ data: health }, { data: risk }] = await Promise.all([
    supabaseAdmin.rpc("gocroco_user_health", {
      target_email: decodedEmail,
      target_location_id: location_id,
      ref_day: null,
    }),
    supabaseAdmin.rpc("gocroco_user_risk_drivers", {
      target_email: decodedEmail,
      target_location_id: location_id,
      ref_day: null,
    }),
  ]);

  // 3) top features lifetime
  const { data: lifetime, error: e2 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("feature_key, time_sec, last_seen_at")
    .eq("email", decodedEmail)
    .eq("location_id", location_id)
    .order("time_sec", { ascending: false })
    .limit(20);

  if (e2) {
    return (
      <main style={pageShell()}>
        <h1 style={{ fontSize: 28 }}>{decodedEmail}</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{e2.message}</pre>
      </main>
    );
  }

  const totalLifetime = (lifetime || []).reduce((acc, r) => acc + Number(r.time_sec || 0), 0);

  // 4) sparkline 14 jours (total time/jour)
  const since = new Date();
  since.setDate(since.getDate() - 13);

  const { data: daily, error: e3 } = await supabaseAdmin
    .from("feature_daily")
    .select("day, time_sec")
    .eq("email", decodedEmail)
    .eq("location_id", location_id)
    .gte("day", toDay(since));

  if (e3) {
    return (
      <main style={pageShell()}>
        <h1 style={{ fontSize: 28 }}>{decodedEmail}</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{e3.message}</pre>
      </main>
    );
  }

  const dayMap = new Map<string, number>();
  for (const r of daily || []) {
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

  const badge = healthColor(health?.color);
  const score = typeof health?.health_score === "number" ? Math.round(health.health_score) : null;
  const status = health?.status ?? "—";
  const trend = health?.trend?.indicator;

  const abandoned = Array.isArray(risk?.abandoned_features) ? risk.abandoned_features : [];

  return (
    <main style={pageShell()}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <a href={`/users?location_id=${encodeURIComponent(location_id)}`} style={{ textDecoration: "none", fontWeight: 900, color: "inherit" }}>
          ← Back
        </a>

        <a
          href={`/locations/${encodeURIComponent(location_id)}`}
          style={{
            textDecoration: "none",
            fontWeight: 900,
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "white",
            color: "inherit",
          }}
        >
          Location →
        </a>
      </div>

      <div style={{ marginTop: 14, ...cardStyle() }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 26, margin: 0 }}>{decodedEmail}</h1>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Location: <b>{location_id}</b>
            </div>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Last seen: <b>{lastSeen?.last_seen_at ? new Date(lastSeen.last_seen_at).toLocaleString() : "—"}</b>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <span
              style={{
                padding: "7px 12px",
                borderRadius: 999,
                background: badge.bg,
                color: badge.fg,
                fontWeight: 900,
                fontSize: 13,
              }}
            >
              {score === null ? "—" : score} • {status} • {trendIcon(trend)}
            </span>

            <div style={{ opacity: 0.8, fontWeight: 800 }}>
              Lifetime: {fmtSec(totalLifetime)}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, opacity: 0.75, wordBreak: "break-all" }}>
          Last URL: {lastSeen?.last_url || "—"}
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", opacity: 0.9 }}>
          <span style={{ fontWeight: 900 }}>Components:</span>
          <span>Login <b>{health?.components?.login_activity_score ?? "—"}</b></span>
          <span>Adoption <b>{health?.components?.product_adoption_score ?? "—"}</b></span>
          <span>Feedback <b>{health?.components?.feedback_score ?? "—"}</b></span>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" as any }}>
        <div style={cardStyle()}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Risk drivers</div>
          <div style={{ display: "grid", gap: 8, opacity: 0.95 }}>
            <div>• Activity drop: <b>{risk?.activity_drop ? "YES" : "no"}</b></div>
            <div>• Low adoption: <b>{risk?.adoption_stagnation ? "YES" : "no"}</b></div>
            <div>• Low engagement: <b>{risk?.engagement_weak ? "YES" : "no"}</b></div>
            <div>• Feature abandon: <b>{abandoned.length ? abandoned.join(", ") : "no"}</b></div>
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Last 14 days (total time)</div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 64 }}>
            {series.map((p) => (
              <div key={p.day} title={`${p.day} • ${fmtSec(p.sec)}`} style={{ width: 10, height: 64 }}>
                <div
                  style={{
                    height: Math.max(3, Math.round((p.sec / max) * 64)),
                    borderRadius: 8,
                    background: "#111827",
                    opacity: p.sec ? 1 : 0.15,
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
            Hint: survol pour voir les valeurs.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Top features (lifetime)</div>

        <div style={{ display: "grid", gap: 10 }}>
          {(lifetime || []).map((f) => (
            <div
              key={f.feature_key}
              style={{
                padding: 12,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                background: "white",
              }}
            >
              <div>
                <div style={{ fontWeight: 900 }}>{labelForFeature(f.feature_key)}</div>
                <div style={{ opacity: 0.75, marginTop: 4 }}>
                  last used: {f.last_seen_at ? new Date(f.last_seen_at).toLocaleString() : "—"}
                </div>
              </div>
              <div style={{ fontWeight: 900 }}>{fmtSec(Number(f.time_sec || 0))}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}