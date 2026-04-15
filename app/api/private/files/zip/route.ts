import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { getAgentBaseUrl, getPrivateAgentHeaders } from "@/lib/agent";
import { parseJsonBody, validateZipDownloadBody } from "../validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) {
    return auth.response;
  }

  const query = request.nextUrl.searchParams.toString();
  const path = query ? `/files/zip?${query}` : "/files/zip";

  return proxyZipRequest(path, { method: "GET" });
}

export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const validated = validateZipDownloadBody(parsed.data);
  if (!validated.ok) {
    return validated.response;
  }

  return proxyZipRequest("/files/zip", {
    method: "POST",
    body: validated.data,
  });
}

async function proxyZipRequest(
  path: string,
  options: {
    method: "GET" | "POST";
    body?: unknown;
  }
): Promise<NextResponse> {
  const url = new URL(path, getAgentBaseUrl());
  const headers = new Headers(getPrivateAgentHeaders());
  if (options.method === "POST") {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    return NextResponse.json({ error: "Agent unavailable" }, { status: 502 });
  }

  if (!response.ok) {
    const error = await readAgentError(response);
    return NextResponse.json({ error }, { status: response.status });
  }

  const relayHeaders = new Headers();
  const contentType = response.headers.get("content-type");
  const disposition = response.headers.get("content-disposition");
  const contentLength = response.headers.get("content-length");

  if (contentType) relayHeaders.set("content-type", contentType);
  if (disposition) relayHeaders.set("content-disposition", disposition);
  if (contentLength) relayHeaders.set("content-length", contentLength);

  return new NextResponse(response.body, {
    status: response.status,
    headers: relayHeaders,
  });
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
