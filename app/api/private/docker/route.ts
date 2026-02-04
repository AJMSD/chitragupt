import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { agentFetchJson } from "@/lib/agent";
import type { DockerContainersResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) {
    return auth.response;
  }

  const result = await agentFetchJson<DockerContainersResponse>(
    "/docker/containers",
    { private: true }
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: 200 });
}
