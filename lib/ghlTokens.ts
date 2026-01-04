import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptToken, encryptToken } from "@/lib/tokenCrypto";
import { exchangeLocationToken, refreshAgencyToken } from "@/lib/ghl";

type LocationTokenResult = {
  token: string;
  expiresAt: string | null;
  cached: boolean;
};

type AgencyTokenResult = {
  token: string;
  expiresAt: string | null;
  refreshed: boolean;
};

export class TokenError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isTokenValid(expiresAt?: string | null) {
  if (!expiresAt) return false;
  const expires = new Date(expiresAt).getTime();
  return Number.isFinite(expires) && expires > Date.now() + 60_000;
}

function expiresAtFromNow(seconds?: number, fallbackSeconds = 900) {
  const value = seconds ?? fallbackSeconds;
  return new Date(Date.now() + value * 1000).toISOString();
}

export async function getAgencyAccessToken(companyId: string): Promise<AgencyTokenResult> {
  const { data: agency, error: agencyError } = await supabaseAdmin
    .from("ghl_agencies")
    .select(
      "company_id, agency_access_token_enc, agency_refresh_token_enc, agency_token_expires_at"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (agencyError) {
    throw new TokenError(500, agencyError.message);
  }

  if (!agency?.agency_access_token_enc) {
    throw new TokenError(404, "Agency token not found");
  }

  let agencyAccessToken = decryptToken(agency.agency_access_token_enc);
  if (isTokenValid(agency.agency_token_expires_at)) {
    return {
      token: agencyAccessToken,
      expiresAt: agency.agency_token_expires_at,
      refreshed: false,
    };
  }

  if (!agency.agency_refresh_token_enc) {
    throw new TokenError(400, "Agency refresh token missing");
  }

  const agencyRefreshToken = decryptToken(agency.agency_refresh_token_enc);
  const refreshed = await refreshAgencyToken(agencyRefreshToken);
  agencyAccessToken = refreshed.access_token;

  await supabaseAdmin.from("ghl_agencies").upsert(
    {
      company_id: companyId,
      agency_access_token_enc: encryptToken(refreshed.access_token),
      agency_refresh_token_enc: refreshed.refresh_token
        ? encryptToken(refreshed.refresh_token)
        : agency.agency_refresh_token_enc,
      agency_token_expires_at: expiresAtFromNow(refreshed.expires_in, 3600),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );

  return {
    token: agencyAccessToken,
    expiresAt: expiresAtFromNow(refreshed.expires_in, 3600),
    refreshed: true,
  };
}

export async function getLocationAccessToken(params: {
  companyId: string;
  locationId: string;
}): Promise<LocationTokenResult> {
  const { companyId, locationId } = params;

  const { data: cachedLocation, error: locationError } = await supabaseAdmin
    .from("ghl_locations")
    .select(
      "location_id, company_id, location_access_token_enc, location_token_expires_at"
    )
    .eq("company_id", companyId)
    .eq("location_id", locationId)
    .maybeSingle();

  if (locationError) {
    throw new TokenError(500, locationError.message);
  }

  if (
    cachedLocation?.location_access_token_enc &&
    isTokenValid(cachedLocation.location_token_expires_at)
  ) {
    return {
      token: decryptToken(cachedLocation.location_access_token_enc),
      expiresAt: cachedLocation.location_token_expires_at,
      cached: true,
    };
  }

  const { token: agencyAccessToken } = await getAgencyAccessToken(companyId);

  const locationToken = await exchangeLocationToken({
    companyId,
    locationId,
    agencyAccessToken,
  });

  const locationExpiresAt = expiresAtFromNow(
    locationToken.expires_in,
    Number(process.env.GHL_LOCATION_TOKEN_TTL_SECONDS) || 900
  );

  const { error: upsertError } = await supabaseAdmin.from("ghl_locations").upsert(
    {
      company_id: companyId,
      location_id: locationId,
      location_access_token_enc: encryptToken(locationToken.access_token),
      location_token_expires_at: locationExpiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,location_id" }
  );

  if (upsertError) {
    throw new TokenError(500, upsertError.message);
  }

  return {
    token: locationToken.access_token,
    expiresAt: locationExpiresAt,
    cached: false,
  };
}
