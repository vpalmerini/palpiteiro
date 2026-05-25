import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "bolao_session";

// Routes that require any authenticated user
const AUTH_ROUTES = ["/pools/new", "/meus-boloes"];

// Route prefixes that require any authenticated user
const AUTH_PREFIXES = ["/pools/"];

// Suffix patterns within prefixes that require auth
const AUTH_SUFFIX_PATTERNS = ["/predictions"];

// Routes that require admin (checked client-side; middleware just ensures login)
const ADMIN_ROUTES = ["/admin"];

function isProtected(pathname: string): boolean {
  if (AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return true;
  }
  if (ADMIN_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return true;
  }
  for (const prefix of AUTH_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const rest = pathname.slice(prefix.length);
      // Only protect sub-paths that match known authenticated suffixes
      // e.g. /pools/[slug]/predictions — not /pools/[slug] itself (public)
      if (AUTH_SUFFIX_PATTERNS.some((s) => rest.includes(s))) {
        return true;
      }
    }
  }
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const hasSession = !!request.cookies.get(COOKIE_NAME)?.value;
  if (hasSession) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder
     * - API routes
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
