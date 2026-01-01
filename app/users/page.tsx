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

export default async function UsersPage() {
  // 1) last seen (base de la liste)
  const { data: lastSeen, error: e1 } = await supabaseAdmin
    .from("user_last_seen")
    .select("email, location_id, last_seen_at, last_url")
    .order("last_seen_at", { ascending: false })
    .limit(200);

  if (e1) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Users</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{e1.message}</pre>
      </main>
    );
  }

  const rows = lastSeen || [];
  const emails = Array.from(new Set(rows.map(r => r.email)));
  const locations = Array.from(new Set(rows.map(r => r.location_id)));

  // 2) total lifetime par (email, location)
  const { data: lifetime, error: e2 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("email, location_id, time_sec")
    .in("email", emails)
    .in("location_id", locations);

  if (e2) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>Users</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{e2.message}</pre>
      </main>
    );
  }

  const totals = new Map<string, number>();
  for (const r of lifetime || []) {
    const k = `${r.email}|${r.location_id}`;
    totals.set(k, (totals.get(k) || 0) + Number(r.time_sec || 0));
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Users</h1>

      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((u) => {
          const key = `${u.email}|${u.location_id}`;
          const total = totals.get(key) || 0;

          return (
            <a
              key={key}
              href={`/users/${encodeURIComponent(u.email)}?location=${encodeURIComponent(u.location_id)}`}
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
                <div style={{ opacity: 0.75 }}>
                  {u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : "—"}
                </div>
              </div>

              <div style={{ opacity: 0.75, marginTop: 6 }}>
                Location: <b>{u.location_id}</b>
              </div>

              <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
                <span>
                  Lifetime time: <b>{fmtSec(total)}</b>
                </span>
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
}
