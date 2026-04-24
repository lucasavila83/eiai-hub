/**
 * Web Share Target endpoint.
 *
 * Manifest.json declares this URL as the share_target action. When the
 * user shares files/text/url from an Android app to the installed PWA,
 * the browser POSTs multipart/form-data here. We:
 *
 *   1. Verify the user is authenticated (session cookie).
 *   2. Upload every shared file to the `chat-files` bucket under
 *      `share-inbox/<user>/<timestamp>/…` so we have a real URL to
 *      point at later.
 *   3. Stash the list of uploaded files + shared text/url in a short-
 *      lived cookie (`__share_payload`).
 *   4. Redirect (303 See Other) to `/share`, which reads the cookie
 *      and shows the "where do you want to put this?" picker.
 *
 * GET requests just bounce back to /share so the user can't land on
 * an empty POST-only endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE_NAME = "__share_payload";
const COOKIE_MAX_AGE = 10 * 60; // 10 minutes

export async function GET() {
  return NextResponse.redirect(new URL("/share", process.env.NEXT_PUBLIC_SITE_URL || "https://hub.eiai.com.br"));
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Not logged in — let them log in first and we'll handle the share
    // after. We lose the files in this case (the browser won't re-POST
    // after login), but this is the rare case.
    return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.redirect(new URL("/share?err=bad-form", req.url), { status: 303 });
  }

  const title = (form.get("title") as string | null) || "";
  const text = (form.get("text") as string | null) || "";
  const url = (form.get("url") as string | null) || "";
  const files = form.getAll("files").filter((v) => v instanceof File) as File[];

  const ts = Date.now();
  const baseDir = `share-inbox/${user.id}/${ts}`;

  type StagedFile = {
    path: string;
    name: string;
    size: number;
    type: string;
    publicUrl: string;
  };
  const staged: StagedFile[] = [];

  for (const f of files) {
    if (!f || f.size === 0) continue;
    const safeName = (f.name || "arquivo").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${baseDir}/${safeName}`;

    const arrayBuffer = await f.arrayBuffer();
    const { error: uploadErr } = await supabase.storage
      .from("chat-files")
      .upload(path, Buffer.from(arrayBuffer), {
        contentType: f.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadErr) {
      // eslint-disable-next-line no-console
      console.warn("[share] upload failed:", uploadErr);
      continue;
    }
    const { data: pub } = supabase.storage.from("chat-files").getPublicUrl(path);
    staged.push({
      path,
      name: f.name || safeName,
      size: f.size,
      type: f.type || "application/octet-stream",
      publicUrl: pub.publicUrl,
    });
  }

  const payload = {
    title,
    text,
    url,
    files: staged,
    createdAt: ts,
  };

  // Build the redirect *on the same origin as the request* so Chrome's
  // Share-Target flow doesn't trip the "cross-origin redirect" block.
  const res = NextResponse.redirect(new URL("/share", req.url), { status: 303 });
  res.cookies.set({
    name: COOKIE_NAME,
    value: Buffer.from(JSON.stringify(payload)).toString("base64"),
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
