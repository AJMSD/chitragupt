import { NextResponse } from "next/server";
import { agentFetchJson } from "@/lib/agent";
import type { MetricsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await agentFetchJson<MetricsResponse>("/metrics");

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, { status: 200 });
}
