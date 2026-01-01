import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const email = searchParams.get("email");
  const location_id = searchParams.get("location_id");
  const day = searchParams.get("day"); // optional YYYY-MM-DD

  if (!email || !location_id) {
    return NextResponse.json({ ok: false, error: "email and location_id required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("gocroco_user_health", {
    target_email: email,
    target_location_id: location_id,
    ref_day: day ?? null,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data });
}