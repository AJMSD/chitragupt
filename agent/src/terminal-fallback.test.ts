import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTerminalFallbackAttempts,
  containsSensitiveInputPrompt,
  deriveSensitiveInputExpectedFromOutput,
  inferFallbackCwdFromChunk,
  normalizeFallbackOutputChunk,
  normalizeFallbackCwdCandidate,
  resolveFallbackShellArgs,
  shouldUseFallbackClientEcho,
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

test("shouldUseFallbackClientEcho enables local echo for pipe transport", () => {
  assert.equal(shouldUseFallbackClientEcho("pipe"), true);
});

test("shouldUseFallbackClientEcho disables local echo for script transport", () => {
  assert.equal(shouldUseFallbackClientEcho("script"), false);
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

test("normalizeFallbackCwdCandidate accepts and normalizes absolute paths", () => {
  assert.equal(normalizeFallbackCwdCandidate(" /Users/ajmsd/../ajmsd "), "/Users/ajmsd");
});

test("normalizeFallbackCwdCandidate rejects non-absolute paths", () => {
  assert.equal(normalizeFallbackCwdCandidate("Users/ajmsd"), null);
  assert.equal(normalizeFallbackCwdCandidate("./tmp"), null);
});

test("inferFallbackCwdFromChunk infers cwd from output before prompt boundary", () => {
  const chunk = "pwd\r\n/Users/ajmsd\r\najmsd@host ajmsd $ ";
  assert.equal(inferFallbackCwdFromChunk(chunk), "/Users/ajmsd");
});

test("inferFallbackCwdFromChunk ignores chunks without prompt boundary", () => {
  const chunk = "pwd\r\n/Users/ajmsd\r\n";
  assert.equal(inferFallbackCwdFromChunk(chunk), null);
});

test("inferFallbackCwdFromChunk ignores non-absolute cwd candidates", () => {
  const chunk = "pwd\r\najmsd\r\najmsd@host ajmsd $ ";
  assert.equal(inferFallbackCwdFromChunk(chunk), null);
});

test("inferFallbackCwdFromChunk handles ANSI/control sequences", () => {
  const chunk =
    "\x1b[32mpwd\x1b[0m\r\n\x1b[36m/Users/ajmsd\x1b[0m\r\n\x1b[33majmsd@host ajmsd $ \x1b[0m";
  assert.equal(inferFallbackCwdFromChunk(chunk), "/Users/ajmsd");
});

test("containsSensitiveInputPrompt detects password prompts", () => {
  assert.equal(containsSensitiveInputPrompt("[sudo] password for operator: "), true);
  assert.equal(containsSensitiveInputPrompt("Enter passphrase for key '/tmp/id_ed25519': "), true);
});

test("containsSensitiveInputPrompt ignores normal shell prompt lines", () => {
  assert.equal(containsSensitiveInputPrompt("operator@host chitragupt $ "), false);
});

test("deriveSensitiveInputExpectedFromOutput enables sensitive mode when prompt appears", () => {
  const next = deriveSensitiveInputExpectedFromOutput(false, "Password: ");
  assert.equal(next, true);
});

test("deriveSensitiveInputExpectedFromOutput clears sensitive mode on shell prompt", () => {
  const next = deriveSensitiveInputExpectedFromOutput(true, "operator@host chitragupt $ ");
  assert.equal(next, false);
});

test("deriveSensitiveInputExpectedFromOutput preserves state for regular output", () => {
  const next = deriveSensitiveInputExpectedFromOutput(true, "README.md\r\npackage.json\r\n");
  assert.equal(next, true);
});
