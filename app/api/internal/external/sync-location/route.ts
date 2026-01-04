import { NextResponse } from "next/server";
import { TokenError } from "@/lib/ghlTokens";
import { syncLocation } from "@/lib/ghlSync";

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
  const companyId = body?.companyId ?? null;
  const locationId = body?.locationId;
  if (!locationId) {
    return NextResponse.json(
      { ok: false, error: "locationId required" },
      { status: 400 }
    );
  }

  try {
    const result = await syncLocation({ companyId, locationId });

    return NextResponse.json({
      ok: true,
      companyId: result.companyId,
      locationId: result.locationId,
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
