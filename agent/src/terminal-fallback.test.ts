import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTerminalFallbackAttempts,
  resolveFallbackShellArgs,
} from "./terminal-fallback";

test("resolveFallbackShellArgs prefers interactive flags for known shells", () => {
  assert.deepEqual(resolveFallbackShellArgs("/bin/bash"), [["-i"], []]);
  assert.deepEqual(resolveFallbackShellArgs("zsh"), [[], ["-i"]]);
  assert.deepEqual(resolveFallbackShellArgs("fish"), [["-i"], []]);
});

test("resolveFallbackShellArgs keeps unknown shells conservative", () => {
  assert.deepEqual(resolveFallbackShellArgs("/custom/shell"), [[]]);
});

test("buildTerminalFallbackAttempts prioritizes pipe-friendly shells with retries", () => {
  const attempts = buildTerminalFallbackAttempts([
    "/bin/zsh",
    "/custom/shell",
    "/bin/bash",
  ]);
  assert.deepEqual(attempts, [
    { shell: "/bin/bash", args: ["-i"] },
    { shell: "/bin/bash", args: [] },
    { shell: "/bin/zsh", args: [] },
    { shell: "/bin/zsh", args: ["-i"] },
    { shell: "/custom/shell", args: [] },
  ]);
});
