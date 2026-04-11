import assert from "node:assert/strict";
import test from "node:test";
import { prepareRunCommand } from "./command-format";

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
