import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { loadRepository } from "../src/repository.ts";

const oddPath = "src/a space\tand a newline\n文.md";
const firstDate = "2020-01-01T12:00:00Z";
const secondDate = "2020-01-02T12:00:00Z";

async function fixture() {
  const temporary = await mkdtemp(join(tmpdir(), "gitcity-tests-"));
  // Shell punctuation in a local path must be interpreted literally.
  const root = join(temporary, "repo $(touch SHOULD_NOT_EXIST); with spaces");
  await mkdir(root);
  const run = (args: string[], author = "Alice", date = firstDate) => {
    const result = spawnSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: author,
        GIT_AUTHOR_EMAIL: author.toLowerCase() + "@example.test",
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_NAME: author,
        GIT_COMMITTER_EMAIL: author.toLowerCase() + "@example.test",
        GIT_COMMITTER_DATE: date,
      },
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  };
  const put = async (path: string, text: string | Uint8Array) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  const commit = (subject: string, author: string, day: number) => {
    run(["add", "--all", "--", "."]);
    run(
      [
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--quiet",
        "--allow-empty",
        "--allow-empty-message",
        "-m",
        subject,
      ],
      author,
      `2020-01-0${day}T12:00:00+00:00`,
    );
    return run(["rev-parse", "HEAD"]);
  };
  run(["init", "--quiet", "-b", "main"]);
  await put("src/a.ts", "export const value = 1;\n");
  await put(oddPath, "one\ntwo");
  await put("empty.txt", "");
  await put("assets/binary.dat", new Uint8Array([0, 1, 10, 255]));
  await put("deps.lock", "locked\n");
  await put("nested/deps.lock", "locked too\n");
  for (const path of [
    "node_modules/pkg/index.js",
    "src/vendor/lib.c",
    "dist/app.js",
    "build/data.json",
    "src/__generated__/schema.ts",
    "src/api.generated.ts",
    "public/app.min.js",
    "public/app.js.map",
  ])
    await put(path, "ignored\n");
  const initial = commit("initial city", "Alice", 1);
  await put("src/a.ts", "export const value = 1;\nexport const next = 2;\n");
  const grown = commit("grow a building", "Bob", 2);
  run(["checkout", "--quiet", "-b", "feature"]);
  await put("src/feature.ts", "export const feature = true;\n");
  const side = commit("feature branch only", "Carol", 3);
  run(["checkout", "--quiet", "main"]);
  run(["mv", "--", "src/a.ts", "src/a new.ts"]);
  const renamed = commit("rename the building", "Alice", 4);
  run(
    [
      "-c",
      "commit.gpgsign=false",
      "merge",
      "--quiet",
      "--no-ff",
      "feature",
      "-m",
      "merge feature",
    ],
    "Dan",
    "2020-01-05T12:00:00+00:00",
  );
  const merged = run(["rev-parse", "HEAD"]);
  run(["rm", "--quiet", "--", "src/feature.ts"]);
  const deleted = commit("remove a building", "Bob", 6);
  const empty = commit("", "Alice", 7);
  await put(
    "src/a new.ts",
    "This staged working-copy content must not appear in history.\n",
  );
  run(["add", "--", "src/a new.ts"]);
  await put("untracked.ts", "not committed\n");
  return {
    root,
    temporary,
    hashes: [initial, grown, renamed, merged, deleted, empty],
    side,
  };
}

