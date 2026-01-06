import "server-only";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type LocationRow = {
  location_id: string;
  profile: any;
  subscription: any;
};

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

function getSubscriptionData(subscription: any) {
  if (!subscription) return null;
  return subscription?.data || subscription;
}

function coerceNumber(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDateValue(value: any) {
  if (!value) return null;
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function getTrialStartDate(data: any) {
  return (
    parseDateValue(data?.trialStart) ||
    parseDateValue(data?.trial_start) ||
    parseDateValue(data?.trialStartsAt) ||
    parseDateValue(data?.trial_start_at) ||
    parseDateValue(data?.trialStartDate) ||
    parseDateValue(data?.trial_start_date) ||
    parseDateValue(data?.createdAt) ||
    parseDateValue(data?.created_at)
  );
}

function getTrialEndDate(data: any) {
  return (
    parseDateValue(data?.trialEnd) ||
    parseDateValue(data?.trial_end) ||
    parseDateValue(data?.trialEndsAt) ||
    parseDateValue(data?.trial_end_at) ||
    parseDateValue(data?.trialEndDate) ||
    parseDateValue(data?.trial_end_date) ||
    parseDateValue(data?.trialExpiration) ||
    parseDateValue(data?.trial_expires_at) ||
    parseDateValue(data?.trialExpiresAt)
  );
}

function getCreatedAtDate(subscription: any) {
  const data = getSubscriptionData(subscription);
  const plan = data?.plan || subscription?.plan;
  return (
    parseDateValue(data?.createdAt) ||
    parseDateValue(data?.created_at) ||
    parseDateValue(plan?.createdAt) ||
    parseDateValue(plan?.created_at)
  );
}

function isCreatedOlderThanDays(
  subscription: any,
  days: number,
  now = new Date()
) {
  const createdAt = getCreatedAtDate(subscription);
  if (!createdAt) return false;
  const diffDays = Math.floor(
    (now.getTime() - createdAt.getTime()) / MS_PER_DAY
  );
  return diffDays > days;
}

function getTrialLengthDays(subscription: any) {
  const data = getSubscriptionData(subscription);
  if (!data) return null;
  const plan = data?.plan || subscription?.plan;

  const candidates = [
    data?.trialDays,
    data?.trial_days,
    data?.trialPeriodDays,
    data?.trial_period_days,
    data?.trialPeriod,
    data?.trial_period,
    data?.trialLength,
    data?.trial_length,
    plan?.trialDays,
    plan?.trial_days,
    plan?.trialPeriodDays,
    plan?.trial_period_days,
    plan?.trialPeriod,
    plan?.trial_period,
    plan?.trialLength,
    plan?.trial_length,
  ];

  for (const candidate of candidates) {
    const n = coerceNumber(candidate);
    if (n && n > 0) return Math.round(n);
  }

  const start = getTrialStartDate(data);
  const end = getTrialEndDate(data);
  if (start && end) {
    const diff = Math.ceil((end.getTime() - start.getTime()) / MS_PER_DAY);
    return diff > 0 ? diff : null;
  }

  return null;
}

function getPlanName(subscription: any) {
  if (!subscription) return null;
  const data = subscription?.data || subscription;
  const planDetails = data?.plan || subscription?.plan;
  return (
    planDetails?.title ||
    planDetails?.name ||
    planDetails?.id ||
    data.planName ||
    data?.plan?.name ||
    data?.plan?.id ||
    data?.planId ||
    data?.saasPlanId ||
    data?.productId ||
    data?.priceId ||
    null
  );
}

export default async function TrialingPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const sp = searchParams || {};
  const debug = String(sp.debug || "") === "1";
  const debugLocationIdRaw = Array.isArray(sp.location_id)
    ? sp.location_id[0]
    : sp.location_id;
  const debugLocationId = debugLocationIdRaw
    ? String(debugLocationIdRaw)
    : null;
  const { data: locationRowsRaw, error } = await supabaseAdmin
    .from("ghl_locations")
    .select("location_id, profile, subscription");

  if (error) {
    return (
      <main className="min-h-screen bg-black text-white p-10 flex items-center justify-center">
        <div className="bg-red-950/20 border border-red-900/50 p-6 rounded-xl max-w-lg backdrop-blur-sm">
          <h1 className="text-xl font-bold text-red-400 mb-2">
            Erreur lors du chargement des trials
          </h1>
          <pre className="text-xs text-red-300/70 whitespace-pre-wrap font-mono">
            {error.message}
          </pre>
        </div>
      </main>
    );
  }

  const rowsRaw = (locationRowsRaw || []) as LocationRow[];
  const rows = debugLocationId
    ? rowsRaw.filter((row) => row.location_id === debugLocationId)
    : rowsRaw;
  let trialingTotal = 0;
  let trialingKnown = 0;
  let trialingReal = 0;
  let trialingLong = 0;
  let trialingUnknown = 0;

  const trialingRows = rows
    .map((row) => {
      const data = getSubscriptionData(row.subscription);
      if (!data) return null;
      const status = String(data.status || data?.subscriptionStatus || "")
        .trim()
        .toLowerCase();
      if (status !== "trialing") return null;
      trialingTotal += 1;

      if (isCreatedOlderThanDays(row.subscription, 30)) {
        trialingLong += 1;
        return null;
      }

      const trialDays = getTrialLengthDays(row.subscription);
      if (trialDays === null) {
        trialingUnknown += 1;
        return null;
      }

      trialingKnown += 1;
      if (trialDays > 30) {
        trialingLong += 1;
        return null;
      }

      trialingReal += 1;
      return {
        location_id: row.location_id,
        display_name: pickLocationName(row.profile, row.location_id),
        plan: getPlanName(row.subscription) || "n/a",
        trial_days: trialDays,
        trial_start: getTrialStartDate(data),
        trial_end: getTrialEndDate(data),
        created_at: getCreatedAtDate(row.subscription),
        subscription: row.subscription,
        status,
      };
    })
    .filter(Boolean) as Array<{
    location_id: string;
    display_name: string;
    plan: string;
    trial_days: number;
    trial_start: Date | null;
    trial_end: Date | null;
    created_at: Date | null;
    subscription: any;
    status: string;
  }>;

  trialingRows.sort((a, b) => {
    if (a.trial_days !== b.trial_days) return a.trial_days - b.trial_days;
    return a.display_name.localeCompare(b.display_name);
  });

  return (
    <main className="min-h-screen bg-black text-zinc-300 font-sans p-6 md:p-10 selection:bg-emerald-500/20">
      <div className="max-w-[1400px] mx-auto space-y-8">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-white/5 pb-8">
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-[0.3em]">
              Abonnements
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mt-2">
              Trialing (&lt;= 30 jours)
            </h1>
            <p className="text-sm text-zinc-500 mt-2 max-w-xl">
              Liste des vrais trials: status = trialing et duree d&apos;essai
              &lt;= 30 jours.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
            <div className="bg-white/5 px-4 py-3 rounded-lg border border-white/10">
              Trialing total
              <div className="text-sm text-white font-semibold mt-1">
                {trialingTotal}
              </div>
            </div>
            <div className="bg-white/5 px-4 py-3 rounded-lg border border-white/10">
              Trials &lt;= 30j
              <div className="text-sm text-white font-semibold mt-1">
                {trialingReal}
              </div>
            </div>
            <div className="bg-white/5 px-4 py-3 rounded-lg border border-white/10">
              Trials &gt; 30j
              <div className="text-sm text-white font-semibold mt-1">
                {trialingLong}
              </div>
            </div>
            <div className="bg-white/5 px-4 py-3 rounded-lg border border-white/10">
              Durée inconnue
              <div className="text-sm text-white font-semibold mt-1">
                {trialingUnknown}
              </div>
            </div>
          </div>
        </header>

        {debug && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-100">
            Debug actif. Ajoute `?location_id=ID` pour isoler un compte.
          </div>
        )}

        {trialingRows.length === 0 ? (
          <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-10 text-center text-zinc-500">
            Aucun trialing avec duree connue &lt;= 30 jours.
          </div>
        ) : (
          <div className="bg-zinc-900/40 border border-white/5 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[900px]">
                <thead className="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-white/5">
                  <tr>
                    <th className="px-6 py-4">Compte</th>
                    <th className="px-6 py-4">Plan</th>
                    <th className="px-6 py-4">Duree essai</th>
                    <th className="px-6 py-4">Debut</th>
                    <th className="px-6 py-4">Fin</th>
                    <th className="px-6 py-4">Cree le</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {trialingRows.map((row) => (
                    <>
                      <tr key={row.location_id} className="hover:bg-white/[0.02]">
                        <td className="px-6 py-4">
                          <div className="text-zinc-200 font-medium truncate max-w-[300px]">
                            {row.display_name}
                          </div>
                          <div className="text-xs text-zinc-600 font-mono mt-1">
                            {row.location_id}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-zinc-300">{row.plan}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold border border-emerald-400/30 text-emerald-200 bg-emerald-500/10">
                            {row.trial_days} jours
                          </span>
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {row.trial_start
                            ? row.trial_start.toLocaleDateString()
                            : "n/a"}
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {row.trial_end
                            ? row.trial_end.toLocaleDateString()
                            : "n/a"}
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {row.created_at
                            ? row.created_at.toLocaleDateString()
                            : "n/a"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <a
                            href={`/locations/${encodeURIComponent(
                              row.location_id
                            )}`}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-white/5 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
                          >
                            Ouvrir
                          </a>
                        </td>
                      </tr>
                      {debug && (
                        <tr className="bg-black/30">
                          <td colSpan={7} className="px-6 py-4">
                            <details className="text-xs text-zinc-400">
                              <summary className="cursor-pointer text-zinc-300">
                                Payload subscription
                              </summary>
                              <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-white/5 bg-black/40 p-3 text-[11px] text-zinc-300">
                                {JSON.stringify(row.subscription, null, 2)}
                              </pre>
                            </details>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-zinc-600 px-6 py-4 border-t border-white/5">
              {trialingRows.length} comptes affiches | trials connus:{" "}
              {trialingKnown}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
