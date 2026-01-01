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

function trendIcon(indicator: string) {
  if (indicator === "UP") return "↑";
  if (indicator === "DOWN") return "↓";
  return "→";
}

function badgeColor(color: string) {
  switch (color) {
    case "dark_green": return "#065f46";
    case "light_green": return "#15803d";
    case "yellow": return "#a16207";
    case "red": return "#b91c1c";
    default: return "#374151";
  }
}

function riskTags(u: any) {
  const tags: string[] = [];
  if (u.risk_activity_drop) tags.push("Activity drop");
  if (u.risk_adoption_stagnation) tags.push("Low adoption");
  if (u.risk_engagement_weak) tags.push("Low engagement");
  if ((u.risk_abandoned_count || 0) > 0) tags.push(`Abandon x${u.risk_abandoned_count}`);
  return tags.slice(0, 2);
}

export default async function UsersPage({ searchParams }: { searchParams?: any }) {
  const location_id = searchParams?.location_id || "0XeqHZvwfH59pwE9Y5ZY"; // mets ton default si tu veux
  const lim = Number(searchParams?.limit || 200) || 200;

  const { data, error } = await supabaseAdmin.rpc("gocroco_users_list_enriched", {
    target_location_id: location_id,
    lim,
    ref_day: null,
  });

  if (error) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Users</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error.message}</pre>
      </main>
    );
  }

  const rows = data || [];

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>Users</h1>
      <div style={{ opacity: 0.75, marginBottom: 16 }}>
        Location: <b>{location_id}</b>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((u: any) => {
          const badge = badgeColor(u.color);

          return (
            <a
              key={`${u.email}|${u.location_id}`}
              href={`/users/${encodeURIComponent(u.email)}?location_id=${encodeURIComponent(u.location_id)}`}
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
                <div style={{ fontWeight: 800 }}>{u.email}</div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: badge,
                      color: "white",
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    {Math.round(u.health_score)} • {u.status}
                  </span>
                  <span style={{ fontWeight: 900 }}>{trendIcon(u.trend_indicator)}</span>
                  <span style={{ opacity: 0.75 }}>
                    {u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : "—"}
                  </span>
                </div>
              </div>

              <div style={{ opacity: 0.75, marginTop: 6 }}>
                Location: <b>{u.location_id}</b>
              </div>

              <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span>
                  Lifetime time: <b>{fmtSec(u.lifetime_time_sec)}</b>
                </span>

                {riskTags(u).length > 0 && (
                  <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {riskTags(u).map((t) => (
                      <span
                        key={t}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 999,
                          padding: "3px 10px",
                          fontSize: 12,
                          opacity: 0.9,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </span>
                )}

                <span style={{ opacity: 0.8, wordBreak: "break-all" }}>
                  Last URL: {u.last_url || "—"}
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </main>
  );
}}
