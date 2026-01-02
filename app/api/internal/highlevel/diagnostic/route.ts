import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

export async function GET(req: Request) {
  const authError = ensureInternalAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  const locationId = searchParams.get("locationId");

  if (!companyId) {
    return NextResponse.json(
      { ok: false, error: "companyId required" },
      { status: 400 }
    );
  }

  const { data: agency, error: agencyError } = await supabaseAdmin
    .from("ghl_agencies")
    .select(
      "company_id, agency_token_expires_at, agency_refresh_token_enc, scopes, user_type, created_at, updated_at"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (agencyError) {
    return NextResponse.json({ ok: false, error: agencyError.message }, { status: 500 });
  }

  let location = null;
  if (locationId) {
    const { data, error } = await supabaseAdmin
      .from("ghl_locations")
      .select(
        "company_id, location_id, location_token_expires_at, last_synced_at, created_at, updated_at"
      )
      .eq("company_id", companyId)
      .eq("location_id", locationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (data) {
      location = {
        ...data,
        location_token_valid: isTokenValid(data.location_token_expires_at),
      };
    }
  }

  return NextResponse.json({
    ok: true,
    agency: agency
      ? {
          company_id: agency.company_id,
          agency_token_expires_at: agency.agency_token_expires_at,
          agency_token_valid: isTokenValid(agency.agency_token_expires_at),
          has_refresh_token: Boolean(agency.agency_refresh_token_enc),
          scopes: agency.scopes || [],
          user_type: agency.user_type,
          created_at: agency.created_at,
          updated_at: agency.updated_at,
        }
      : null,
    location,
  });
}
