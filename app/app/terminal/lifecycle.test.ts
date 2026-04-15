import assert from "node:assert/strict";
import test from "node:test";
import {
  canResizeTerminalState,
  canStartLifecycleAction,
  containsSensitiveInputPrompt,
  deriveSensitiveInputExpectedFromOutput,
  didFallbackCdCommandFail,
  getReconnectCooldownRemainingMs,
  normalizeBackendFallbackCwd,
  resolveFallbackCdPromptContext,
  shouldApplyPendingFallbackPromptContext,
  shouldApplyShellDerivedFallbackPrompt,
  shouldRenderFallbackPromptOnClose,
  shouldRenderFallbackPromptOnShellBoundary,
  shouldRenderFallbackPrompt,
  shouldRenderFallbackPromptOnIdle,
  shouldProcessPollResult,
} from "./lifecycle";

test("canStartLifecycleAction blocks concurrent starts", () => {
  assert.equal(canStartLifecycleAction(false), true);
  assert.equal(canStartLifecycleAction(true), false);
});

test("canResizeTerminalState allows active interactive states", () => {
  assert.equal(canResizeTerminalState("ready"), true);
  assert.equal(canResizeTerminalState("running"), true);
});

test("canResizeTerminalState blocks non-interactive states", () => {
  assert.equal(canResizeTerminalState("connecting"), false);
  assert.equal(canResizeTerminalState("closed"), false);
  assert.equal(canResizeTerminalState("error"), false);
});

test("getReconnectCooldownRemainingMs returns zero when cooldown elapsed", () => {
  const remaining = getReconnectCooldownRemainingMs(2_000, 1_500);
  assert.equal(remaining, 0);
});

