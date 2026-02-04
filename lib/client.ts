"use client";

export type ApiError = {
  status: number;
  message: string;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export async function fetchJson<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, { cache: "no-store", ...init });
  } catch {
    return {
      ok: false,
      error: { status: 502, message: "Ops agent unavailable" },
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown = null;
  try {
    payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error?: string }).error ?? "Request failed")
        : typeof payload === "string" && payload.length > 0
        ? payload
        : response.statusText || "Request failed";
    return {
      ok: false,
      error: { status: response.status, message },
    };
  }

  return { ok: true, data: payload as T };
}

export function formatApiError(error: ApiError): string {
  if (error.status === 401) {
    return "Not authorized. Please sign in again.";
  }
  if (error.status === 403) {
    return "Access denied by the ops agent.";
  }
  if (error.status === 404) {
    return "Requested resource was not found.";
  }
  if (error.status >= 500) {
    return "Ops agent unavailable or returned an error.";
  }
  return error.message;
}
