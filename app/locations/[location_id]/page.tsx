import "server-only";
export const dynamic = "force-dynamic";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FEATURES } from "@/lib/features";
import {
  getAggregatedFeatureKey,
  getDisplayFeatures,
  getFeatureLabel,
} from "@/lib/featureAggregation";
import { fmtSec, healthColor, trendIcon, riskTags } from "@/lib/ui";
import {
  displayScore,
  FEATURES_SCORE_MAX,
  loginDaysFromScore,
  normalizeScore,
  NO_DATA_LABEL,
  pctFromScore,
  scoreToColor,
  scoreToStatus,
} from "@/lib/health";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import SyncLocationForm from "./SyncLocationForm";
import FeatureUsageUserSelect from "./FeatureUsageUserSelect";

// --- Helpers ---
function labelForFeature(key: string) {
  return getFeatureLabel(key, FEATURES);
}

function toDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

function pickLocationName(profile: any, fallback: string) {
  if (!profile) return fallback;
  return (
    profile.name ||
    profile?.location?.name ||
    profile?.business?.name ||
    profile?.companyName ||
    fallback
  );
}

function formatSubscription(subscription: any) {
  if (!subscription) return null;
  const data = subscription?.data || subscription;
  const planDetails = data?.plan || subscription?.plan;
  const prices = Array.isArray(planDetails?.prices) ? planDetails.prices : [];
  const activeMonthly =
    prices.find((p: any) => p?.billingInterval === "month" && p?.active) ||
    prices.find((p: any) => p?.billingInterval === "month") ||
    prices.find((p: any) => p?.active) ||
    prices[0];
  const plan =
    planDetails?.title ||
    planDetails?.name ||
    planDetails?.id ||
    data.planName ||
    data?.plan?.name ||
    data?.plan?.id ||
    data?.planId ||
    data?.saasPlanId ||
    data?.productId ||
    data?.priceId;
  const status = data.status || data?.subscriptionStatus;
  const mrr =
    data.mrr ||
    data?.mrrAmount ||
    data?.amount ||
    planDetails?.mrr ||
    planDetails?.amount ||
    planDetails?.price ||
    planDetails?.price?.amount ||
    planDetails?.price?.unitAmount ||
    planDetails?.price?.value ||
    activeMonthly?.amount;
  return {
    plan,
    status,
    mrr,
    mrrCurrency: activeMonthly?.currency || planDetails?.currency || null,
    mrrSymbol: activeMonthly?.symbol || null,
    mrrInterval: activeMonthly?.billingInterval || null,
  };
}

function formatMoney(
  amount: number | string | null | undefined,
  symbol?: string | null,
  currency?: string | null
) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  const normalized = value >= 100 ? value / 100 : value;
  const currencyCode = currency ? String(currency).toUpperCase() : null;
  if (currencyCode === "EUR") return `EUR ${normalized}`;
  if (symbol) return `${symbol}${normalized}`;
  if (currencyCode) return `${normalized} ${currencyCode}`;
  return String(normalized);
}

// --- COMPOSANTS UI ---

const StatusBadge = ({
  label,
  colorObj,
  icon,
}: {
  label: string | number;
  colorObj?: any;
  icon?: any;
}) => (
  <span
    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs font-medium"
    style={{
      backgroundColor: colorObj?.bg || "rgba(255,255,255,0.05)",
      color: colorObj?.fg || "#fff",
      borderColor: colorObj?.bg ? "transparent" : "rgba(255,255,255,0.1)",
    }}
  >
    {icon && <span>{icon}</span>}
    {label}
  </span>
);

