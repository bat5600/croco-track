export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

function fmtSec(sec) {
  const n = Number(sec || 0);
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const r = n % 60;
  return `${m}m ${r}s`;
}

function rangeToDays(range) {
  // "7d" -> 7, "30d" -> 30
  const m = String(range || "7d").match(/^(\d+)\s*d$/i);
  return m ? Number(m[1]) : 7;
}

export default async function UsersPage({ searchParams }) {
  const sp = await searchParams;
  const range = sp?.range || "7d";
  const range_days = rangeToDays(range);

  const { data, error } = await supabaseAdmin.rpc("gocroco_users_agg", {
    range_days,
  });

  if (error) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1 style={{ fontSize: 28, marginBottom: 16 }}>Users</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error.message}</pre>
      </main>
    );
  }

  const users = data || [];

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Users</h1>

      <div style={{ display: "grid", gap: 12 }}>
        {users.map((u) => (
          <a
            key={u.email}
            href={`/users/${encodeURIComponent(u.email)}?range=${encodeURIComponent(range)}`}
            style={{
              display: "block",
              padding: 16,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ fontWeight: 700 }}>{u.email}</div>
            <div style={{ opacity: 0.75, marginTop: 6 }}>
              Last seen: {u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : "—"}
            </div>

            <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
              <span>
                Logins: <b>{u.logins}</b>
              </span>
              <span>
                Time: <b>{fmtSec(u.time_sec)}</b>
              </span>
              <span>
                Views: <b>{u.page_views}</b>
              </span>
              <span>
                Features: <b>{u.features_used}</b>
              </span>
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}

