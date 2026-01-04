import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { extractLocationIdFromUrl, parseFeatureFromUrl } from "@/lib/urlParsing";
import { syncLocation } from "@/lib/ghlSync";

const ALLOWED_ORIGINS = new Set([
  "https://pro.crococlick.com",
]);

function corsHeaders(origin: string | null) {
  const headers = new Headers();
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return headers;
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.url) {
    return NextResponse.json(
      { error: "email and url required" },
      { status: 400, headers }
    );
  }

  const url = String(body.url);
  const parsed = parseFeatureFromUrl(url);
  const locationId = extractLocationIdFromUrl(url);

  const { error } = await supabaseAdmin.from("events").insert({
    email: String(body.email),
    url,
    ts: body.ts ? new Date(body.ts).toISOString() : new Date().toISOString(),
    feature_key: parsed?.feature_key ?? null,
    feature_raw: parsed?.feature_raw ?? null,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers }
    );
  }

  if (locationId) {
    try {
      const { data: existing } = await supabaseAdmin
        .from("ghl_locations")
        .select("location_id")
        .eq("location_id", locationId)
        .maybeSingle();

      if (!existing) {
        await syncLocation({ locationId });
      }
    } catch {
      // Best-effort sync; tracking should not fail because of GHL.
    }
  }

  return NextResponse.json({ ok: true }, { headers });
}
