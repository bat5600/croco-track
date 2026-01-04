import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function POST(req: Request) {
  const authError = ensureInternalAuth(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(toNumber(body?.limit, 1000), 5000);
  const pageSize = Math.min(toNumber(body?.pageSize, 500), 1000);
  const dryRun = body?.dryRun === true;

  const locationSet = new Set<string>();
  let fetchedRows = 0;

  for (let page = 0; locationSet.size < limit; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabaseAdmin
      .from("user_last_seen")
      .select("location_id")
      .range(from, to);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = data || [];
    fetchedRows += rows.length;
    for (const row of rows) {
      const id = String(row.location_id || "");
      if (id) locationSet.add(id);
      if (locationSet.size >= limit) break;
    }

    if (rows.length < pageSize) break;
  }

  const locationIds = Array.from(locationSet);
  const existingSet = new Set<string>();

  for (let i = 0; i < locationIds.length; i += 500) {
    const chunk = locationIds.slice(i, i + 500);
    const { data, error } = await supabaseAdmin
      .from("ghl_locations")
      .select("location_id")
      .in("location_id", chunk);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    for (const row of data || []) {
      const id = String(row.location_id || "");
      if (id) existingSet.add(id);
    }
  }

  const missing = locationIds.filter((id) => !existingSet.has(id));

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      fetchedRows,
      distinctLocations: locationIds.length,
      missingCount: missing.length,
      dryRun: true,
    });
  }

  let synced = 0;
  let failed = 0;
  const errors: Array<{ locationId: string; error: string }> = [];

  for (const locationId of missing) {
    try {
      await syncLocation({ locationId });
      synced += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Unexpected error";
      if (errors.length < 25) {
        errors.push({ locationId, error: message });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    fetchedRows,
    distinctLocations: locationIds.length,
    missingCount: missing.length,
    synced,
    failed,
    errors,
  });
}