const SectionHeader = ({
  title,
  subtitle,
  rightElement,
}: {
  title: string;
  subtitle?: React.ReactNode;
  rightElement?: React.ReactNode;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
    <div>
      <h3 className="text-sm font-semibold text-white tracking-tight">{title}</h3>
      {subtitle && <div className="text-xs text-zinc-500">{subtitle}</div>}
    </div>
    {rightElement}
  </div>
);

const MetricMini = ({
  label,
  value,
  type = "text",
  max,
  suffix = "",
}: {
  label: string;
  value: any;
  type?: "text" | "bar";
  max?: number;
  suffix?: string;
}) => {
  const isNumeric = typeof value === "number" && Number.isFinite(value);
  const numeric = isNumeric ? normalizeScore(value) : null;
  const displayValue = isNumeric ? displayScore(numeric, suffix) : value ?? NO_DATA_LABEL;
  const barPct = max && isNumeric ? pctFromScore(numeric, max) : 0;

  return (
    <div className="flex min-w-[80px] flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </span>
      {type === "text" ? (
        <span className="text-sm font-semibold text-zinc-200">
          {displayValue}
        </span>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-zinc-200">
            {displayValue}
          </span>
          <div className="h-1 w-10 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${barPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default async function LocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ location_id: string }>;
  searchParams?: Promise<{ user_email?: string }>;
}) {
  const p = await params;
  const sp = searchParams ? await searchParams : {};
  const location_id = decodeURIComponent(p.location_id);
  const selectedEmailRaw = sp?.user_email ? decodeURIComponent(sp.user_email) : null;
  const selectedEmail = selectedEmailRaw && selectedEmailRaw !== "all" ? selectedEmailRaw : null;

  // --- DATA FETCHING ---
  async function syncLocationAction(
    _prevState: { ok: boolean | null; message: string | null },
    formData: FormData
  ) {
    "use server";
    const companyId = String(formData.get("company_id") || "");
    const locationId = String(formData.get("location_id") || "");
    if (!locationId) {
      return { ok: false, message: "Missing location id." };
    }

    const headerList = await headers();
    const host = headerList.get("x-forwarded-host") || headerList.get("host");
    const proto = headerList.get("x-forwarded-proto") || "https";
    if (!host) {
      return { ok: false, message: "Missing host for sync." };
    }

    const baseUrl = `${proto}://${host}`;
    const payload = companyId ? { companyId, locationId } : { locationId };

    try {
      const res = await fetch(`${baseUrl}/api/internal/external/sync-location`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.INTERNAL_API_KEY
            ? { "x-internal-key": process.env.INTERNAL_API_KEY }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return { ok: false, message: data?.error || "Sync failed." };
      }

      revalidatePath(`/locations/${encodeURIComponent(locationId)}`);
      if (data?.subscriptionError) {
        return {
          ok: false,
          message: `Sync completed. Subscription failed: ${data.subscriptionError}`,
        };
      }
      return { ok: true, message: "Sync completed." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed.";
      return { ok: false, message };
    }
  }

  const { data: locationRow, error: locationError } = await supabaseAdmin
    .from("ghl_locations")
    .select("company_id, profile, subscription, last_synced_at")
    .eq("location_id", location_id)
    .maybeSingle();

  if (locationError) return <ErrorState msg={locationError.message} id={location_id} />;

  const locationProfile = locationRow?.profile || null;
  const locationSubscription = locationRow?.subscription || null;
  const locationName = pickLocationName(locationProfile, location_id);
  const subscriptionSummary = formatSubscription(locationSubscription);
  const subscriptionMrr = formatMoney(
    subscriptionSummary?.mrr,
    subscriptionSummary?.mrrSymbol,
    subscriptionSummary?.mrrCurrency
  );
  const { data: firstSeenRows } = await supabaseAdmin
    .from("user_last_seen")
    .select("last_seen_at")
    .eq("location_id", location_id)
    .order("last_seen_at", { ascending: true })
    .limit(1);
  const firstSeenDate = firstSeenRows?.[0]?.last_seen_at
    ? new Date(firstSeenRows[0].last_seen_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
  const subscriptionStatus = subscriptionSummary?.status
    ? String(subscriptionSummary.status)
    : null;
  const subscriptionStatusLower = subscriptionStatus?.toLowerCase();
  const subscriptionStatusClassName =
    subscriptionStatusLower === "active"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
      : "border-white/10 bg-white/5 text-zinc-400";
  
  // 0) Health
  const { data: healthRow, error: healthError } = await supabaseAdmin
    .from("location_health_latest")
    .select("location_id, health_score, login_score, features_score, trend_score, score_day, computed_at")
    .eq("location_id", location_id)
    .maybeSingle();

  if (healthError) return <ErrorState msg={healthError.message} id={location_id} />;

  const score = normalizeScore(healthRow?.health_score);
  const status = scoreToStatus(score);
  const badge = healthColor(scoreToColor(score));
  const loginScore = loginDaysFromScore(normalizeScore(healthRow?.login_score));
  const productAdoptionScore = normalizeScore(healthRow?.features_score);

  // Page view metric not tracked here yet.
  const pageViewCount = NO_DATA_LABEL;

  // A) Top features (location lifetime)
  const { data: lifetimeRows, error: e1 } = await supabaseAdmin
    .from("user_feature_lifetime")
    .select("feature_key, time_sec")
    .eq("location_id", location_id);

  if (e1) return <ErrorState msg={e1.message} id={location_id} />;

  const featureTotals = new Map<string, number>();
  for (const r of lifetimeRows || []) {
    const rawKey = r.feature_key || "other";
    const featureKey = getAggregatedFeatureKey(rawKey);
    featureTotals.set(featureKey, (featureTotals.get(featureKey) || 0) + Number(r.time_sec || 0));
  }

  const topFeatures = Array.from(featureTotals.entries())
    .map(([feature_key, time_sec]) => ({ feature_key, time_sec }))
    .sort((a, b) => b.time_sec - a.time_sec)
    .slice(0, 5);

  const totalLifetime = Array.from(featureTotals.values()).reduce((a, b) => a + b, 0);
  
  // Adoption calculation
  const featureTimeByKey = new Map<string, number>();
  for (const r of lifetimeRows || []) {
    const rawKey = r.feature_key || "other";
    const featureKey = getAggregatedFeatureKey(rawKey);
    featureTimeByKey.set(featureKey, (featureTimeByKey.get(featureKey) || 0) + Number(r.time_sec || 0));
  }
  const ADOPTED_THRESHOLD_SEC = 3600;
  
  const displayFeatures = getDisplayFeatures(FEATURES);
  let adoptedCount = 0;
  displayFeatures.forEach((f) => {
      if ((featureTimeByKey.get(f.key) || 0) >= ADOPTED_THRESHOLD_SEC) adoptedCount++;
  });
  const adoptionPercentage = Math.round((adoptedCount / displayFeatures.length) * 100);

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

  let selectedFeatureTimeByKey = new Map<string, number>();
  if (selectedEmail) {
    const { data: selectedLifetimeRows, error: eSelected } = await supabaseAdmin
      .from("user_feature_lifetime")
      .select("feature_key, time_sec")
      .eq("location_id", location_id)
      .ilike("email", selectedEmail);

    if (eSelected) return <ErrorState msg={eSelected.message} id={location_id} />;

    for (const r of selectedLifetimeRows || []) {
      const rawKey = r.feature_key || "other";
      const featureKey = getAggregatedFeatureKey(rawKey);
      selectedFeatureTimeByKey.set(
        featureKey,
        (selectedFeatureTimeByKey.get(featureKey) || 0) + Number(r.time_sec || 0)
      );
    }
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
        supabaseAdmin.rpc("gocroco_user_health_v2", {
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

  const usageFeatureTimeByKey = selectedEmail ? selectedFeatureTimeByKey : featureTimeByKey;
  const usageTopTime = Math.max(1, ...Array.from(usageFeatureTimeByKey.values()));

  // --- RENDER ---
  return (
    <main className="min-h-screen bg-black text-zinc-400 font-sans p-6 md:p-10 selection:bg-zinc-800">
      <div className="mx-auto max-w-[1280px]">
        {/* HEADER */}
        <header className="mb-8 flex flex-col gap-5 border-b border-white/10 pb-8">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <nav className="mb-3 flex gap-2 text-xs text-zinc-500">
                  <a href="/locations" className="text-zinc-500 hover:text-zinc-300">
                    Locations
                  </a>
                  <span>/</span>
                  <span className="text-zinc-200">{location_id}</span>
                </nav>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  {locationName}
                </h1>
                <div className="mt-1 text-xs text-zinc-500">{location_id}</div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`/users?location_id=${encodeURIComponent(location_id)}`}
                  className="inline-flex h-8 items-center rounded-lg bg-white px-4 text-sm font-semibold text-black"
                >
                  Users +
                </a>
                <SyncLocationForm
                  action={syncLocationAction}
                  companyId={locationRow?.company_id || ""}
                  locationId={location_id}
                  disabled={!location_id}
                  buttonClassName="inline-flex h-8 items-center rounded-lg border border-white/10 px-4 text-sm font-semibold text-zinc-200 transition hover:border-white/20 hover:text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.25)]" />
                <span className="font-medium text-zinc-200">
                  {users.length} Active Users
                </span>
              </div>
              <span className="text-zinc-700">|</span>
              <div className="text-zinc-500">
                Lifetime:{" "}
                <span className="font-mono text-zinc-200">
                  {fmtSec(totalLifetime)}
                </span>
              </div>
              <span className="text-zinc-700">|</span>
              <div className="text-zinc-500">
                Subscription:{" "}
                <span className="font-mono text-zinc-200">
                  {subscriptionSummary?.plan || "n/a"}
                </span>
                {subscriptionMrr && (
                  <span className="ml-2 text-zinc-500">
                    MRR:{" "}
                    <span className="font-mono text-zinc-200">
                      {subscriptionMrr}
                      {subscriptionSummary?.mrrInterval
                        ? `/${subscriptionSummary.mrrInterval}`
                        : ""}
                    </span>
                  </span>
                )}
                {subscriptionStatus && (
                  <span
                    className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${subscriptionStatusClassName}`}
                  >
                    {subscriptionStatus}
                  </span>
                )}
                {firstSeenDate && (
                  <span className="ml-2 text-zinc-700">
                    First seen: {firstSeenDate}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-6">
            {/* Metrics Group */}
            <div className="flex gap-6 border-r border-white/10 pr-6">
              <MetricMini label="Login Days (7d)" value={loginScore} suffix=" days" />
              <MetricMini
                label="Product Adoption"
                value={productAdoptionScore}
                type="bar"
                max={FEATURES_SCORE_MAX}
              />
              <MetricMini label="Page Views" value={pageViewCount} />
            </div>

            {/* Main Health Score */}
            <div className="text-right">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Health Score
              </div>
              <div className="flex items-baseline justify-end gap-2">
                <span className="text-3xl font-bold leading-none text-white">
                  {score === null ? NO_DATA_LABEL : score}
                </span>
                <span className="text-sm font-medium" style={{ color: badge.fg }}>
                  {status}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* BENTO GRID */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* COL 1 (Main: Trends, Risk, Adoption) */}
          <div className="flex flex-col gap-6 lg:col-span-8">
            {/* SPARKLINE */}
            <div className="flex min-h-[200px] flex-col justify-between rounded-xl border border-white/5 bg-zinc-900/40 p-5 backdrop-blur-sm">
              <SectionHeader title="Activity Trend" subtitle="Last 14 Days" />
              <div className="flex h-[120px] items-end gap-1 pt-4">
                {series.map((p) => {
                  const heightPct = Math.max(5, Math.round((p.sec / max) * 100));
                  return (
                    <div
                      key={p.day}
                      className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                      title={`${p.day}: ${fmtSec(p.sec)}`}
                    >
                      <div
                        className="w-full rounded-sm transition-all"
                        style={{
                          height: `${heightPct}%`,
                          background: p.sec ? "#3f3f46" : "#27272a",
                          opacity: p.sec ? 1 : 0.3,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AT RISK USERS TABLE */}
            <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-5 backdrop-blur-sm">
              <SectionHeader
                title="Attention Required"
                subtitle={
                  <span className="font-medium text-orange-400">
                    {topAtRisk.length} Users At Risk
                  </span>
                }
              />

              {topAtRisk.length === 0 ? (
                <div className="py-4 text-sm italic text-zinc-500">
                  No users currently flagged as at-risk.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="pb-3 text-[11px] font-medium uppercase text-zinc-500">
                          User
                        </th>
                        <th className="pb-3 text-right text-[11px] font-medium uppercase text-zinc-500">
                          Health
                        </th>
                        <th className="pb-3 pl-4 text-[11px] font-medium uppercase text-zinc-500">
                          Primary Risk Factors
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topAtRisk.map((u) => {
                        const uScore = Math.round(u.health?.health_score || 0);
                        const uTrend = u.health?.trend?.indicator;
                        const tags = riskTags(u.risk).slice(0, 2);
                        return (
                          <tr
                            key={u.email}
                            className="border-b border-white/5 transition-colors hover:bg-white/[0.03]"
                          >
                            <td className="py-3 pr-4">
                              <a
                                href={`/users/${encodeURIComponent(
                                  u.email
                                )}?location_id=${encodeURIComponent(location_id)}`}
                                className="text-inherit no-underline"
                              >
                                <div className="font-medium text-zinc-200">
                                  {u.email}
                                </div>
                                <div className="mt-0.5 text-[11px] text-zinc-500">
                                  {u.last_url || "No activity"}
                                </div>
                              </a>
                            </td>
                            <td className="py-3 text-right">
                              <StatusBadge
                                label={uScore}
                                colorObj={healthColor(u.health?.color)}
                                icon={trendIcon(uTrend)}
                              />
                            </td>
                            <td className="py-3 pl-4">
                              <div className="flex flex-wrap gap-1.5">
                                {tags.map((t) => (
                                  <span
                                    key={t}
                                    className="rounded border border-white/10 bg-white/[0.02] px-1.5 py-0.5 text-[10px] text-zinc-500"
                                  >
                                    {t}
                                  </span>
                                ))}
                                {tags.length === 0 && (
                                  <span className="text-zinc-700">n/a</span>
                                )}
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

            {/* FEATURE ADOPTION BLOCK */}
            <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-5 backdrop-blur-sm">
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    Feature Adoption
                  </h3>
                  <span className="text-sm font-medium text-zinc-200">
                    {adoptionPercentage}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${adoptionPercentage}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                {displayFeatures.map((f) => {
                  const used = featureTimeByKey.get(f.key) || 0;
                  const adopted = used >= ADOPTED_THRESHOLD_SEC;
                  return (
                    <div key={f.key} className="flex items-center gap-2.5">
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded ${
                          adopted
                            ? "bg-emerald-500 text-black"
                            : "border border-white/10"
                        }`}
                      >
                        {adopted && (
                          <svg
                            width="10"
                            height="8"
                            viewBox="0 0 10 8"
                            fill="none"
                          >
                            <path
                              d="M1 4L3.5 6.5L9 1"
                              stroke="black"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <span
                        className={`text-sm ${
                          adopted ? "text-zinc-200" : "text-zinc-500"
                        }`}
                      >
                        {f.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* COL 2 (Sidebar: Top, Feature Usage) */}
          <div className="flex flex-col gap-6 lg:col-span-4">
            {/* Top Features */}
            <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-5 backdrop-blur-sm">
              <SectionHeader title="Top Features" subtitle="Lifetime" />
              <div className="flex flex-col gap-3">
                {topFeatures.map((f, i) => (
                  <div
                    key={f.feature_key}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="w-4 text-[11px] font-mono text-zinc-700">
                        {i + 1}
                      </span>
                      <span className="truncate text-sm font-medium text-zinc-200">
                        {labelForFeature(f.feature_key)}
                      </span>
                    </div>
                    <span className="rounded bg-white/[0.03] px-1.5 py-0.5 text-[11px] font-mono text-zinc-500">
                      {fmtSec(f.time_sec)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Feature Usage (Time Spent) + Filter */}
            <div className="flex max-h-[calc(100vh-200px)] flex-col overflow-hidden rounded-xl border border-white/5 bg-zinc-900/40 p-5 backdrop-blur-sm">
              <div className="flex-shrink-0">
                <SectionHeader
                  title="Feature Usage"
                  subtitle={
                    selectedEmail
                      ? `Time Spent - ${selectedEmail}`
                      : "Time Spent"
                  }
                  rightElement={
                    <FeatureUsageUserSelect
                      users={users}
                      selectedEmail={selectedEmail}
                    />
                  }
                />
                <div className="mb-3 flex justify-between border-b border-white/10 pb-3 text-[11px] font-semibold uppercase text-zinc-700">
                  <span>Feature</span>
                  <span>Duration</span>
                </div>
              </div>

              <div className="custom-scroll overflow-y-auto pr-1">
                <div className="flex flex-col gap-1">
                  {displayFeatures.map((f) => {
                    const time = usageFeatureTimeByKey.get(f.key) || 0;
                    const barWidth = Math.min(
                      100,
                      (time / usageTopTime) * 100
                    );
                    return (
                      <div
                        key={f.key}
                        className="relative overflow-hidden rounded-md px-2 py-1.5"
                      >
                        <div
                          className="absolute inset-y-0 left-0 z-0 bg-white/[0.03]"
                          style={{ width: `${barWidth}%` }}
                        />
                        <div className="relative z-10 flex items-center justify-between">
                          <span className="text-sm text-zinc-200">{f.label}</span>
                          <span
                            className={`text-xs font-mono ${
                              time > 0 ? "text-zinc-500" : "text-zinc-700"
                            }`}
                          >
                            {time > 0 ? fmtSec(time) : "n/a"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-black p-6 text-center text-zinc-400">
      <h1 className="mb-4 text-2xl font-bold text-white">
        Error loading {id}
      </h1>
      <pre className="rounded-lg border border-red-900/40 bg-red-900/20 p-4 text-sm text-red-200">
        {msg}
      </pre>
    </main>
  );
}





