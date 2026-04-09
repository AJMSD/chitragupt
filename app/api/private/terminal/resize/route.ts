import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { agentFetchJson } from "@/lib/agent";
import type { TerminalResizeRequest, TerminalResizeResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as TerminalResizeRequest;
  const result = await agentFetchJson<TerminalResizeResponse>(
    "/terminal/resize",
    {
      private: true,
      method: "POST",
      body,
    }
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: 200 });
}
