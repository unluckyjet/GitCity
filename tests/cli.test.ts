import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSnapshot, parseArgs } from "../src/cli.ts";
import type { Repository } from "../src/types.ts";

test("CLI accepts the documented GitHub form and repeated quoted exclusions", () => {
  const options = parseArgs([
    "github.com/facebook/react",
    "--history",
    "--speed",
    "4",
    "--exclude",
    "*.lock",
    "--exclude=docs/**",
  ]);
  assert.equal(options.repo, "github.com/facebook/react");
  assert.equal(options.history, true);
  assert.equal(options.speed, 4);
  assert.deepEqual(options.exclude, ["*.lock", "docs/**"]);
});

test("CLI defaults to cwd and supports explicit option terminator for paths", () => {
  assert.equal(parseArgs([]).repo, ".");
  assert.equal(parseArgs(["--snapshot", "--", "-my-repo"]).repo, "-my-repo");
  assert.equal(parseArgs(["--speed=0.25", "--json"]).speed, 0.25);
});

test("CLI rejects invalid speed, missing option values, typos, and extra repos", () => {
  for (const value of ["0", "-1", "33", "NaN", "Infinity", "", "four"]) {
    assert.throws(() => parseArgs([`--speed=${value}`]), /between 0.25 and 32/);
  }
  assert.throws(() => parseArgs(["--speed"]), /requires a value/);
  assert.throws(
    () => parseArgs(["--exclude", "--history"]),
    /requires a value/,
  );
  assert.throws(() => parseArgs(["--exclude="]), /non-empty/);
  assert.throws(() => parseArgs(["--histroy"]), /Unknown option/);
  assert.throws(() => parseArgs(["one", "two"]), /one repository/);
});

test("headless summary groups directories and strips terminal control sequences", () => {
  const repo = {
    name: "tiny\x1b[31m",
    commits: [
      {
        hash: "1234567890",
        date: "2026-09-06T12:00:00Z",
        author: "Ada",
        subject: "First\ncommit",
        changes: [],
      },
    ],
  } as unknown as Repository;
  const output = formatSnapshot(repo, 0, [
    {
      path: "src/a.ts",
      directory: "src",
      language: "TypeScript",
      size: 1024,
      commits: 1,
      contributors: 1,
      createdAt: "",
      lastModified: "",
    },
    {
      path: "src/b.ts",
      directory: "src",
      language: "TypeScript",
      size: 1024,
      commits: 1,
      contributors: 1,
      createdAt: "",
      lastModified: "",
    },
  ]);
  assert.match(output, /2 buildings · 1 neighborhoods · 1 commits/);
  assert.match(output, /2.0 KB/);
  assert.match(output, /First commit/);
  assert.equal(output.includes("\x1b"), false);
});
