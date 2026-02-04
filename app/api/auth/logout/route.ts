import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookieSettings } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set({
    ...getSessionCookieSettings(),
    value: "",
    maxAge: 0,
  });
  return response;
}
