import type { ApiError } from "@/lib/client";
import { formatApiError } from "@/lib/client";

export function isTerminalSessionUnavailable(error: ApiError): boolean {
  return error.status === 404 || error.status === 409 || error.status === 429;
}

export function formatTerminalApiError(error: ApiError): string {
  if (error.status === 404 || error.status === 409) {
    return "No active terminal session. Reconnect and try again.";
  }
  if (error.status === 429) {
    return "Too many active terminal sessions. Wait a moment, then reconnect.";
  }
  if (error.status === 413) {
    return "Terminal input exceeds the allowed size.";
  }
  return formatApiError(error);
}