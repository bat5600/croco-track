import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getLocationAccessToken, TokenError } from "@/lib/ghlTokens";
import { getLocationProfile, getLocationSubscription } from "@/lib/ghlService";

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

  try {
    const { token } = await getLocationAccessToken({ companyId, locationId });
    const [profile, subscription] = await Promise.all([
      getLocationProfile(locationId, token),
      getLocationSubscription(locationId, token),
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
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      companyId,
      locationId,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof TokenError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
