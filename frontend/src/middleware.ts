import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  console.log(`[MIDDLEWARE] Incoming request: ${pathname}`);

  // allow next internals, api and favicon
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    console.log(`[MIDDLEWARE] Skipping internal or API path: ${pathname}`);
    return NextResponse.next();
  }

  const refresh = req.cookies.get("__refresh")?.value ?? null;

  const isAuthPage =
    pathname === "/login" ||
    pathname === "/login/" ||
    pathname === "/register" ||
    pathname === "/register/" ||
    pathname === "/refresh" ||
    pathname === "/refresh/" ||
    pathname === "/auth/refresh" ||
    pathname === "/auth/refresh/" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/(auth)");

  console.log("[MIDDLEWARE] Tokens:", {
    refresh: !!refresh,
    isAuthPage,
  });

  // ✅ Authenticated flow
  if (refresh) {
    console.log(
      "[MIDDLEWARE] Refresh token found, treating as authenticated user"
    );

    if (isAuthPage) {
      console.log(
        "[MIDDLEWARE] Authenticated user trying to access auth page → redirecting home"
      );
      const homeUrl = new URL("/", req.url);
      if (pathname === homeUrl.pathname) return NextResponse.next();
      return NextResponse.redirect(homeUrl);
    }

    console.log("[MIDDLEWARE] Authenticated access allowed");
    return NextResponse.next();
  }

  // ✅ Unauthenticated but accessing auth pages
  if (!refresh && isAuthPage) {
    console.log(
      "[MIDDLEWARE] Unauthenticated user accessing auth page → allowed"
    );
    return NextResponse.next();
  }

  // ✅ Unauthenticated user trying to access protected route
  if (!refresh && !isAuthPage) {
    console.log("[MIDDLEWARE] No tokens → redirecting to /login");
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    if (loginUrl.pathname === pathname) return NextResponse.next();
    return NextResponse.redirect(loginUrl);
  }

  // fallback (should never happen)
  console.warn("[MIDDLEWARE] Fallback: continuing request without match");
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|images|fonts|assets|logo.svg).*)"],
};
