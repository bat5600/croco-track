import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FEATURES } from "@/lib/features";
import { fmtSec, healthColor, trendIcon, riskTags, cardStyle, pageShell } from "@/lib/ui";

function labelForFeature(key: string) {
  return FEATURES.find((x) => x.key === key)?.label ?? key;
}

function toDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function LocationPage({ params }: { params: { location_id: string } }) {
  const location_id = decodeURIComponent(params.location_id);

  // 0) location health
  const { data: health } = await supabaseAdmin.rpc("gocroco_location_health", {
    target_location_id: location_id,
    ref_day: null,
  });

  const badge = healthColor(health?.color);
  const score = typeof health?.health_score === "number" ? Math.round(health.health_score) : null;
  const status = health?.status ?? "—";
  const trend = health?.trend?.indicator;

  // A) Top features lifetime (location)
  const { data: lifetimeRows, error: e1 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("feature_key, time_sec")
    .eq("location_id", location_id);

  if (e1) {
    return (
      <main style={pageShell()}>
        <h1 style={{ fontSize: 28 }}>Location {location_id}</h1>
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
    .slice(0, 10);

  const totalLifetime = Array.from(featureTotals.values()).reduce((a, b) => a + b, 0);

  // B) Users list (last seen) for this location
  const { data: usersSeen, error: e2 } = await supabaseAdmin
    .from("user_last_seen")
    .select("email, last_seen_at, last_url")
    .eq("location_id", location_id)
    .order("last_seen_at", { ascending: false })
    .limit(250);

  if (e2) {
    return (
      <main style={pageShell()}>
        <h1 style={{ fontSize: 28 }}>Location {location_id}</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{e2.message}</pre>
      </main>
    );
  }

  const users = usersSeen || [];
  const emails = Array.from(new Set(users.map((u) => u.email)));

  // total lifetime par user (dans cette location)
  const { data: lifetimeByUserRows, error: e3 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("email, time_sec")
    .eq("location_id", location_id)
    .in("email", emails.length ? emails : ["__none__"]);

  if (e3) {
    return (
      <main style={pageShell()}>
        <h1 style={{ fontSize: 28 }}>Location {location_id}</h1>
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
      <main style={pageShell()}>
        <h1 style={{ fontSize: 28 }}>Location {location_id}</h1>
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

  // D) Top at-risk users (enrich first N)
  const ENRICH_USERS = 40;
  const enriched = await Promise.all(
    users.slice(0, ENRICH_USERS).map(async (u) => {
      const [{ data: uh }, { data: ur }] = await Promise.all([
        supabaseAdmin.rpc("gocroco_user_health", {
          target_email: u.email,
          target_location_id: location_id,
          ref_day: null,
        }),
        supabaseAdmin.rpc("gocroco_user_risk_drivers", {
          target_email: u.email,
          target_location_id: location_id,
          ref_day: null,
        }),
      ]);

      return { ...u, health: uh, risk: ur, lifetime: userTotals.get(u.email) || 0 };
    })
  );

  const topAtRisk = enriched
    .slice()
    .filter((x) => typeof x.health?.health_score === "number")
    .sort((a, b) => (a.health.health_score ?? 999) - (b.health.health_score ?? 999))
    .slice(0, 8);

  return (
    <main style={pageShell()}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <a href="/locations" style={{ textDecoration: "none", fontWeight: 900, color: "inherit" }}>
          ← Back
        </a>

        <a
          href={`/users?location_id=${encodeURIComponent(location_id)}`}
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
          View users →
        </a>
      </div>

      {/* Header card */}
      <div style={{ marginTop: 14, ...cardStyle() }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 26, margin: 0 }}>Location</h1>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              <b>{location_id}</b>
            </div>
            <div style={{ opacity: 0.8, marginTop: 8 }}>
              Lifetime time: <b>{fmtSec(totalLifetime)}</b> • Users: <b>{users.length}</b>
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

            <div style={{ opacity: 0.85, fontWeight: 800 }}>
              Login <b>{health?.components?.login_activity_score ?? "—"}</b> • Adoption{" "}
              <b>{health?.components?.product_adoption_score ?? "—"}</b> • Feedback{" "}
              <b>{health?.components?.feedback_score ?? "—"}</b>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: sparkline + top features */}
      <div style={{ marginTop: 14, display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" as any }}>
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
          <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>Survol pour voir les valeurs.</div>
        </div>

        <div style={cardStyle()}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Top features (lifetime)</div>
          <div style={{ display: "grid", gap: 10 }}>
            {topFeatures.map((f) => (
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
                <div style={{ fontWeight: 900 }}>{labelForFeature(f.feature_key)}</div>
                <div style={{ fontWeight: 900 }}>{fmtSec(f.time_sec)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top at-risk */}
      <div style={{ marginTop: 14, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>
          Top at-risk users <span style={{ opacity: 0.7, fontWeight: 700 }}>(enriched first {ENRICH_USERS})</span>
        </div>

        {topAtRisk.length === 0 ? (
          <div style={{ opacity: 0.75 }}>Not enough data yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {topAtRisk.map((u) => {
              const ub = healthColor(u.health?.color);
              const uscore = Math.round(u.health?.health_score || 0);
              const utrend = u.health?.trend?.indicator;
              const tags = riskTags(u.risk).slice(0, 2);

              return (
                <a
                  key={u.email}
                  href={`/users/${encodeURIComponent(u.email)}?location_id=${encodeURIComponent(location_id)}`}
                  style={{
                    display: "block",
                    padding: 12,
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    textDecoration: "none",
                    color: "inherit",
                    background: "white",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>{u.email}</div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        style={{
                          padding: "5px 10px",
                          borderRadius: 999,
                          background: ub.bg,
                          color: ub.fg,
                          fontWeight: 900,
                          fontSize: 12,
                        }}
                      >
                        {uscore} • {u.health?.status} • {trendIcon(utrend)}
                      </span>

                      <span style={{ opacity: 0.75, fontWeight: 800 }}>
                        Lifetime: {fmtSec(u.lifetime)}
                      </span>
                    </div>
                  </div>

                  {tags.length > 0 && (
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      {tags.map((t: string) => (
                        <span
                          key={t}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 999,
                            padding: "3px 10px",
                            fontSize: 12,
                            opacity: 0.95,
                            fontWeight: 800,
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ opacity: 0.7, marginTop: 10, wordBreak: "break-all", fontSize: 12 }}>
                    {u.last_url || "—"}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Users list */}
      <div style={{ marginTop: 14, ...cardStyle() }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Users (last seen)</div>

        <div style={{ display: "grid", gap: 10 }}>
          {users.map((u) => {
            const total = userTotals.get(u.email) || 0;
            return (
              <a
                key={u.email}
                href={`/users/${encodeURIComponent(u.email)}?location_id=${encodeURIComponent(location_id)}`}
                style={{
                  display: "block",
                  padding: 12,
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  textDecoration: "none",
                  color: "inherit",
                  background: "white",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900 }}>{u.email}</div>
                  <div style={{ opacity: 0.75, fontWeight: 800 }}>
                    {u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : "—"}
                  </div>
                </div>

                <div style={{ opacity: 0.85, marginTop: 8 }}>
                  Lifetime: <b>{fmtSec(total)}</b>
                </div>

                <div style={{ opacity: 0.7, marginTop: 6, wordBreak: "break-all", fontSize: 12 }}>
                  {u.last_url || "—"}
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </main>
  );
}          );
        })}
      </div>
    </main>
  );
}
