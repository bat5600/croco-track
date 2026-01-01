import { supabaseAdmin } from "@/lib/supabaseAdmin";

type EventRow = {
  id: string;
  email: string;
  url: string;
  ts: string;
};

export default async function Home() {
  const { data, error } = await supabaseAdmin
    .from("events")
    .select("id,email,url,ts")
    .order("ts", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui" }}>
        <h1>GoCroco — Events</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error.message}</pre>
      </main>
    );
  }

  const rows = (data || []) as EventRow[];

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>GoCroco — Events 2</h1>
      <p>Derniers events trackés</p>

      {rows.length === 0 ? (
        <p style={{ marginTop: 16, opacity: 0.7 }}>Aucun event pour l’instant.</p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {rows.map((e) => (
            <div key={e.id} style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 12 }}>
              <div><b>{e.email}</b></div>
              <div style={{ wordBreak: "break-all" }}>{e.url}</div>
              <div style={{ opacity: 0.7, marginTop: 6 }}>{new Date(e.ts).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
