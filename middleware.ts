import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/fireflies/webhook"];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (isPublic) return NextResponse.next();

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/api/")) {
    const token = request.cookies.get("auth_token")?.value;

    if (!token) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const payload = verifyToken(token);
    if (!payload) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Attach user info to headers for downstream consumption
    const headers = new Headers(request.headers);
    headers.set("x-user-id", payload.userId);
    headers.set("x-user-role", payload.role);
    headers.set("x-user-email", payload.email);

    return NextResponse.next({ request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
