import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req, { params }) {
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "7d";
  const rangeDays = Number(range.replace("d", "")) || 7;

  const email = decodeURIComponent(params.email);

  const { data, error } = await supabase.rpc("gocroco_user_detail", {
    target_email: email,
    range_days: rangeDays,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, rangeDays, ...data },
    { headers: { "Cache-Control": "no-store" } }
  );
}
