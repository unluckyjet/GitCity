import test from "node:test";
import assert from "node:assert/strict";
import { CityController } from "../src/controller.ts";
import { RuinIndex } from "../src/ruins.ts";
import { renderScene } from "../src/scene.ts";
import type { Commit, RepoFile, Repository } from "../src/types.ts";
const commits: Commit[] = Array.from({ length: 4 }, (_, i) => ({
  hash: String(i).repeat(40),
  date: `2020-01-0${i + 1}`,
  author: "a",
  subject: `commit ${i}`,
  changes: [{ path: "src/gone.ts", status: i % 2 === 0 ? "added" : "deleted" }],
}));
const file: RepoFile = {
  path: "src/gone.ts",
  directory: "src",
  language: "TypeScript",
  size: 100,
  commits: 1,
  contributors: 1,
  createdAt: "2020-01-01",
  lastModified: "2020-01-01",
};
test("ruins follow deletion/recreation cycles and never appear before their deletion", () => {
  const index = new RuinIndex(commits);
  assert.deepEqual(index.at(0, new Set([file.path])), []);
  assert.equal(index.at(1, new Set())[0]!.lastIndex, 0);
  assert.deepEqual(index.at(2, new Set([file.path])), []);
  assert.equal(index.at(3, new Set())[0]!.lastIndex, 2);
});
test("clicking a foundation loads its last source and deletion diff, and GitHub opens its surviving revision", async () => {
  const requests: string[] = [];
  const repo: Repository = {
    name: "test/ruins",
    githubUrl: "https://github.com/test/ruins",
    root: "/fixture",
    commits,
    allPaths: [file.path],
    snapshot: async (i) => (i % 2 === 0 ? [file] : []),
    inspect: async (i) => {
      requests.push(`inspect:${i}`);
      return file;
    },
    preview: async (i) => {
      requests.push(`source:${i}`);
      return { text: `source at ${i}`, binary: false, truncated: false };
    },
    diff: async (i) => {
      requests.push(`diff:${i}`);
      return { text: "- removed", binary: false, truncated: false };
    },
    dispose: async () => {},
  };
  const state = new CityController(repo, { history: false, speed: 1 });
  await state.init();
  state.enter("src", true);
  state.settleCamera();
  const scene = renderScene(state, 120, 42),
    foundation = scene.actions.find(
      (a) => a.label === `${file.path} · deleted`,
    );
  assert.ok(foundation);
  foundation.run();
  await new Promise((r) => setImmediate(r));
  assert.equal(state.selected, file.path);
  assert.equal(state.selectedRuin?.deletionIndex, 3);
  await state.loadContent("source");
  assert.equal(state.content?.text, "source at 2");
  await state.loadContent("diff");
  assert.ok(requests.includes("inspect:2"));
  assert.ok(requests.includes("diff:3"));
  let url = "";
  state.onOpenUrl = (value) => (url = value);
  state.openGitHub();
  assert.match(url, new RegExp("/blob/" + "2".repeat(40)));
  state.toggleRuins();
  assert.equal(state.selected, undefined);
  assert.equal(state.visibleRuinBuildings.length, 0);
  state.close();
});
