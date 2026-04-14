import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type {
  TerminalCloseRequest,
  TerminalInputRequest,
  TerminalOutputRequest,
  TerminalResizeRequest,
  TerminalSessionCreateRequest,
} from "@/lib/types";

const MIN_COLS = 40;
const MAX_COLS = 240;
const MIN_ROWS = 12;
const MAX_ROWS = 80;
const MAX_INPUT_BYTES = 16 * 1024;

type ValidationSuccess<T> = {
  ok: true;
  data: T;
};

type ValidationFailure = {
  ok: false;
  response: NextResponse;
};

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return (
    isFiniteNumber(value) &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function getTrimmedSessionId(value: unknown): string | null {
  if (!isString(value)) {
    return null;
  }
  const sessionId = value.trim();
  return sessionId.length > 0 ? sessionId : null;
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

export function validateSessionCreateBody(
  body: Record<string, unknown>
): ValidationResult<TerminalSessionCreateRequest> {
  const cols = body.cols;
  const rows = body.rows;

  if (cols !== undefined && !isIntegerInRange(cols, MIN_COLS, MAX_COLS)) {
    return {
      ok: false,
      response: badRequest(`cols must be an integer between ${MIN_COLS} and ${MAX_COLS}`),
    };
  }

  if (rows !== undefined && !isIntegerInRange(rows, MIN_ROWS, MAX_ROWS)) {
    return {
      ok: false,
      response: badRequest(`rows must be an integer between ${MIN_ROWS} and ${MAX_ROWS}`),
    };
  }

  return {
    ok: true,
    data: {
      ...(cols !== undefined ? { cols } : {}),
      ...(rows !== undefined ? { rows } : {}),
    },
  };
}

export function validateInputBody(
  body: Record<string, unknown>
): ValidationResult<TerminalInputRequest> {
  const sessionId = getTrimmedSessionId(body.sessionId);
  if (!sessionId) {
    return { ok: false, response: badRequest("sessionId is required") };
  }

  if (!isString(body.input)) {
    return { ok: false, response: badRequest("input must be a string") };
  }

  const byteLength = Buffer.byteLength(body.input, "utf8");
  if (byteLength > MAX_INPUT_BYTES) {
    return {
      ok: false,
      response: badRequest(`input exceeds ${MAX_INPUT_BYTES} bytes`),
    };
  }

  return {
    ok: true,
    data: {
      sessionId,
      input: body.input,
    },
  };
}

export function validateResizeBody(
  body: Record<string, unknown>
): ValidationResult<TerminalResizeRequest> {
  const sessionId = getTrimmedSessionId(body.sessionId);
  if (!sessionId) {
    return { ok: false, response: badRequest("sessionId is required") };
  }

  if (!isIntegerInRange(body.cols, MIN_COLS, MAX_COLS)) {
    return {
      ok: false,
      response: badRequest(`cols must be an integer between ${MIN_COLS} and ${MAX_COLS}`),
    };
  }

  if (!isIntegerInRange(body.rows, MIN_ROWS, MAX_ROWS)) {
    return {
      ok: false,
      response: badRequest(`rows must be an integer between ${MIN_ROWS} and ${MAX_ROWS}`),
    };
  }

  return {
    ok: true,
    data: {
      sessionId,
      cols: body.cols,
      rows: body.rows,
    },
  };
}

export function validateCloseBody(
  body: Record<string, unknown>
): ValidationResult<TerminalCloseRequest> {
  const sessionId = getTrimmedSessionId(body.sessionId);
  if (!sessionId) {
    return { ok: false, response: badRequest("sessionId is required") };
  }

  return {
    ok: true,
    data: { sessionId },
  };
}

export function validateOutputQuery(request: NextRequest): ValidationResult<TerminalOutputRequest> {
  const sessionId = getTrimmedSessionId(request.nextUrl.searchParams.get("sessionId"));
  if (!sessionId) {
    return { ok: false, response: badRequest("sessionId is required") };
  }

  const cursorRaw = request.nextUrl.searchParams.get("cursor");
  if (cursorRaw === null || cursorRaw.length === 0) {
    return { ok: true, data: { sessionId } };
  }

  const cursor = Number(cursorRaw);
  if (!Number.isInteger(cursor) || cursor < 0) {
    return { ok: false, response: badRequest("cursor must be a non-negative integer") };
  }

  return {
    ok: true,
    data: {
      sessionId,
      cursor,
    },
  };
}
