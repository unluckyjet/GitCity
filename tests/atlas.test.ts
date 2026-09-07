import test from "node:test";
import assert from "node:assert/strict";
import { AtlasIndex, searchPaths } from "../src/atlas.ts";
import { CityController } from "../src/controller.ts";
import { handleKey, CityView } from "../src/app.ts";
import { createTestRenderer } from "@opentui/core/testing";
import type { Repository, RepoFile } from "../src/types.ts";
const files: RepoFile[] = Array.from({ length: 300 }, (_, i) => ({
  path: `packages/${i < 150 ? "core" : "ui"}/src/file${i}.ts`,
  directory: `packages/${i < 150 ? "core" : "ui"}/src`,
  language: "TypeScript",
  size: 200,
  lines: 12,
  commits: 2,
  contributors: 1,
  createdAt: "2020-01-01",
  lastModified: "2021-01-01",
}));
const repo: Repository = {
  name: "owner/repo",
  root: "/fixture",
  githubUrl: "https://github.com/owner/repo",
  allPaths: files.map((f) => f.path),
  commits: [
    {
      hash: "a".repeat(40),
      date: "2021-01-01",
      author: "Author",
      subject: "Start",
      changes: [],
    },
  ],
  snapshot: async () => files,
  inspect: async (_, p) => files.find((f) => f.path === p),
  preview: async () => ({
    text: "export const city = true;",
    binary: false,
    truncated: false,
  }),
  diff: async () => ({
    text: "+export const city = true;",
    binary: false,
    truncated: false,
  }),
  dispose: async () => {},
};
const key = (state: CityController, name: string, sequence = name) =>
  handleKey(
    state,
    { name, sequence, ctrl: false, shift: sequence === "D" },
    () => assert.fail("search input must not quit"),
  );
test("atlas territories keep their boundaries and every real file as history grows", async () => {
  const state = new CityController(repo, { history: false, speed: 1 });
  await state.init();
  const atlas = new AtlasIndex(repo.allPaths);
  const before = atlas.territories(
    "packages",
    state.city.buildings.slice(0, 30),
  );
  const after = atlas.territories("packages", state.city.buildings);
  assert.deepEqual(
    [before[0].x, before[0].y, before[0].width, before[0].height],
    [after[0].x, after[0].y, after[0].width, after[0].height],
  );
  assert.equal(
    new Set(after.flatMap((r) => r.buildings.map((b) => b.path))).size,
    300,
  );
  state.enter("packages");
  state.settleCamera();
  const camera = { ...state.camera };
  state.enter("packages/core");
  assert.equal(state.scope, "packages/core");
  state.back();
  assert.equal(state.scope, "packages");
  assert.deepEqual(state.camera, camera);
  state.close();
});
test("search accepts command letters, ranks exact files, flies to real buildings, and opens exact-commit content", async () => {
  const state = new CityController(repo, { history: false, speed: 1 });
  await state.init();
  key(state, "/");
  key(state, "q");
  assert.equal(state.query, "q");
  key(state, "backspace");
  state.updateSearch("file17.ts");
  assert.equal(state.results[0].path, "packages/core/src/file17.ts");
  key(state, "enter");
  assert.equal(state.selected, "packages/core/src/file17.ts");
  assert.equal(state.atlasMode, false);
  await state.loadContent("source");
  assert.match(state.content!.text, /export const/);
  await state.loadContent("diff");
  assert.match(state.content!.text, /^\+/);
  let url = "";
  state.onOpenUrl = (value) => (url = value);
  state.openGitHub();
  assert.equal(
    url,
    `https://github.com/owner/repo/blob/${"a".repeat(40)}/packages/core/src/file17.ts`,
  );
  assert.equal(
    searchPaths(state.city.buildings, "packages/core")[0].kind,
    "folder",
  );
  state.close();
});
test("native region clicks, breadcrumbs, search selection and inspector tabs stay interactive", async () => {
  const state = new CityController(repo, { history: false, speed: 1 });
  await state.init();
  const setup = await createTestRenderer({ width: 130, height: 42 });
  try {
    const view = new CityView(setup.renderer, state);
    state.onChange = () => view.requestRender();
    setup.renderer.root.add(view);
    state.resetCamera(true);
    await setup.renderOnce();
    assert.equal(state.atlasMode, true);
    const region = view.scene!.actions.find((a) => a.y >= 5 && a.height > 2)!;
    assert.ok(region);
    await setup.mockMouse.click(region.x + 1, region.y + 1);
    state.settleCamera();
    await setup.renderOnce();
    assert.equal(state.scope, "packages");
    await setup.mockMouse.click(3, 3);
    state.settleCamera();
    await setup.renderOnce();
    assert.equal(state.scope, "");
    assert.match(setup.captureCharFrame(), /MAP · click to move/);
    const oldCamera = { ...state.cameraTarget };
    await setup.mockMouse.click(121, 30);
    assert.notDeepEqual(state.cameraTarget, oldCamera);
    state.openSearch();
    state.updateSearch("file17.ts");
    await setup.renderOnce();
    assert.match(setup.captureCharFrame(), /FIND A PLACE/);
    assert.equal(
      setup.captureCharFrame().trimEnd(),
      Array.from({ length: 42 }, (_, y) =>
        view
          .scene!.cells.slice(y * 130, (y + 1) * 130)
          .map((c) => c.char)
          .join(""),
      )
        .join("\n")
        .trimEnd(),
    );
    const result = view.scene!.actions[0];
    await setup.mockMouse.click(result.x + 2, result.y);
    await setup.renderOnce();
    assert.equal(state.selected, "packages/core/src/file17.ts");
    assert.equal(state.panel, false);
    await state.inspect();
    await setup.renderOnce();
    const source = view.scene!.actions.find((a) => a.y === 8 && a.width === 8)!;
    assert.ok(source);
    await setup.mockMouse.click(source.x, source.y);
    await new Promise((r) => setImmediate(r));
    await setup.renderOnce();
    assert.match(setup.captureCharFrame(), /export const city/);
  } finally {
    state.close();
    setup.renderer.destroy();
  }
});

