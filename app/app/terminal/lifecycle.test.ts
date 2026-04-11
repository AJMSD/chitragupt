import assert from "node:assert/strict";
import test from "node:test";
import {
  canStartLifecycleAction,
  didFallbackCdCommandFail,
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

test("didFallbackCdCommandFail detects common shell cd failures", () => {
  assert.equal(
    didFallbackCdCommandFail("zsh: cd: Downloads: no such file or directory"),
    true
  );
  assert.equal(
    didFallbackCdCommandFail("bash: cd: /tmp/file.txt: Not a directory"),
    true
  );
  assert.equal(
    didFallbackCdCommandFail("cd: permission denied: /root"),
    true
  );
});

test("didFallbackCdCommandFail ignores unrelated output", () => {
  assert.equal(didFallbackCdCommandFail("README.md\npackage.json"), false);
  assert.equal(didFallbackCdCommandFail("command not found: foo"), false);
});