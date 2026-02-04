import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/auth";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

type RequireSessionSuccess = {
  ok: true;
  session: SessionPayload;
};

type RequireSessionFailure = {
  ok: false;
  response: NextResponse;
};

export async function requireSession(): Promise<
  RequireSessionSuccess | RequireSessionFailure
> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, session };
}
