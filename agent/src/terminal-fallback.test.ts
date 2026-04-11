import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTerminalFallbackAttempts,
  normalizeFallbackOutputChunk,
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

test("buildTerminalFallbackAttempts keeps provided shell order with retries", () => {
  const attempts = buildTerminalFallbackAttempts([
    "/bin/zsh",
    "/custom/shell",
    "/bin/bash",
  ]);
  assert.deepEqual(attempts, [
    { shell: "/bin/zsh", args: [] },
    { shell: "/bin/zsh", args: ["-i"] },
    { shell: "/custom/shell", args: [] },
    { shell: "/bin/bash", args: ["-i"] },
    { shell: "/bin/bash", args: [] },
  ]);
});

test("normalizeFallbackOutputChunk converts LF-only output to CRLF", () => {
  assert.equal(normalizeFallbackOutputChunk("a\nb\n"), "a\r\nb\r\n");
});

test("normalizeFallbackOutputChunk preserves existing CRLF", () => {
  assert.equal(normalizeFallbackOutputChunk("a\r\nb\r\n"), "a\r\nb\r\n");
});

test("normalizeFallbackOutputChunk normalizes mixed line endings", () => {
  assert.equal(
    normalizeFallbackOutputChunk("a\nb\r\nc\r\n"),
    "a\r\nb\r\nc\r\n"
  );
});

test("normalizeFallbackOutputChunk preserves ANSI escapes", () => {
  const input = "\x1b[32mok\x1b[0m\n";
  const output = normalizeFallbackOutputChunk(input);
  assert.equal(output, "\x1b[32mok\x1b[0m\r\n");
});
