import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — skip auth check entirely
  const publicRoutes = ["/login", "/register", "/invite"];
  const isPublic = publicRoutes.some((r) => pathname.startsWith(r));
  const isApi = pathname.startsWith("/api/");

  // Quick check: if no Supabase auth cookie exists, redirect to login
  // This avoids calling getUser() when we know there's no session
  const hasAuthCookie = request.cookies.getAll().some(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  if (!hasAuthCookie && !isPublic && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // For authenticated requests, refresh the session
  if (hasAuthCookie) {
    return await updateSession(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
