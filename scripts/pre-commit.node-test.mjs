import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runGate } from "./pre-commit.mjs";

test("clean tracked files run checks and propagate success, failure and missing tools", () => {
  for (const result of [
    { status: 0 },
    { status: 1 },
    { status: null, error: new Error("missing") },
  ]) {
    const calls = [];
    const status = runGate((command, args) => {
      calls.push([command, args]);
      return calls.length === 1 ? { status: 0 } : result;
    });
    assert.deepEqual(calls, [
      ["git", ["diff", "--quiet", "--ignore-submodules", "--"]],
      ["corepack", ["pnpm", "quality:commit"]],
    ]);
    assert.equal(status, result.status === 0 ? 0 : 1);
  }
});

test("unstaged edits and Git errors block before running checks", () => {
  for (const result of [{ status: 1 }, { status: 128 }, { status: null }]) {
    let calls = 0;
    assert.equal(
      runGate(() => {
        calls += 1;
        return result;
      }),
      1,
    );
    assert.equal(calls, 1);
  }
});

test("installer handles archives, repeat setup and custom hooks", () => {
  const root = mkdtempSync(join(tmpdir(), "loongdun-hooks-"));
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, ".githooks"));
    for (const file of ["scripts/install-hooks.mjs", ".githooks/pre-commit"]) {
      copyFileSync(new URL(`../${file}`, import.meta.url), join(root, file));
    }
    const install = () => spawnSync(process.execPath, [join(root, "scripts/install-hooks.mjs")]);
    assert.equal(install().status, 0);
    const initialized = git("init");
    assert.equal(initialized.status, 0, initialized.stderr);
    assert.equal(install().status, 0);
    assert.equal(install().status, 0);
    assert.equal(git("config", "--local", "--get", "core.hooksPath").stdout.trim(), ".githooks");
    assert.equal(git("config", "--local", "core.hooksPath", "custom-hooks").status, 0);
    assert.notEqual(install().status, 0);
    assert.equal(git("config", "--local", "--get", "core.hooksPath").stdout.trim(), "custom-hooks");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("commit checks cover both runtimes and hook regressions", () => {
  const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(scripts.prepare, "node scripts/install-hooks.mjs");
  for (const command of [
    "test:hooks",
    "format:check",
    "quality:fast",
    "format:rust:check",
    "lint:rust",
    "test:rust",
    "contract:check",
    "legal:check",
    "change:check",
  ]) {
    assert.ok(scripts["quality:commit"].split(" && ").includes(`corepack pnpm ${command}`));
  }
  assert.equal(
    readFileSync(new URL("../.githooks/pre-commit", import.meta.url), "utf8"),
    "#!/bin/sh\nexec node scripts/pre-commit.mjs\n",
  );
});
