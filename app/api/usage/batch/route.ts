import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const items = body?.items;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ ok: false, error: "items[] required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("gocroco_usage_ingest_batch", {
    items,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? { ok: true });
}
