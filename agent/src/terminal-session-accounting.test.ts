import assert from "node:assert/strict";
import test from "node:test";
import {
  countActiveSessions,
  hasReachedSessionLimit,
  type SessionLike,
} from "./terminal-session-accounting";

function session(closedAt: number | null): SessionLike {
  return { closedAt };
}

test("countActiveSessions counts only open sessions", () => {
  const sessions = [session(null), session(1700), session(null), session(2200)];
  assert.equal(countActiveSessions(sessions), 2);
});

test("hasReachedSessionLimit ignores closed sessions in replay window", () => {
  const sessions = [session(null), session(1700), session(2200)];
  assert.equal(hasReachedSessionLimit(sessions, 2), false);
});

test("hasReachedSessionLimit still enforces active session cap", () => {
  const sessions = [session(null), session(null), session(1700)];
  assert.equal(hasReachedSessionLimit(sessions, 2), true);
});