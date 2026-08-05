import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/api/auth", "/api/health", "/api/telegram/webhook", "/auth/signin"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function isAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".json") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".css")
  );
}

function hasSessionCookie(request: NextRequest): boolean {
  return !!(
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value
  );
}

// Verify JWT session token (checks signature + expiry, not just cookie
// existence) — DEV-20260610-0002, same pattern as pd/jf middleware.
function getValidToken(request: NextRequest) {
  return getToken({
    req: request,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NEXTAUTH_URL?.startsWith("https://"),
  });
}

// Routes exempt from the CSRF Origin check: next-auth has its own CSRF
// token; health/webhook authenticate via header secrets, not cookies.
const CSRF_EXEMPT_PREFIXES = ["/api/auth", "/api/health", "/api/telegram/webhook"];

function csrfExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Defence-in-depth CSRF check for state-changing API routes.
 * Blocks only cookie-authenticated requests whose Origin does not match
 * the request Host. Internal calls (x-internal-secret) and cron (bearer)
 * send no session cookie, so they pass through untouched; cookie requests
 * without an Origin header are covered by SameSite=Lax.
 */
function csrfBlocked(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  if (!request.nextUrl.pathname.startsWith("/api/")) return false;
  if (csrfExempt(request.nextUrl.pathname)) return false;
  if (!hasSessionCookie(request)) return false;

  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("host");
  if (!host) return true;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CSRF Origin check (before auth so cross-site POSTs are rejected
  // consistently).
  if (csrfBlocked(request)) {
    return NextResponse.json(
      { error: "CSRF: Origin header does not match Host" },
      { status: 403 },
    );
  }

  // Allow assets
  if (isAsset(pathname)) {
    return NextResponse.next();
  }

  // Allow public paths
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Landing page: authenticated users go to /studio
  if (pathname === "/") {
    if (await getValidToken(request)) {
      return NextResponse.redirect(new URL("/studio", request.url));
    }
    return NextResponse.next();
  }

  // Protected paths: redirect unauthenticated to sign in
  const protectedPaths = ["/studio", "/admin", "/client"];
  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (isProtected) {
    const token = await getValidToken(request);
    if (!token?.sub) {
      const signInUrl = new URL("/auth/signin", request.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  const response = NextResponse.next();

  // Allow /studio to be embedded in iframes from tatiana/tetiana domains
  if (pathname === "/studio" || pathname.startsWith("/studio/")) {
    response.headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'self' https://tatiana.example.com https://tetiana.example.com"
    );
    // Remove X-Frame-Options so CSP frame-ancestors takes precedence
    response.headers.delete("X-Frame-Options");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
