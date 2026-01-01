import crypto from "crypto";
import { NextResponse } from "next/server";
import { buildInstallUrl } from "@/lib/ghl";

export async function GET(req: Request) {
  // state anti-CSRF (10 min)
  const state = crypto.randomBytes(16).toString("hex");

  const url = buildInstallUrl(state);

  const res = NextResponse.redirect(url);

  res.cookies.set("ghl_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return res;
}
