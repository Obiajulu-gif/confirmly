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
    await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET), {
      issuer: "confirmly",
    });
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
