import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCityJson, formatSnapshot, parseArgs } from "../src/cli.ts";
import { decodeView, encodeView, shareCommand } from "../src/view.ts";
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

test("CLI validates --view before load and round-trips a share command", () => {
  const token = encodeView({
    zoom: 0.5,
    x: 2,
    y: 4,
    scope: "src",
    direct: false,
    selected: "src/a.ts",
    at: "abc",
  });
  const options = parseArgs(["owner/city", "--view", token, "--focus", "src/a.ts"]);
  assert.equal(options.view, token);
  assert.deepEqual(decodeView(options.view!), decodeView(token));
  const command = shareCommand("owner/city", decodeView(token));
  const restored = parseArgs(command.split(" ").slice(1));
  assert.equal(restored.repo, "owner/city");
  assert.equal(restored.at, "abc");
  assert.equal(restored.focus, "src/a.ts");
  assert.deepEqual(decodeView(restored.view!), decodeView(token));
  assert.throws(() => parseArgs(["--view", "nope"]), /Invalid view field/);
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
  assert.match(output, /COMMAND  gitcity tiny/);
  assert.equal(output.includes("\x1b"), false);
});

test("headless JSON includes real files, neighborhoods, coordinates, and a command", () => {
  const files = [
    {
      path: "src/a.ts",
      directory: "src",
      language: "TypeScript",
      size: 2048,
      commits: 3,
      contributors: 2,
      createdAt: "2020-01-01T00:00:00Z",
      lastModified: "2026-01-01T00:00:00Z",
    },
    {
      path: "src/b.ts",
      directory: "src",
      language: "TypeScript",
      size: 1024,
      commits: 1,
      contributors: 1,
      createdAt: "2020-01-01T00:00:00Z",
      lastModified: "2026-01-01T00:00:00Z",
    },
  ];
  const repo = {
    name: "owner/city",
    root: "/fixture",
    allPaths: files.map((f) => f.path),
    commits: [
      {
        hash: "abcdef1234567890",
        date: "2026-09-06T12:00:00Z",
        author: "Ada",
        subject: "Lay the first street",
        changes: files.map((f) => ({ path: f.path, status: "added" as const })),
      },
    ],
  } as unknown as Repository;
  const payload = formatCityJson(repo, 0, files);
  assert.equal(payload.name, "owner/city");
  assert.equal(payload.commitIndex, 0);
  assert.equal(payload.totalCommits, 1);
  assert.equal(payload.commit?.hash, "abcdef1234567890");
  assert.equal(payload.commit?.author, "Ada");
  assert.match(
    payload.command,
    /gitcity owner\/city --at abcdef1234567890 --json/,
  );
  assert.equal(payload.files.length, 2);
  assert.equal(payload.files[0]!.path, "src/a.ts");
  assert.equal(typeof payload.files[0]!.x, "number");
  assert.equal(typeof payload.files[0]!.y, "number");
  assert.ok(payload.files[0]!.width! > 0);
  assert.ok(payload.files[0]!.height! > 0);
  assert.notEqual(
    `${payload.files[0]!.x},${payload.files[0]!.y}`,
    `${payload.files[1]!.x},${payload.files[1]!.y}`,
  );
  assert.ok(payload.city.width > 0);
  assert.ok(payload.city.height > 0);
  const block = payload.districts.find((d) => d.files.includes("src/a.ts"));
  assert.ok(block);
  assert.ok(block.label);
  assert.ok(block.files.includes("src/b.ts"));
  const src = payload.neighborhoods.find((n) => n.path === "src");
  assert.ok(src);
  assert.equal(src.files, 2);
  assert.equal(src.size, 3072);
  assert.deepEqual(src.languages, ["TypeScript"]);
  for (const file of payload.files) {
    assert.ok(src.x <= file.x!);
    assert.ok(src.x + src.width >= file.x! + file.width!);
    assert.ok(src.y + src.height >= file.y!);
  }
});
