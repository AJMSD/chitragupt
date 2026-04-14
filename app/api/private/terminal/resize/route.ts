import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { agentFetchJson } from "@/lib/agent";
import type { TerminalResizeResponse } from "@/lib/types";
import { parseJsonBody, validateResizeBody } from "../validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const validated = validateResizeBody(parsed.data);
  if (!validated.ok) {
    return validated.response;
  }

  const result = await agentFetchJson<TerminalResizeResponse>(
    "/terminal/resize",
    {
      private: true,
      method: "POST",
      body: validated.data,
    }
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: 200 });
}
