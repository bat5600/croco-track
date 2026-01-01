import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const location_id = searchParams.get("location_id");
    const day = searchParams.get("day"); // optionnel: YYYY-MM-DD

    if (!location_id) {
      return NextResponse.json(
        { ok: false, error: "location_id required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      "gocroco_location_health_v2",
      {
        target_location_id: location_id,
        ref_day: day ?? null,
      }
    );

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
