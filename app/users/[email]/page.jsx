import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function rangeToDays(range) {
  const m = String(range || "7d").match(/^(\d+)\s*d$/i);
  return m ? Number(m[1]) : 7;
}

function fmtSec(sec) {
  const n = Number(sec || 0);
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const r = n % 60;
  return `${m}m ${r}s`;
}

export default async function UserPage({ params, searchParams }) {
  const sp = await searchParams;
  const range = sp?.range || "7d";
  const range_days = rangeToDays(range);

  // params.email est encodé dans l'URL
  const p = await params;
  const email = decodeURIComponent(p.email);

    const { data, error } = await supabaseAdmin.rpc("gocroco_user_detail", {
    target_email: email,
    range_days,
    });


  if (error) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>User</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error.message}</pre>
      </main>
    );
  }

  const user = data?.user || {};
  const events = data?.events || [];

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <a href={`/users?range=${encodeURIComponent(range)}`} style={{ display: "inline-block", marginBottom: 16 }}>
        ← Back
      </a>

      <h1 style={{ fontSize: 28, marginBottom: 8 }}>{email}</h1>

      <div style={{ opacity: 0.75, marginBottom: 16 }}>
        Last seen: {user.last_seen_at ? new Date(user.last_seen_at).toLocaleString() : "—"} •{" "}
        Logins: {user.logins || 0} •{" "}
        Time: {fmtSec(user.time_sec || 0)} •{" "}
        Views: {user.page_views || 0} •{" "}
        Features: {user.features_used || 0}
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 10 }}>Timeline (last 200)</h2>

      <div style={{ display: "grid", gap: 10 }}>
        {events.map((e, idx) => (
          <div key={idx} style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 10 }}>
            <div style={{ fontWeight: 700 }}>
              {e.type} {e.feature_key ? `• ${e.feature_key}` : ""}
            </div>
            <div style={{ opacity: 0.75, marginTop: 4 }}>
              {e.ts ? new Date(e.ts).toLocaleString() : "—"}
              {typeof e.duration_sec === "number" ? ` • ${e.duration_sec}s` : ""}
            </div>
            <div style={{ marginTop: 6, wordBreak: "break-word" }}>{e.url}</div>
          </div>
        ))}
      </div>
    </main>
  );
}

