import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exchangeLocationToken, refreshAgencyToken } from "@/lib/ghl";
import { decryptToken, encryptToken } from "@/lib/tokenCrypto";

function ensureInternalAuth(req: Request) {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return null;
  const provided = req.headers.get("x-internal-key");
  if (provided !== key) {
    return new NextResponse(
      JSON.stringify({ ok: false, error: "Unauthorized" }),
      { status: 401 }
    );
  }
  return null;
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

export async function POST(req: Request) {
  const authError = ensureInternalAuth(req);
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const companyId = body?.companyId;
  const locationId = body?.locationId;
  if (!companyId || !locationId) {
    return NextResponse.json(
      { ok: false, error: "companyId and locationId required" },
      { status: 400 }
    );
  }

  const { data: cachedLocation, error: locationError } = await supabaseAdmin
    .from("ghl_locations")
    .select(
      "location_id, company_id, location_access_token_enc, location_token_expires_at"
    )
    .eq("company_id", companyId)
    .eq("location_id", locationId)
    .maybeSingle();

  if (locationError) {
    return NextResponse.json(
      { ok: false, error: locationError.message },
      { status: 500 }
    );
  }

  if (
    cachedLocation?.location_access_token_enc &&
    isTokenValid(cachedLocation.location_token_expires_at)
  ) {
    const decrypted = decryptToken(cachedLocation.location_access_token_enc);
    return NextResponse.json({
      ok: true,
      locationAccessToken: decrypted,
      expiresAt: cachedLocation.location_token_expires_at,
      cached: true,
    });
  }

  const { data: agency, error: agencyError } = await supabaseAdmin
    .from("ghl_agencies")
    .select(
      "company_id, agency_access_token_enc, agency_refresh_token_enc, agency_token_expires_at"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (agencyError) {
    return NextResponse.json(
      { ok: false, error: agencyError.message },
      { status: 500 }
    );
  }

  if (!agency?.agency_access_token_enc) {
    return NextResponse.json(
      { ok: false, error: "Agency token not found" },
      { status: 404 }
    );
  }

  let agencyAccessToken = decryptToken(agency.agency_access_token_enc);
  if (!isTokenValid(agency.agency_token_expires_at)) {
    if (!agency.agency_refresh_token_enc) {
      return NextResponse.json(
        { ok: false, error: "Agency refresh token missing" },
        { status: 400 }
      );
    }

    const agencyRefreshToken = decryptToken(agency.agency_refresh_token_enc);
    const refreshed = await refreshAgencyToken(agencyRefreshToken);
    agencyAccessToken = refreshed.access_token;

    await supabaseAdmin.from("ghl_agencies").upsert(
      {
        company_id: companyId,
        agency_access_token_enc: encryptToken(refreshed.access_token),
        agency_refresh_token_enc:
          refreshed.refresh_token
            ? encryptToken(refreshed.refresh_token)
            : agency.agency_refresh_token_enc,
        agency_token_expires_at: expiresAtFromNow(refreshed.expires_in, 3600),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    );
  }

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
    return NextResponse.json(
      { ok: false, error: upsertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    locationAccessToken: locationToken.access_token,
    expiresAt: locationExpiresAt,
    cached: false,
  });
}
