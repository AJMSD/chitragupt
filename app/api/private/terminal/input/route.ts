import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { agentFetchJson } from "@/lib/agent";
import type { TerminalInputResponse } from "@/lib/types";
import { parseJsonBody, validateInputBody } from "../validation";

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

  const validated = validateInputBody(parsed.data);
  if (!validated.ok) {
    return validated.response;
  }

  const result = await agentFetchJson<TerminalInputResponse>("/terminal/input", {
    private: true,
    method: "POST",
    body: validated.data,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: 200 });
}
