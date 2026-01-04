import crypto from "crypto";
import { NextResponse } from "next/server";
import { buildInstallUrl } from "@/lib/ghl";

export async function GET(req: Request) {
  const useState = process.env.GHL_OAUTH_USE_STATE !== "false";
  const state = useState ? crypto.randomBytes(16).toString("hex") : undefined;

  const url = buildInstallUrl(state);
  console.log("GHL install redirect URL:", url);

  const res = NextResponse.redirect(url);

  if (state) {
    res.cookies.set("ghl_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
  }

  return res;
}
