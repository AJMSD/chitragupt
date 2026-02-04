import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  createSessionToken,
  getSafeRedirectPath,
  getSessionCookieSettings,
  isAuthConfigured,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const formData = await request.formData();
  const password = formData.get("password")?.toString() ?? "";
  const nextTarget = getSafeRedirectPath(
    formData.get("next")?.toString() ?? ""
  );

  if (!isAuthConfigured()) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "config");
    return NextResponse.redirect(url, 303);
  }

  const valid = await verifyPassword(password);
  if (!valid) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "invalid");
    url.searchParams.set("next", nextTarget);
    return NextResponse.redirect(url, 303);
  }

  const token = await createSessionToken();
  if (!token) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "config");
    return NextResponse.redirect(url, 303);
  }

  const response = NextResponse.redirect(new URL(nextTarget, origin), 303);
  response.cookies.set({
    ...getSessionCookieSettings(),
    value: token,
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
