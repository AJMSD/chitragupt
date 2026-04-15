import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { FilesZipDownloadRequest } from "@/lib/types";

type ValidationSuccess<T> = {
  ok: true;
  data: T;
};

type ValidationFailure = {
  ok: false;
  response: NextResponse;
};

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function parseJsonBody(
  request: NextRequest
): Promise<ValidationResult<Record<string, unknown>>> {
  try {
    const body = await request.json();
    if (!isRecord(body)) {
      return { ok: false, response: badRequest("Invalid JSON payload") };
    }
    return { ok: true, data: body };
  } catch {
    return { ok: false, response: badRequest("Invalid JSON payload") };
  }
}

export function validateZipDownloadBody(
  body: Record<string, unknown>
): ValidationResult<FilesZipDownloadRequest> {
  const root = typeof body.root === "string" ? body.root.trim() : "";
  if (!root) {
    return { ok: false, response: badRequest("root is required") };
  }

  if (!Array.isArray(body.paths) || body.paths.length === 0) {
    return { ok: false, response: badRequest("paths must be a non-empty array") };
  }

  const dedupedPaths: string[] = [];
  const seenPaths = new Set<string>();
  for (const item of body.paths) {
    if (typeof item !== "string") {
      return { ok: false, response: badRequest("paths must contain only strings") };
    }

    const path = item.trim();
    if (!path) {
      return { ok: false, response: badRequest("paths must not contain empty values") };
    }

    if (!seenPaths.has(path)) {
      seenPaths.add(path);
      dedupedPaths.push(path);
    }
  }

  if (dedupedPaths.length === 0) {
    return { ok: false, response: badRequest("paths must contain at least one value") };
  }

  return {
    ok: true,
    data: {
      root,
      paths: dedupedPaths,
    },
  };
}
