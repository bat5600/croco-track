import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exchangeCodeForAgencyToken } from "@/lib/ghl";
import { encryptToken } from "@/lib/tokenCrypto";

function expiresAtFromNow(expiresIn?: number | null, fallbackSeconds = 3600) {
  const sec = typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : fallbackSeconds;
  return new Date(Date.now() + sec * 1000).toISOString();
}

function clearStateCookie(res: NextResponse) {
  res.cookies.set("ghl_oauth_state", "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code) {
    return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
  }

  // ✅ CSRF protection (state)
  const cookieStore = await cookies(); // <- IMPORTANT: await
  const expectedState = cookieStore.get("ghl_oauth_state")?.value;

  const allowNoState =
    process.env.GHL_ALLOW_OAUTH_NO_STATE === "true" ||
    process.env.GHL_OAUTH_USE_STATE === "false";
  if ((!expectedState || !state || state !== expectedState) && !allowNoState) {
    return NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });
  }

  // Optionnel: on “consume” le cookie state (évite re-use)
  // Exchange OAuth code -> agency token
  const tokenData = await exchangeCodeForAgencyToken(code);

  const companyId = tokenData.companyId;
  if (!companyId) {
    return NextResponse.json(
      { ok: false, error: "Missing companyId in token response" },
      { status: 500 }
    );
  }

  const scopes = (tokenData.scope || process.env.GHL_SCOPE || "")
    .split(" ")
    .filter(Boolean);

  const { error } = await supabaseAdmin.from("ghl_agencies").upsert(
    {
      company_id: companyId,
      agency_access_token_enc: encryptToken(tokenData.access_token),
      agency_refresh_token_enc: tokenData.refresh_token
        ? encryptToken(tokenData.refresh_token)
        : null,
      agency_token_expires_at: expiresAtFromNow(tokenData.expires_in, 3600),
      user_type: tokenData.userType || null,
      scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const redirectUrl = process.env.GHL_INSTALL_SUCCESS_REDIRECT;
  if (redirectUrl) {
    return clearStateCookie(NextResponse.redirect(redirectUrl));
  }

  return clearStateCookie(NextResponse.json({ ok: true, companyId }));
}
