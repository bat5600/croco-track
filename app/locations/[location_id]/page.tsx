import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FEATURES } from "@/lib/features";
import { fmtSec, healthColor, trendIcon, riskTags } from "@/lib/ui";

// --- Helpers ---
function labelForFeature(key: string) {
  return FEATURES.find((x) => x.key === key)?.label ?? key;
}

function toDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

// --- CONSTANTS DE STYLE (Linear Theme) ---
const THEME = {
  bg: "#000000",
  textMain: "#e4e4e7", // zinc-200
  textMuted: "#71717a", // zinc-500
  textDark: "#3f3f46", // zinc-700
  border: "rgba(255, 255, 255, 0.08)",
  cardBg: "rgba(24, 24, 27, 0.4)", // zinc-900 with opacity
  cardHover: "rgba(39, 39, 42, 0.5)",
  accent: "#10b981", // emerald-500
  fontSans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontMono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

// Styles objets réutilisables
const S = {
  page: {
    minHeight: "100vh",
    backgroundColor: THEME.bg,
    color: THEME.textMuted,
    fontFamily: THEME.fontSans,
    padding: "40px",
    boxSizing: "border-box" as const,
  },
  container: {
    maxWidth: "1280px",
    margin: "0 auto",
  },
  card: {
    backgroundColor: THEME.cardBg,
    border: `1px solid ${THEME.border}`,
    borderRadius: "12px",
    padding: "20px",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  },
  sectionTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    letterSpacing: "-0.01em",
    margin: 0,
  },
  sectionSubtitle: {
    fontSize: "12px",
    color: THEME.textMuted,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 500,
    border: "1px solid rgba(255,255,255,0.1)",
  },
  linkReset: {
    textDecoration: "none",
    color: "inherit",
  },
};

// --- COMPOSANTS UI ---

const StatusBadge = ({ label, colorObj, icon }: { label: string | number; colorObj?: any; icon?: any }) => (
  <span
    style={{
      ...S.badge,
      backgroundColor: colorObj?.bg || "rgba(255,255,255,0.05)",
      color: colorObj?.fg || "#fff",
      borderColor: colorObj?.bg ? "transparent" : "rgba(255,255,255,0.1)",
    }}
  >
    {icon && <span>{icon}</span>}
    {label}
  </span>
);

const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
    <h3 style={S.sectionTitle}>{title}</h3>
    {subtitle && <span style={S.sectionSubtitle}>{subtitle}</span>}
  </div>
);

const MetricMini = ({ label, value }: { label: string; value: any }) => (
  <div style={{ 
    display: "flex", 
    alignItems: "center", 
    gap: "6px", 
    background: "#18181b", 
    border: `1px solid ${THEME.border}`, 
    padding: "4px 8px", 
    borderRadius: "6px",
    fontSize: "11px"
  }}>
    <span style={{ color: THEME.textMuted }}>{label}</span>
    <span style={{ color: THEME.textMain, fontWeight: 600 }}>{value ?? "—"}</span>
  </div>
);

// CSS Grid responsive injecté
const responsiveCSS = `
  .linear-grid { display: grid; grid-template-columns: 1fr; gap: 24px; }
  .col-main { grid-column: span 1; }
  .col-side { grid-column: span 1; }
  .header-flex { display: flex; flex-direction: column; gap: 24px; }
  
  @media (min-width: 768px) {
    .linear-grid { grid-template-columns: repeat(12, 1fr); }
    .col-main { grid-column: span 8; }
    .col-side { grid-column: span 4; }
    .header-flex { flex-direction: row; align-items: center; justify-content: space-between; }
  }
  
  /* Scrollbar clean */
  .custom-scroll::-webkit-scrollbar { width: 6px; }
  .custom-scroll::-webkit-scrollbar-track { background: transparent; }
  .custom-scroll::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
  .custom-scroll::-webkit-scrollbar-thumb:hover { background: #52525b; }

  /* Table styles */
  .table-row { transition: background 0.2s; }
  .table-row:hover { background: rgba(255,255,255,0.03); }
`;

