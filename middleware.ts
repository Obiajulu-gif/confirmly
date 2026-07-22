import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "confirmly_session";

/**
 * Protects the merchant dashboard. Webhooks, public receipt pages and the
 * landing page are intentionally NOT matched — provider callbacks must never
 * be redirected to a login screen.
 */
export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "next",
    request.nextUrl.pathname + request.nextUrl.search
  );

  if (!token || !process.env.AUTH_SECRET) {
    return NextResponse.redirect(loginUrl);
  }
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.AUTH_SECRET),
      { issuer: "confirmly" }
    );
    // Defence in depth for the platform admin console: the layout's
    // getAdminSession() is the authoritative gate, but block non-admins here
    // too so admin pages never even render for them.
    if (request.nextUrl.pathname.startsWith("/admin")) {
      const allowlist = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
      const email =
        typeof payload.email === "string" ? payload.email.toLowerCase() : "";
      if (!email || !allowlist.includes(email)) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