test("old source requests cannot replace a new file or commit and manual movement pauses growth", async () => {
  let resolve!: (value: {
    text: string;
    binary: boolean;
    truncated: boolean;
  }) => void;
  const state = new CityController(
    { ...repo, preview: () => new Promise((r) => (resolve = r)) },
    { history: false, speed: 1 },
  );
  await state.init();
  state.select(state.city.buildings[0], true);
  const pending = state.loadContent("source");
  const oldResolve = resolve;
  state.select(state.city.buildings[1], true);
  oldResolve({ text: "stale file", binary: false, truncated: false });
  await pending;
  assert.notEqual(state.content?.text, "stale file");
  state.playing = true;
  state.move(4, 0);
  assert.equal(state.playing, false);
  state.close();
});

test("landscape settlements stay on land, connect by roads, and terrain clicks open the correct folder", async () => {
  const { geographyFor } = await import("../src/geography.ts");
  const { renderScene } = await import("../src/scene.ts");
  const state = new CityController(repo, { history: false, speed: 1 });
  await state.init();
  state.enter("packages");
  state.settleCamera();
  const sites = geographyFor(state.territories);
  assert.equal(sites.settlements.length, 2);
  for (const site of sites.settlements) {
    assert.equal(sites.land(site.x, site.y), true);
    assert.equal(sites.pick(site.x, site.y)?.region.path, site.region.path);
  }
  assert.equal(sites.pick(-100, -100), undefined);
  const reached = new Set([sites.settlements[0]]);
  for (let i = 0; i < sites.settlements.length; i++)
    for (const road of sites.roads)
      if (reached.has(road.from) || reached.has(road.to)) {
        reached.add(road.from);
        reached.add(road.to);
      }
  assert.equal(reached.size, sites.settlements.length);
  state.resizeViewport(126, 28);
  state.resetCamera(true);
  const scene = renderScene(state, 130, 42);
  const tile = scene.actions.find(
    (a) => a.height === 1 && a.y >= 5 && a.label?.startsWith("packages/core ·"),
  );
  assert.ok(tile);
  tile.run();
  assert.equal(state.scope, "packages/core");
  state.close();
});
