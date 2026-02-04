import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json(
    { error: "Not implemented" },
    { status: 501 }
  );
}
