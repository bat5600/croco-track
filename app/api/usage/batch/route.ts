import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function corsHeaders(origin: string | null) {
  const allowed = new Set([
    "https://pro.crococlick.com",
    "https://app.crococlick.com",
    "https://app.gohighlevel.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ]);

  const o = origin && allowed.has(origin) ? origin : "https://pro.crococlick.com";

  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  const body = await req.json().catch(() => null);
  const items = body?.items;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ ok: false, error: "items[] required" }, { status: 400, headers });
  }

  const { data, error } = await supabaseAdmin.rpc("gocroco_usage_ingest_batch", { items });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers });
  }

  return NextResponse.json(data ?? { ok: true }, { headers });
}
