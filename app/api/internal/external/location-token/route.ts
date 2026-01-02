import { NextResponse } from "next/server";
import { getLocationAccessToken, TokenError } from "@/lib/ghlTokens";

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
    const result = await getLocationAccessToken({ companyId, locationId });
    return NextResponse.json({
      ok: true,
      locationAccessToken: result.token,
      expiresAt: result.expiresAt,
      cached: result.cached,
    });
  } catch (error) {
    if (error instanceof TokenError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { ok: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}
