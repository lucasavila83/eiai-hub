/**
 * POST /api/share/clear
 *
 * Wipes the __share_payload cookie once the /share UI has finished
 * dispatching files to their destination (chat channel or card).
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "__share_payload";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    path: "/",
    expires: new Date(0),
  });
  return res;
}
