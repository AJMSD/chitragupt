import assert from "node:assert/strict";
import test from "node:test";
import {
  canStartLifecycleAction,
  shouldProcessPollResult,
} from "./lifecycle";

test("canStartLifecycleAction blocks concurrent starts", () => {
  assert.equal(canStartLifecycleAction(false), true);
  assert.equal(canStartLifecycleAction(true), false);
});

test("shouldProcessPollResult accepts current mounted session", () => {
  const accepted = shouldProcessPollResult({
    mounted: true,
    currentSessionId: "session-1",
    polledSessionId: "session-1",
  });
  assert.equal(accepted, true);
});

test("shouldProcessPollResult rejects stale or unmounted poll", () => {
  const stale = shouldProcessPollResult({
    mounted: true,
    currentSessionId: "session-2",
    polledSessionId: "session-1",
  });
  const unmounted = shouldProcessPollResult({
    mounted: false,
    currentSessionId: "session-1",
    polledSessionId: "session-1",
  });

  assert.equal(stale, false);
  assert.equal(unmounted, false);
});