test("loads exact committed trees and historical metrics; handles growth, renames, merges, deletion, and NUL-delimited paths", async (t) => {
  const data = await fixture();
  t.after(() => rm(data.temporary, { recursive: true, force: true }));
  const repository = await loadRepository(data.root, { exclude: ["*.lock"] });
  t.after(() => repository.dispose());
  assert.deepEqual(
    repository.commits.map((commit) => commit.hash),
    data.hashes,
  );
  assert.ok(
    !repository.commits.some((commit) => commit.hash === data.side),
    "Replay follows the first parent through a merge",
  );
  assert.equal(
    repository.commits.at(-1)?.subject,
    "",
    "Empty commit subjects must not corrupt NUL parsing",
  );
  assert.deepEqual(repository.commits.at(-1)?.changes, []);

  const first = await repository.snapshot(0);
  assert.deepEqual(
    first.map((file) => file.path).sort(),
    ["assets/binary.dat", "empty.txt", "src/a.ts", oddPath].sort(),
  );
  const a0 = await repository.inspect(0, "src/a.ts");
  assert.equal(new Date(a0!.createdAt).getTime(), Date.parse(firstDate));
  assert.equal(new Date(a0!.lastModified).getTime(), Date.parse(firstDate));
  assert.deepEqual(a0, {
    path: "src/a.ts",
    directory: "src",
    language: "TypeScript",
    size: Buffer.byteLength("export const value = 1;\n"),
    commits: 1,
    contributors: 1,
    createdAt: repository.commits[0]!.date,
    lastModified: repository.commits[0]!.date,
    lines: 1,
  });
  const a1 = await repository.inspect(1, "src/a.ts");
  assert.equal(a1?.commits, 2);
  assert.equal(a1?.contributors, 2);
  assert.equal(new Date(a1!.createdAt).getTime(), Date.parse(firstDate));
  assert.equal(new Date(a1!.lastModified).getTime(), Date.parse(secondDate));
  assert.equal(a1?.lines, 2);
  assert.ok(a1!.size > a0!.size);
  assert.deepEqual(repository.commits[1]!.changes, [
    { path: "src/a.ts", status: "modified" },
  ]);
  assert.equal(
    (await repository.inspect(0, oddPath))?.lines,
    2,
    "A final line without a newline is counted",
  );
  assert.equal((await repository.inspect(0, "empty.txt"))?.lines, 0);
  assert.equal(
    (await repository.inspect(0, "assets/binary.dat"))?.lines,
    undefined,
  );

  assert.deepEqual(
    repository.commits[2]!.changes.map(({ path, status }) => ({
      path,
      status,
    })).sort((a, b) => a.path.localeCompare(b.path)),
    [
      { path: "src/a new.ts", status: "added" },
      { path: "src/a.ts", status: "deleted" },
    ],
  );
  assert.equal(await repository.inspect(2, "src/a.ts"), undefined);
  assert.equal(
    (await repository.inspect(2, "src/a new.ts"))?.commits,
    1,
    "Renames begin a new path identity",
  );
  assert.equal(await repository.inspect(2, "src/feature.ts"), undefined);
  assert.equal(
    new Date(
      (await repository.inspect(3, "src/feature.ts"))!.createdAt,
    ).toISOString(),
    "2020-01-05T12:00:00.000Z",
  );
  assert.deepEqual(repository.commits[3]!.changes, [
    { path: "src/feature.ts", status: "added" },
  ]);
  assert.equal(await repository.inspect(4, "src/feature.ts"), undefined);
  assert.deepEqual(repository.commits[4]!.changes, [
    { path: "src/feature.ts", status: "deleted" },
  ]);
  const last = await repository.snapshot(5);
  assert.equal(
    (await repository.inspect(5, "src/a new.ts"))?.lines,
    2,
    "Staged changes do not replace a committed snapshot",
  );
  assert.ok(!last.some((file) => file.path === "untracked.ts"));
  assert.ok(
    repository.allPaths.includes("src/feature.ts"),
    "Deleted paths remain available for a stable city layout",
  );
  assert.ok(repository.allPaths.includes("src/a.ts"));
  assert.ok(repository.allPaths.includes(oddPath));
  assert.ok(
    !repository.allPaths.some(
      (path) => path.includes("node_modules") || path.endsWith(".lock"),
    ),
  );
  assert.deepEqual(
    await repository.snapshot(0),
    first,
    "Rewinding preserves the earlier frame and its statistics",
  );
  await assert.rejects(repository.snapshot(-1), RangeError);
  await assert.rejects(repository.snapshot(0.5), RangeError);
  await assert.rejects(repository.snapshot(6), RangeError);
  await repository.dispose();
  await repository.dispose();
  await assert.rejects(repository.snapshot(0), /closed/);
});

