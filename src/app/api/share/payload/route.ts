/**
 * GET /api/share/payload
 *
 * Returns the share-target payload that was stashed in the
 * __share_payload cookie by POST /api/share, so the /share UI can read
 * it and show file previews + the destination picker.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "__share_payload";

export async function GET() {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return NextResponse.json({ payload: null });
  try {
    const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    return NextResponse.json({ payload: json });
  } catch {
    return NextResponse.json({ payload: null });
  }
}
