import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { agentFetchJson } from "@/lib/agent";
import type { TerminalOutputResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) {
    return auth.response;
  }

  const query = request.nextUrl.searchParams.toString();
  const path = query ? `/terminal/output?${query}` : "/terminal/output";
  const result = await agentFetchJson<TerminalOutputResponse>(path, {
    private: true,
    timeoutMs: 8000,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: 200 });
}