export default async function LocationPage({ params }: { params: Promise<{ location_id: string }> }) {
  const p = await params;
  const location_id = decodeURIComponent(p.location_id);

  // --- DATA FETCHING ---
  
  // 0) Health
  const { data: health } = await supabaseAdmin.rpc("gocroco_location_health_v2", {
    target_location_id: location_id,
    ref_day: null,
  });
  const badge = healthColor(health?.color);
  const score = typeof health?.health_score === "number" ? Math.round(health.health_score) : null;
  const status = health?.status ?? "—";
  const trend = health?.trend?.indicator;
  const loginScore = typeof health?.components?.login_activity_score === "number"
    ? Math.round(health.components.login_activity_score)
    : null;

  // A) Top features (location lifetime)
  const { data: lifetimeRows, error: e1 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("feature_key, time_sec")
    .eq("location_id", location_id);

  if (e1) return <ErrorState msg={e1.message} id={location_id} />;

  const featureTotals = new Map<string, number>();
  for (const r of lifetimeRows || []) {
    featureTotals.set(r.feature_key, (featureTotals.get(r.feature_key) || 0) + Number(r.time_sec || 0));
  }

  const topFeatures = Array.from(featureTotals.entries())
    .map(([feature_key, time_sec]) => ({ feature_key, time_sec }))
    .sort((a, b) => b.time_sec - a.time_sec)
    .slice(0, 5);

  const totalLifetime = Array.from(featureTotals.values()).reduce((a, b) => a + b, 0);
  const featureTimeByKey = new Map<string, number>();
  for (const r of lifetimeRows || []) {
    featureTimeByKey.set(r.feature_key, Number(r.time_sec || 0));
  }
  const ADOPTED_THRESHOLD_SEC = 3600;

  // B) Users list
  const { data: usersSeen, error: e2 } = await supabaseAdmin
    .from("user_last_seen")
    .select("email, last_seen_at, last_url")
    .eq("location_id", location_id)
    .order("last_seen_at", { ascending: false })
    .limit(250);

  if (e2) return <ErrorState msg={e2.message} id={location_id} />;

  const users = usersSeen || [];
  const emails = Array.from(new Set(users.map((u) => u.email)));

  // total lifetime per user
  const { data: lifetimeByUserRows, error: e3 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("email, time_sec")
    .eq("location_id", location_id)
    .in("email", emails.length ? emails : ["__none__"]);

  if (e3) return <ErrorState msg={e3.message} id={location_id} />;

  const userTotals = new Map<string, number>();
  for (const r of lifetimeByUserRows || []) {
    userTotals.set(r.email, (userTotals.get(r.email) || 0) + Number(r.time_sec || 0));
  }

  // C) Sparkline
  const since14 = new Date();
  since14.setDate(since14.getDate() - 13);

  const { data: dailyRows, error: e4 } = await supabaseAdmin
    .from("feature_daily")
    .select("day, time_sec")
    .eq("location_id", location_id)
    .gte("day", toDay(since14));

  if (e4) return <ErrorState msg={e4.message} id={location_id} />;

  const dayMap = new Map<string, number>();
  for (const r of dailyRows || []) {
    const k = String(r.day);
    dayMap.set(k, (dayMap.get(k) || 0) + Number(r.time_sec || 0));
  }

  const series: { day: string; sec: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(since14);
    d.setDate(since14.getDate() + i);
    const k = toDay(d);
    series.push({ day: k, sec: dayMap.get(k) || 0 });
  }

  const max = Math.max(1, ...series.map((s) => s.sec));

  // D) Top at-risk (enriched)
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
    .slice(0, 5);

  // --- RENDER ---
  return (
    <main style={S.page}>
      <style dangerouslySetInnerHTML={{ __html: responsiveCSS }} />
      
      <div style={S.container}>
        {/* HEADER */}
        <header className="header-flex" style={{ borderBottom: `1px solid ${THEME.border}`, paddingBottom: "32px", marginBottom: "32px" }}>
          <div>
            <nav style={{ fontSize: "12px", color: THEME.textMuted, marginBottom: "12px", display: "flex", gap: "8px" }}>
              <a href="/locations" style={{ ...S.linkReset, color: THEME.textMuted }}>Locations</a>
              <span>/</span>
              <span style={{ color: THEME.textMain }}>{location_id}</span>
            </nav>
            <h1 style={{ fontSize: "32px", fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>{location_id}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "12px", fontSize: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: THEME.accent, boxShadow: `0 0 8px ${THEME.accent}40` }}></span>
                <span style={{ color: THEME.textMain, fontWeight: 500 }}>{users.length} Active Users</span>
              </div>
              <span style={{ color: THEME.textDark }}>•</span>
              <div style={{ color: THEME.textMuted }}>
                Lifetime: <span style={{ color: THEME.textMain, fontFamily: THEME.fontMono }}>{fmtSec(totalLifetime)}</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
             <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                   <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: THEME.textMuted, fontWeight: 600 }}>Health Score</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", justifyContent: "flex-end" }}>
                         <span style={{ fontSize: "28px", fontWeight: 700, color: "#fff", lineHeight: 1 }}>{score === null ? "—" : score}</span>
                         <span style={{ fontSize: "14px", fontWeight: 500, color: badge.fg }}>{status}</span>
                      </div>
                   </div>
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                   <MetricMini label="Login" value={loginScore} />
                   <MetricMini label="Adoption" value={health?.components?.product_adoption_score} />
                   <MetricMini label="Feedback" value={health?.components?.feedback_score} />
                </div>
             </div>
             
             <a
              href={`/users?location_id=${encodeURIComponent(location_id)}`}
              style={{
                ...S.linkReset,
                padding: "8px 16px",
                backgroundColor: "#fff",
                color: "#000",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "8px",
                marginLeft: "16px",
                display: "inline-block"
              }}
            >
              View Users →
            </a>
          </div>
        </header>

        {/* BENTO GRID */}
        <div className="linear-grid">
          
          {/* COL 1 (Activity) */}
          <div className="col-main" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            {/* SPARKLINE */}
            <div style={{ ...S.card, minHeight: "200px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <SectionHeader title="Activity Trend" subtitle="Last 14 Days" />
              <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "120px", width: "100%", paddingTop: "16px" }}>
                {series.map((p) => {
                  const heightPct = Math.max(5, Math.round((p.sec / max) * 100));
                  return (
                    <div key={p.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", height: "100%", justifyContent: "flex-end" }} title={`${p.day}: ${fmtSec(p.sec)}`}>
                      <div 
                        style={{ 
                          width: "100%", 
                          height: `${heightPct}%`, 
                          background: p.sec ? "#3f3f46" : "#27272a", 
                          borderRadius: "2px",
                          transition: "all 0.3s ease",
                          opacity: p.sec ? 1 : 0.3
                        }} 
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AT RISK USERS TABLE */}
            <div style={S.card}>
              <SectionHeader 
                title="Attention Required" 
                subtitle={<span style={{ color: "#fb923c", fontWeight: 500 }}>{topAtRisk.length} Users At Risk</span>} 
              />
              
              {topAtRisk.length === 0 ? (
                 <div style={{ fontSize: "13px", color: THEME.textMuted, fontStyle: "italic", padding: "16px 0" }}>No users currently flagged as at-risk.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${THEME.border}` }}>
                        <th style={{ padding: "0 0 12px 0", color: THEME.textMuted, fontWeight: 500, fontSize: "11px", textTransform: "uppercase" }}>User</th>
                        <th style={{ padding: "0 0 12px 0", color: THEME.textMuted, fontWeight: 500, fontSize: "11px", textTransform: "uppercase", textAlign: "right" }}>Health</th>
                        <th style={{ padding: "0 0 12px 16px", color: THEME.textMuted, fontWeight: 500, fontSize: "11px", textTransform: "uppercase" }}>Primary Risk Factors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topAtRisk.map((u) => {
                         const uScore = Math.round(u.health?.health_score || 0);
                         const uTrend = u.health?.trend?.indicator;
                         const tags = riskTags(u.risk).slice(0, 2);
                        return (
                          <tr key={u.email} className="table-row" style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                            <td style={{ padding: "12px 16px 12px 0" }}>
                              <a href={`/users/${encodeURIComponent(u.email)}?location_id=${encodeURIComponent(location_id)}`} style={S.linkReset}>
                                <div style={{ color: THEME.textMain, fontWeight: 500 }}>{u.email}</div>
                                <div style={{ fontSize: "11px", color: THEME.textMuted, marginTop: "2px" }}>{u.last_url || "No activity"}</div>
                              </a>
                            </td>
                            <td style={{ padding: "12px 0", textAlign: "right" }}>
                               <StatusBadge 
                                 label={uScore} 
                                 colorObj={healthColor(u.health?.color)} 
                                 icon={trendIcon(uTrend)} 
                               />
                            </td>
                            <td style={{ padding: "12px 0 12px 16px" }}>
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                {tags.map(t => (
                                  <span key={t} style={{ 
                                    fontSize: "10px", 
                                    padding: "2px 6px", 
                                    borderRadius: "4px", 
                                    border: `1px solid ${THEME.border}`, 
                                    color: THEME.textMuted,
                                    background: "rgba(255,255,255,0.02)"
                                  }}>
                                    {t}
                                  </span>
                                ))}
                                {tags.length === 0 && <span style={{ color: THEME.textDark }}>—</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* COL 2 (Sidebar) */}
          <div className="col-side" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            {/* Top Features */}
            <div style={S.card}>
              <SectionHeader title="Top Features" subtitle="Lifetime" />
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {topFeatures.map((f, i) => (
                  <div key={f.feature_key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", overflow: "hidden" }}>
                      <span style={{ fontSize: "11px", fontFamily: THEME.fontMono, color: THEME.textDark, width: "16px" }}>{i + 1}</span>
                      <span style={{ fontSize: "13px", fontWeight: 500, color: THEME.textMain, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {labelForFeature(f.feature_key)}
                      </span>
                    </div>
                    <span style={{ fontSize: "11px", fontFamily: THEME.fontMono, color: THEME.textMuted, background: "rgba(255,255,255,0.03)", padding: "2px 6px", borderRadius: "4px" }}>
                      {fmtSec(f.time_sec)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* All Features (Adoption) */}
            <div style={S.card}>
              <SectionHeader title="All Features" subtitle="Adoption" />
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {FEATURES.map((f) => {
                  const used = featureTimeByKey.get(f.key) || 0;
                  const adopted = used >= ADOPTED_THRESHOLD_SEC;
                  return (
                    <div
                      key={f.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: `1px solid ${THEME.border}`,
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input type="checkbox" checked={adopted} readOnly />
                        <span style={{ fontSize: "13px", color: THEME.textMain }}>{f.label}</span>
                      </label>
                      <span style={{ fontSize: "11px", color: THEME.textMuted }}>
                        {adopted ? "Adopted" : "Not adopted"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Users List */}
            <div style={{ ...S.card, maxHeight: "500px", display: "flex", flexDirection: "column" }}>
              <div style={{ flexShrink: 0 }}>
                <SectionHeader title="Recent Users" subtitle={users.length} />
              </div>
              <div className="custom-scroll" style={{ overflowY: "auto", paddingRight: "8px", marginRight: "-8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                 {users.map((u) => {
                    const total = userTotals.get(u.email) || 0;
                    return (
                      <a 
                        key={u.email}
                        href={`/users/${encodeURIComponent(u.email)}?location_id=${encodeURIComponent(location_id)}`}
                        className="table-row"
                        style={{ ...S.linkReset, display: "block", padding: "8px", borderRadius: "8px" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ fontSize: "13px", fontWeight: 500, color: THEME.textMain, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "150px" }}>{u.email}</div>
                          <div style={{ fontSize: "10px", color: THEME.textMuted }}>
                             {u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString(undefined, {month:'short', day:'numeric'}) : "—"}
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                          <div style={{ fontSize: "11px", color: THEME.textDark, maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.last_url ?? "—"}</div>
                          <div style={{ fontSize: "11px", fontFamily: THEME.fontMono, color: THEME.textMuted }}>{fmtSec(total)}</div>
                        </div>
                      </a>
                    )
                 })}
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}

// --- Error Helper ---
function ErrorState({ msg, id }: { msg: string; id: string }) {
  return (
    <main style={{ ...S.page, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "16px" }}>Error loading {id}</h1>
      <pre style={{ background: "rgba(127, 29, 29, 0.2)", color: "#fecaca", padding: "16px", borderRadius: "8px", border: "1px solid rgba(127, 29, 29, 0.4)" }}>{msg}</pre>
    </main>
  );
}