test("getReconnectCooldownRemainingMs returns positive remaining cooldown", () => {
  const remaining = getReconnectCooldownRemainingMs(1_500, 2_000);
  assert.equal(remaining, 500);
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

test("shouldRenderFallbackPrompt renders prompt when shell boundary is detected", () => {
  const shouldRender = shouldRenderFallbackPrompt({
    isFallbackMode: true,
    isPromptVisible: true,
    promptedByShellBoundary: true,
  });

  assert.equal(shouldRender, true);
});

test("shouldRenderFallbackPrompt suppresses idle duplicate prompts", () => {
  const shouldRender = shouldRenderFallbackPrompt({
    isFallbackMode: true,
    isPromptVisible: true,
    promptedByShellBoundary: false,
  });

  assert.equal(shouldRender, false);
});

test("shouldRenderFallbackPromptOnIdle renders when waiting with observed output", () => {
  const shouldRender = shouldRenderFallbackPromptOnIdle({
    isFallbackMode: true,
    isPromptVisible: false,
    isAwaitingPrompt: true,
    sawOutputWhileAwaiting: true,
    hasPendingPromptContext: false,
  });

  assert.equal(shouldRender, true);
});

test("shouldRenderFallbackPromptOnIdle avoids speculative prompt before output", () => {
  const shouldRender = shouldRenderFallbackPromptOnIdle({
    isFallbackMode: true,
    isPromptVisible: false,
    isAwaitingPrompt: true,
    sawOutputWhileAwaiting: false,
    hasPendingPromptContext: false,
  });

  assert.equal(shouldRender, false);
});

test("shouldRenderFallbackPromptOnIdle renders for pending cd context", () => {
  const shouldRender = shouldRenderFallbackPromptOnIdle({
    isFallbackMode: true,
    isPromptVisible: false,
    isAwaitingPrompt: true,
    sawOutputWhileAwaiting: false,
    hasPendingPromptContext: true,
  });

  assert.equal(shouldRender, true);
});

test("shouldRenderFallbackPromptOnIdle suppresses startup prompt during grace polls", () => {
  const shouldRender = shouldRenderFallbackPromptOnIdle({
    isFallbackMode: true,
    isPromptVisible: false,
    isAwaitingPrompt: false,
    sawOutputWhileAwaiting: false,
    hasPendingPromptContext: false,
    isAwaitingStartupPrompt: true,
    startupEmptyPolls: 1,
  });

  assert.equal(shouldRender, false);
});

test("shouldRenderFallbackPromptOnIdle allows startup prompt after grace polls", () => {
  const shouldRender = shouldRenderFallbackPromptOnIdle({
    isFallbackMode: true,
    isPromptVisible: false,
    isAwaitingPrompt: false,
    sawOutputWhileAwaiting: false,
    hasPendingPromptContext: false,
    isAwaitingStartupPrompt: true,
    startupEmptyPolls: 2,
  });

  assert.equal(shouldRender, true);
});

test("shouldRenderFallbackPromptOnClose renders when fallback prompt is hidden", () => {
  const shouldRender = shouldRenderFallbackPromptOnClose({
    isFallbackMode: true,
    isPromptVisible: false,
  });

  assert.equal(shouldRender, true);
});

test("shouldRenderFallbackPromptOnClose suppresses duplicate visible prompt", () => {
  const shouldRender = shouldRenderFallbackPromptOnClose({
    isFallbackMode: true,
    isPromptVisible: true,
  });

  assert.equal(shouldRender, false);
});

test("shouldRenderFallbackPromptOnShellBoundary suppresses duplicate prompt-only shell boundary", () => {
  const shouldRender = shouldRenderFallbackPromptOnShellBoundary({
    isFallbackMode: true,
    isPromptVisible: true,
    isAwaitingPrompt: false,
    hasOutputContent: false,
  });

  assert.equal(shouldRender, false);
});

test("shouldRenderFallbackPromptOnShellBoundary renders when waiting for command completion", () => {
  const shouldRender = shouldRenderFallbackPromptOnShellBoundary({
    isFallbackMode: true,
    isPromptVisible: true,
    isAwaitingPrompt: true,
    hasOutputContent: false,
  });

  assert.equal(shouldRender, true);
});

test("shouldRenderFallbackPromptOnShellBoundary renders when boundary carries output", () => {
  const shouldRender = shouldRenderFallbackPromptOnShellBoundary({
    isFallbackMode: true,
    isPromptVisible: true,
    isAwaitingPrompt: false,
    hasOutputContent: true,
  });

  assert.equal(shouldRender, true);
});

test("normalizeBackendFallbackCwd accepts absolute backend cwd metadata", () => {
  assert.equal(normalizeBackendFallbackCwd("/Users/ajmsd"), "/Users/ajmsd");
  assert.equal(normalizeBackendFallbackCwd("  /Users/ajmsd  "), "/Users/ajmsd");
});

test("normalizeBackendFallbackCwd rejects missing or relative metadata", () => {
  assert.equal(normalizeBackendFallbackCwd(undefined), null);
  assert.equal(normalizeBackendFallbackCwd(""), null);
  assert.equal(normalizeBackendFallbackCwd("Users/ajmsd"), null);
});

test("shouldApplyShellDerivedFallbackPrompt prefers backend cwd metadata", () => {
  const shouldApply = shouldApplyShellDerivedFallbackPrompt(
    "/Users/ajmsd",
    "ajmsd@host ajmsd $ "
  );

  assert.equal(shouldApply, false);
});

test("shouldApplyShellDerivedFallbackPrompt applies shell prompt when metadata missing", () => {
  const shouldApply = shouldApplyShellDerivedFallbackPrompt(
    null,
    "ajmsd@host ajmsd $ "
  );

  assert.equal(shouldApply, true);
});

test("shouldApplyShellDerivedFallbackPrompt applies shell prompt while awaiting command completion", () => {
  const shouldApply = shouldApplyShellDerivedFallbackPrompt(
    "/Users/ajmsd/chitragupt",
    "ajmsd@host Downloads $ ",
    true
  );

  assert.equal(shouldApply, true);
});

test("shouldApplyPendingFallbackPromptContext applies successful pending cd context", () => {
  const shouldApply = shouldApplyPendingFallbackPromptContext({
    isAwaitingPrompt: true,
    hasPendingPromptContext: true,
    pendingPromptFailed: false,
  });

  assert.equal(shouldApply, true);
});

test("shouldApplyPendingFallbackPromptContext suppresses failed pending cd context", () => {
  const shouldApply = shouldApplyPendingFallbackPromptContext({
    isAwaitingPrompt: true,
    hasPendingPromptContext: true,
    pendingPromptFailed: true,
  });

  assert.equal(shouldApply, false);
});

test("resolveFallbackCdPromptContext resolves cd .. relative to current cwd", () => {
  const next = resolveFallbackCdPromptContext(
    {
      cwd: "/Users/ajmsd/chitragupt",
      previousCwd: "/Users/ajmsd",
    },
    "cd .."
  );

  assert.deepEqual(next, {
    cwd: "/Users/ajmsd",
    previousCwd: "/Users/ajmsd/chitragupt",
  });
});

test("resolveFallbackCdPromptContext ignores non-standalone cd commands", () => {
  const next = resolveFallbackCdPromptContext(
    {
      cwd: "/Users/ajmsd/chitragupt",
      previousCwd: "/Users/ajmsd",
    },
    "cd .. && pwd"
  );

  assert.equal(next, null);
});

test("containsSensitiveInputPrompt detects sudo password prompts", () => {
  const detected = containsSensitiveInputPrompt("[sudo] password for operator: ");
  assert.equal(detected, true);
});

test("containsSensitiveInputPrompt ignores regular shell prompts", () => {
  const detected = containsSensitiveInputPrompt("operator@host chitragupt $ ");
  assert.equal(detected, false);
});

test("deriveSensitiveInputExpectedFromOutput enables sensitive mode on password prompt", () => {
  const next = deriveSensitiveInputExpectedFromOutput(
    false,
    "Enter password: "
  );
  assert.equal(next, true);
});

test("deriveSensitiveInputExpectedFromOutput clears sensitive mode on shell prompt", () => {
  const next = deriveSensitiveInputExpectedFromOutput(
    true,
    "operator@host chitragupt $ "
  );
  assert.equal(next, false);
});

test("deriveSensitiveInputExpectedFromOutput preserves existing state for normal output", () => {
  const next = deriveSensitiveInputExpectedFromOutput(
    true,
    "README.md\r\npackage.json\r\n"
  );
  assert.equal(next, true);
});