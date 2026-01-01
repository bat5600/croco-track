export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fmtSec, healthColor, trendIcon, riskTags, cardStyle, pageShell } from "@/lib/ui";

type LastSeenRow = {
  email: string;
  location_id: string;
  last_seen_at: string | null;
  last_url: string | null;
};

export default async function UsersPage({ searchParams }: { searchParams?: any }) {
  const sp = searchParams || {};
  const location_id = sp.location_id || sp.location || ""; // rétrocompat si tu veux
  const limit = Math.min(Number(sp.limit || 200), 500);

  // 1) last seen
  const { data: lastSeen, error: e1 } = await supabaseAdmin
    .from("user_last_seen")
    .select("email, location_id, last_seen_at, last_url")
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (e1) {
    return (
      <main style={pageShell()}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Users</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{e1.message}</pre>
      </main>
    );
  }

  const rows = (lastSeen || []) as LastSeenRow[];

  // Si tu veux “filtrer par location”, on le fait proprement :
  const filtered = location_id ? rows.filter(r => r.location_id === location_id) : rows;

  // 2) lifetime totals pour les couples (email, location)
  const emails = Array.from(new Set(filtered.map(r => r.email)));
  const locations = Array.from(new Set(filtered.map(r => r.location_id)));

  const { data: lifetime, error: e2 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("email, location_id, time_sec")
    .in("email", emails)
    .in("location_id", locations);

  if (e2) {
    return (
      <main style={pageShell()}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Users</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{e2.message}</pre>
      </main>
    );
  }

  const totals = new Map<string, number>();
  for (const r of lifetime || []) {
    const k = `${r.email}|${r.location_id}`;
    totals.set(k, (totals.get(k) || 0) + Number(r.time_sec || 0));
  }

  // 3) Health + Risk (V1: on enrichit les 60 premiers pour éviter les tempêtes)
  const ENRICH_LIMIT = 60;
  const toEnrich = filtered.slice(0, ENRICH_LIMIT);

  const healthMap = new Map<string, any>();
  const riskMap = new Map<string, any>();

  await Promise.all(
    toEnrich.map(async (u) => {
      const key = `${u.email}|${u.location_id}`;

      const [{ data: health }, { data: risk }] = await Promise.all([
        supabaseAdmin.rpc("gocroco_user_health", {
          target_email: u.email,
          target_location_id: u.location_id,
          ref_day: null,
        }),
        supabaseAdmin.rpc("gocroco_user_risk_drivers", {
          target_email: u.email,
          target_location_id: u.location_id,
          ref_day: null,
        }),
      ]);

      healthMap.set(key, health);
      riskMap.set(key, risk);
    })
  );

  return (
    <main style={pageShell()}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 6 }}>Users</h1>
          <div style={{ opacity: 0.75 }}>
            {location_id ? (
              <>Filtered location: <b>{location_id}</b></>
            ) : (
              <>All locations (add <code>?location_id=...</code> to filter)</>
            )}
          </div>
        </div>

        {location_id && (
          <a
            href={`/locations/${encodeURIComponent(location_id)}`}
            style={{
              alignSelf: "center",
              textDecoration: "none",
              fontWeight: 800,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "white",
              color: "inherit",
            }}
          >
            View location dashboard →
          </a>
        )}
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {filtered.map((u) => {
          const key = `${u.email}|${u.location_id}`;
          const total = totals.get(key) || 0;

          const health = healthMap.get(key);
          const risk = riskMap.get(key);

          const score = health?.health_score;
          const status = health?.status;
          const trend = health?.trend?.indicator;
          const badge = healthColor(health?.color);
          const tags = riskTags(risk).slice(0, 2);

          return (
            <a
              key={key}
              href={`/users/${encodeURIComponent(u.email)}?location_id=${encodeURIComponent(u.location_id)}`}
              style={{ ...cardStyle(), display: "block", textDecoration: "none", color: "inherit" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>{u.email}</div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  {typeof score === "number" ? (
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
                      {Math.round(score)} • {status} • {trendIcon(trend)}
                    </span>
                  ) : (
                    <span style={{ opacity: 0.6, fontWeight: 800, fontSize: 12 }}>
                      Health: loading… (enriched only first {ENRICH_LIMIT})
                    </span>
                  )}

                  <span style={{ opacity: 0.7, fontWeight: 700 }}>
                    {u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : "—"}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", opacity: 0.85 }}>
                <span>
                  Location: <b>{u.location_id}</b>
                </span>
                <span>
                  Lifetime: <b>{fmtSec(total)}</b>
                </span>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {tags.length > 0 && tags.map((t: string) => (
                  <span
                    key={t}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 999,
                      padding: "3px 10px",
                      fontSize: 12,
                      background: "white",
                      opacity: 0.95,
                      fontWeight: 700,
                    }}
                  >
                    {t}
                  </span>
                ))}

                <span style={{ opacity: 0.7, fontSize: 12, wordBreak: "break-all" }}>
                  Last URL: {u.last_url || "—"}
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </main>
  );
}
