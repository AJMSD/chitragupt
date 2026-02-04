import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookieSettings } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(
    new URL("/login", getRequestOrigin(request)),
    303
  );
  response.cookies.set({
    ...getSessionCookieSettings(),
    value: "",
    maxAge: 0,
  });
  return response;
}

function getRequestOrigin(request: NextRequest): string {
  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = forwardedProto
    ? forwardedProto.split(",")[0].trim()
    : request.nextUrl.protocol.replace(":", "");

  if (forwardedHost) {
    return `${proto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}
