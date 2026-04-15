import assert from "node:assert/strict";
import test from "node:test";
import {
  isSensitiveCommandForHistory,
  prepareRunCommand,
  sanitizeStoredCommandList,
} from "./command-format";

test("prepareRunCommand keeps non-ls commands unchanged", () => {
  const prepared = prepareRunCommand("pwd");
  assert.equal(prepared.display, "pwd");
  assert.equal(prepared.executable, "pwd");
  assert.equal(prepared.hint, null);
});

test("prepareRunCommand adds directory and color flags for ls", () => {
  const prepared = prepareRunCommand("ls src");
  assert.equal(prepared.display, "ls src");
  assert.equal(prepared.executable, "ls -GF src");
  assert.equal(prepared.hint, "Auto-added -GF so directories are easier to spot.");
});

test("prepareRunCommand preserves explicit ls flags", () => {
  const prepared = prepareRunCommand("ls -GF src");
  assert.equal(prepared.executable, "ls -GF src");
  assert.equal(prepared.hint, null);
});

test("isSensitiveCommandForHistory detects secret assignments", () => {
  assert.equal(
    isSensitiveCommandForHistory("export AGENT_TOKEN=super-secret-value"),
    true
  );
  assert.equal(
    isSensitiveCommandForHistory("AUTH_PASSWORD='correct horse battery staple'"),
    true
  );
});

test("isSensitiveCommandForHistory detects secret flags and bearer headers", () => {
  assert.equal(
    isSensitiveCommandForHistory("curl --token abc123 https://example.com"),
    true
  );
  assert.equal(
    isSensitiveCommandForHistory(
      "curl -H 'Authorization: Bearer sk-live-123' https://example.com"
    ),
    true
  );
});

test("isSensitiveCommandForHistory allows interactive password commands", () => {
  assert.equal(isSensitiveCommandForHistory("sudo -i"), false);
  assert.equal(isSensitiveCommandForHistory("mysql -p"), false);
});

test("sanitizeStoredCommandList removes sensitive and duplicate commands", () => {
  const sanitized = sanitizeStoredCommandList([
    " ls -la ",
    "export AGENT_TOKEN=super-secret-value",
    "pwd",
    "ls -la",
    "curl --token abc123 https://example.com",
  ]);

  assert.deepEqual(sanitized, ["ls -la", "pwd"]);
});
