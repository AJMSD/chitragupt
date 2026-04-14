import assert from "node:assert/strict";
import test from "node:test";
import { formatTerminalApiError, isTerminalSessionUnavailable } from "./errors";

test("isTerminalSessionUnavailable detects closed or missing session", () => {
  assert.equal(
    isTerminalSessionUnavailable({ status: 404, message: "Unknown terminal session" }),
    true
  );
  assert.equal(
    isTerminalSessionUnavailable({ status: 409, message: "Terminal session is closed" }),
    true
  );
  assert.equal(
    isTerminalSessionUnavailable({ status: 429, message: "Too many active terminal sessions" }),
    true
  );
  assert.equal(
    isTerminalSessionUnavailable({ status: 500, message: "Internal error" }),
    false
  );
});

test("formatTerminalApiError returns actionable terminal messages", () => {
  assert.equal(
    formatTerminalApiError({ status: 404, message: "Unknown terminal session" }),
    "No active terminal session. Reconnect and try again."
  );
  assert.equal(
    formatTerminalApiError({ status: 409, message: "Terminal session is closed" }),
    "No active terminal session. Reconnect and try again."
  );
  assert.equal(
    formatTerminalApiError({ status: 413, message: "Terminal input too large" }),
    "Terminal input exceeds the allowed size."
  );
  assert.equal(
    formatTerminalApiError({ status: 429, message: "Too many active terminal sessions" }),
    "Too many active terminal sessions. Wait a moment, then reconnect."
  );
});
