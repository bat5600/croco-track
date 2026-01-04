import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getLocationProfile, getLocationSubscription } from "@/lib/ghlService";
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
    } catch {
      // Try next agency token.
    }
  }

  throw new TokenError(404, "Location not found for any agency");
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
  let agencyToken: string | null = null;
  try {
    const agencyResult = await getAgencyAccessToken(companyId);
    agencyToken = agencyResult.token;
  } catch {
    agencyToken = null;
  }

  const [profile, subscription] = await Promise.all([
    profileFromAgency ?? getLocationProfile(locationId, locationToken),
    getLocationSubscription(locationId, companyId, agencyToken || locationToken),
  ]);

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

  return { companyId, locationId };
}
