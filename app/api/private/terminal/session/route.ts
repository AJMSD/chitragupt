import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { agentFetchJson } from "@/lib/agent";
import type {
  TerminalSessionCreateRequest,
  TerminalSessionCreateResponse,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as TerminalSessionCreateRequest;
  const result = await agentFetchJson<TerminalSessionCreateResponse>(
    "/terminal/session",
    {
      private: true,
      method: "POST",
      body,
      timeoutMs: 8000,
    }
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: 200 });
}
