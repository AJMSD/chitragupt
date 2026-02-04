import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { getAgentBaseUrl, getPrivateAgentHeaders } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) {
    return auth.response;
  }

  const query = request.nextUrl.searchParams.toString();
  const path = query ? `/files/download?${query}` : "/files/download";
  const url = new URL(path, getAgentBaseUrl());

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: getPrivateAgentHeaders(),
    });
  } catch {
    return NextResponse.json({ error: "Agent unavailable" }, { status: 502 });
  }

  if (!response.ok) {
    const error = await readAgentError(response);
    return NextResponse.json({ error }, { status: response.status });
  }

  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  const disposition = response.headers.get("content-disposition");
  const contentLength = response.headers.get("content-length");

  if (contentType) headers.set("content-type", contentType);
  if (disposition) headers.set("content-disposition", disposition);
  if (contentLength) headers.set("content-length", contentLength);

  return new NextResponse(response.body, { status: response.status, headers });
}

async function readAgentError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) return payload.error;
    }
    const text = await response.text();
    return text || "Agent request failed";
  } catch {
    return "Agent request failed";
  }
}
