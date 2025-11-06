import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  console.log(`[MIDDLEWARE] Incoming request: ${pathname}`);

  // allow next internals, api and favicon
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    console.log(`[MIDDLEWARE] Skipping internal or API path: ${pathname}`);
    return NextResponse.next();
  }

  const access =
    req.cookies.get("__access")?.value ??
    req.cookies.get("access_token")?.value ??
    null;
  const refresh =
    req.cookies.get("__refresh")?.value ??
    req.cookies.get("refresh_token")?.value ??
    null;

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
    access: !!access,
    refresh: !!refresh,
    isAuthPage,
  });

  // ✅ Authenticated flow
  if (access) {
    console.log(
      "[MIDDLEWARE] Access token found, treating as authenticated user"
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

  // ✅ Attempt silent refresh
  if (!access && refresh) {
    console.log(
      "[MIDDLEWARE] No access token, but refresh token found → attempting silent refresh..."
    );

    try {
      const backendUrl =
        process.env.BACKEND_URL ??
        process.env.NEXT_PUBLIC_API_URL ??
        "http://localhost:8000";

      const refreshRes = await fetch(`${backendUrl}/api/auth/refresh`, {
        method: "GET",
        headers: {
          Cookie: `__refresh=${refresh}`,
          Accept: "application/json",
        },
        credentials: "include",
        cache: "no-store",
      });

      if (refreshRes.ok) {
        console.log(
          "[MIDDLEWARE] Silent refresh succeeded, forwarding cookies"
        );
        const response = NextResponse.next();

        const setCookie = refreshRes.headers.get("set-cookie");
        if (setCookie) {
          const parts = setCookie.split(/,(?=\s*\w+=)/);
          parts.forEach((cookie) =>
            response.headers.append("set-cookie", cookie)
          );
        }

        return response;
      } else {
        console.warn(
          "[MIDDLEWARE] Silent refresh failed with status:",
          refreshRes.status
        );
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(loginUrl);
      }
    } catch (err) {
      console.error("[MIDDLEWARE] Silent refresh threw an error:", err);
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ✅ Unauthenticated but accessing auth pages
  if (!access && !refresh && isAuthPage) {
    console.log(
      "[MIDDLEWARE] Unauthenticated user accessing auth page → allowed"
    );
    return NextResponse.next();
  }

  // ✅ Unauthenticated user trying to access protected route
  if (!access && !refresh && !isAuthPage) {
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
