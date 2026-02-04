import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { agentFetchJson } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) {
    return auth.response;
  }

  const query = request.nextUrl.searchParams.toString();
  const path = query ? `/logs/tail?${query}` : "/logs/tail";
  const result = await agentFetchJson<Record<string, unknown>>(path, {
    private: true,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: 200 });
}
