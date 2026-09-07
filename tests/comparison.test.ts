import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadRepository } from "../src/repository.ts";
import { CityController } from "../src/controller.ts";
import { renderScene } from "../src/scene.ts";
test("compares exact side-branch blobs including equal-size edits and deleted files; slider and previews use matching revisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "gitcity-compare-"));
  const git = (...args: string[]) => {
    const r = spawnSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@example.test",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@example.test",
      },
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  try {
    git("init", "-q", "-b", "main");
    await writeFile(join(root, "a.ts"), "old");
    await writeFile(join(root, "gone.ts"), "gone");
    git("add", ".");
    git("-c", "commit.gpgsign=false", "commit", "-qm", "first");
    const first = git("rev-parse", "HEAD");
    git("checkout", "-qb", "feature");
    await writeFile(join(root, "a.ts"), "new");
    await rm(join(root, "gone.ts"));
    await writeFile(join(root, "new.ts"), "added");
    git("add", ".");
    git("-c", "commit.gpgsign=false", "commit", "-qm", "second");
    git("checkout", "-q", "main");
    const repo = await loadRepository(root);
    try {
      const c = await repo.compare!("main", "feature");
      assert.equal(c.changes.get("a.ts"), "changed");
      assert.equal(c.changes.get("new.ts"), "added");
      assert.equal(c.changes.get("gone.ts"), "deleted");
      assert.equal(c.before.hash, first);
      const state = new CityController(repo, { history: false, speed: 1 });
      await state.init();
      await state.startComparison("main..feature");
      assert.ok(state.comparison);
      state.visitFile("gone.ts");
      await state.loadContent("source");
      assert.equal(state.content!.text, "gone");
      await state.loadContent("diff");
      assert.match(state.content!.text, /-gone/);
      state.panel = false;
      state.selected = undefined;
      state.setCompareFraction(0);
      const after = renderScene(state, 130, 42);
      state.setCompareFraction(1);
      const before = renderScene(state, 130, 42);
      assert.notDeepEqual(after.cells, before.cells);
      const slider = after.actions.find(
        (a) => a.label === "Move comparison slider",
      )!;
      slider.run();
      assert.equal(state.compareFraction, 0);
      await state.clearComparison();
      assert.equal(state.comparison, undefined);
      assert.equal(state.city.buildings.length, 2);
      state.close();
    } finally {
      await repo.dispose();
    }
    const at = await loadRepository(root, { ref: "feature" });
    assert.equal(at.commits.length, 2);
    await at.dispose();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
