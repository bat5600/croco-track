import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseFeatureFromUrl } from "@/lib/urlParsing";

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

  const parsed = parseFeatureFromUrl(String(body.url));

  const { error } = await supabaseAdmin.from("events").insert({
    email: String(body.email),
    url: String(body.url),
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

  return NextResponse.json({ ok: true }, { headers });
}
