import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getLocationProfile, getLocationSubscription, getSaasPlan } from "@/lib/ghlService";
import { getAgencyAccessToken, getLocationAccessToken, TokenError } from "@/lib/ghlTokens";

function extractCompanyId(profile: any, fallback?: string | null) {
  return (
    profile?.companyId ||
    profile?.location?.companyId ||
    profile?.location?.company_id ||
    profile?.company_id ||
    fallback ||
    null
  );
}

async function resolveCompanyIdAndProfile(locationId: string) {
  const { data: agencies, error } = await supabaseAdmin
    .from("ghl_agencies")
    .select("company_id");

  if (error) {
    throw new TokenError(500, error.message);
  }
  if (!agencies || agencies.length === 0) {
    throw new TokenError(404, "No agency tokens found");
  }

  let lastError: string | null = null;
  for (const agency of agencies || []) {
    const companyId = String(agency.company_id || "");
    if (!companyId) continue;
    try {
      const { token } = await getAgencyAccessToken(companyId);
      const profile = await getLocationProfile(locationId, token);
      const resolvedCompanyId = extractCompanyId(profile, companyId);
      if (resolvedCompanyId) {
        return { companyId: resolvedCompanyId, profile };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      lastError = message;
      // Try next agency token.
    }
  }

  const suffix = lastError ? ` Last error: ${lastError}` : "";
  throw new TokenError(404, `Location not found for any agency.${suffix}`);
}

export async function syncLocation(params: { locationId: string; companyId?: string | null }) {
  const locationId = String(params.locationId || "");
  if (!locationId) {
    throw new TokenError(400, "locationId required");
  }

  let companyId = params.companyId ? String(params.companyId) : "";
  let profileFromAgency: unknown | null = null;

  if (!companyId) {
    const resolved = await resolveCompanyIdAndProfile(locationId);
    companyId = resolved.companyId;
    profileFromAgency = resolved.profile;
  }

  const { token: locationToken } = await getLocationAccessToken({ companyId, locationId });
  const profile = profileFromAgency ?? (await getLocationProfile(locationId, locationToken));
  let subscription: unknown | null = null;
  let subscriptionError: string | null = null;
  try {
    const { token: agencyToken } = await getAgencyAccessToken(companyId);
    subscription = await getLocationSubscription(locationId, companyId, agencyToken);
    const planId =
      (subscription as any)?.data?.saasPlanId ||
      (subscription as any)?.data?.planId ||
      (subscription as any)?.data?.priceId;
    if (planId) {
      try {
        const planResponse = await getSaasPlan(String(planId), companyId, agencyToken);
        const planData = (planResponse as any)?.data || planResponse;
        subscription = { ...(subscription as any), plan: planData };
      } catch {
        // Plan enrichment is best-effort; keep subscription if plan lookup fails.
      }
    }
  } catch (error) {
    subscription = null;
    const message = error instanceof Error ? error.message : "Subscription fetch failed";
    subscriptionError = message;
  }

  const { error } = await supabaseAdmin.from("ghl_locations").upsert(
    {
      company_id: companyId,
      location_id: locationId,
      profile,
      subscription,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,location_id" }
  );

  if (error) {
    throw new TokenError(500, error.message);
  }

  return { companyId, locationId, subscriptionError };
}