test("supports nested local paths, bare repositories, and root or recursive exclusion globs", async (t) => {
  const data = await fixture();
  t.after(() => rm(data.temporary, { recursive: true, force: true }));
  const repository = await loadRepository(join(data.root, "src"), {
    exclude: ["src/**", "**/*.lock", "assets/"],
  });
  t.after(() => repository.dispose());
  assert.equal(repository.root, await realpath(data.root));
  assert.deepEqual(
    (await repository.snapshot(0)).map((file) => file.path),
    ["empty.txt"],
  );

  const bare = join(data.temporary, "bare.git");
  const cloned = spawnSync(
    "git",
    ["clone", "--bare", "--quiet", "--", data.root, bare],
    { encoding: "utf8" },
  );
  assert.equal(cloned.status, 0, cloned.stderr);
  const bareRepository = await loadRepository(bare);
  t.after(() => bareRepository.dispose());
  assert.equal(bareRepository.name, "bare");
  assert.deepEqual(
    bareRepository.commits.map((commit) => commit.hash),
    data.hashes,
  );
  assert.ok(
    (await bareRepository.snapshot(0)).some(
      (file) => file.path === "deps.lock",
    ),
  );
});

test("rejects empty repositories, invalid inputs, and cancellation without network access", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "gitcity-empty-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const initialized = spawnSync("git", ["init", "--quiet", temporary], {
    encoding: "utf8",
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  await assert.rejects(loadRepository(temporary), /no checked-out commit/);
  await assert.rejects(loadRepository(""), /Provide/);
  await assert.rejects(
    loadRepository("https://example.com/owner/repo"),
    /public GitHub/,
  );
  await assert.rejects(
    loadRepository("https://github.com/owner/repo/tree/main"),
    /repository URL/,
  );
  await assert.rejects(
    loadRepository("https://github.com/owner/repo?key=secret"),
    /public GitHub/,
  );
  await assert.rejects(
    loadRepository(join(temporary, "missing")),
    /does not exist/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    loadRepository(temporary, { signal: controller.signal }),
    { name: "AbortError" },
  );
});

test("source and diffs read exact historical blobs, literal paths, binary data, and bounded large files", async (t) => {
  const data = await fixture();
  t.after(() => rm(data.temporary, { recursive: true, force: true }));
  const repository = await loadRepository(data.root);
  t.after(() => repository.dispose());
  assert.equal(
    (await repository.preview!(0, "src/a.ts")).text,
    "export const value = 1;\n",
  );
  assert.match((await repository.preview!(1, "src/a.ts")).text, /next = 2/);
  assert.equal((await repository.preview!(0, oddPath)).text, "one\ntwo");
  assert.equal(
    (await repository.preview!(0, "assets/binary.dat")).binary,
    true,
  );
  assert.match(
    (await repository.diff!(1, "src/a.ts")).text,
    /\+export const next = 2/,
  );
  assert.match(
    (await repository.diff!(0, "src/a.ts")).text,
    /\+export const value = 1/,
  );
  assert.equal((await repository.diff!(5, "src/a new.ts")).text, "");
  await assert.rejects(repository.preview!(0, "missing.ts"), /does not exist/);
  await writeFile(join(data.root, "large.txt"), "x".repeat(200000));
  const run = (args: string[]) => {
    const p = spawnSync("git", ["-C", data.root, ...args], {
      encoding: "utf8",
    });
    assert.equal(p.status, 0, p.stderr);
  };
  run(["add", "--", "large.txt"]);
  run([
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.test",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "large preview",
  ]);
  const large = await loadRepository(data.root);
  t.after(() => large.dispose());
  const preview = await large.preview!(large.commits.length - 1, "large.txt");
  assert.equal(preview.truncated, true);
  assert.ok(preview.text.length <= 65536);
  assert.equal(
    (await large.diff!(large.commits.length - 1, "large.txt")).truncated,
    true,
  );
});
