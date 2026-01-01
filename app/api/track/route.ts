import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.url) {
    return NextResponse.json({ error: "email and url required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("events").insert({
    email: String(body.email),
    url: String(body.url),
    ts: body.ts ? new Date(body.ts).toISOString() : new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
