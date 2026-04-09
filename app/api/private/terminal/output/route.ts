import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { agentFetchJson } from "@/lib/agent";
import type { TerminalOutputResponse } from "@/lib/types";
import { validateOutputQuery } from "../validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) {
    return auth.response;
  }

  const validated = validateOutputQuery(request);
  if (!validated.ok) {
    return validated.response;
  }

  const query = new URLSearchParams({
    sessionId: validated.data.sessionId,
    ...(validated.data.cursor !== undefined
      ? { cursor: String(validated.data.cursor) }
      : {}),
  }).toString();
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
