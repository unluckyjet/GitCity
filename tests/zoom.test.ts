import test from "node:test";
import assert from "node:assert/strict";
import { createTestRenderer } from "@opentui/core/testing";
import { CityController } from "../src/controller.ts";
import { CityView, handleKey } from "../src/app.ts";
import { createCityLayout } from "../src/city.ts";
import { githubRemote } from "../src/repository.ts";
import { renderScene } from "../src/scene.ts";
import type { Repository, RepoFile } from "../src/types.ts";

function file(path: string, size = 100): RepoFile {
  return {
    path,
    directory: path.split("/").slice(0, -1).join("/") || ".",
    language: "TypeScript",
    size,
    lines: 10,
    commits: 1,
    contributors: 1,
    createdAt: "2020-01-01T00:00:00Z",
    lastModified: "2020-01-01T00:00:00Z",
  };
}
function repo(frames: RepoFile[][]): Repository {
  return {
    name: "public/fixture",
    root: "/fixture",
    allPaths: [...new Set(frames.flatMap((files) => files.map((f) => f.path)))],
    commits: frames.map((files, index) => ({
      hash: String(index),
      date: `202${index}-01-01T00:00:00Z`,
      author: "Test",
      subject: "Growth",
      changes: files.map((f) => ({ path: f.path, status: "added" as const })),
    })),
    snapshot: async (index) => frames[index]!,
    inspect: async (index, path) => frames[index]!.find((f) => f.path === path),
    dispose: async () => {},
  };
}

test("owner/repo always resolves to public GitHub; explicit local paths remain local", () => {
  for (const input of [
    "facebook/react",
    "facebook/react.git",
    "github.com/facebook/react",
    "https://github.com/facebook/react",
  ])
    assert.deepEqual(githubRemote(input), {
      url: "https://github.com/facebook/react.git",
      name: "facebook/react",
    });
  for (const input of [".", "./facebook/react", "../react", "/tmp/react"])
    assert.equal(githubRemote(input), undefined);
  assert.throws(() => githubRemote("https://github.com/a/b/tree/main"));
  assert.throws(() => githubRemote("https://token@github.com/a/b"));
});

test("old streets stay compact and fixed as later neighborhoods appear", () => {
  const early = [file("z/first.ts"), file("z/second.ts")];
  const later = Array.from({ length: 600 }, (_, i) => file(`a${i}/future.ts`));
  const files = [...early, ...later];
  const layout = createCityLayout(
    files.map((f) => f.path),
    files.map((f) => f.path),
  );
  const start = layout.build(early),
    end = layout.build(files);
  assert.ok(start.buildings.every((b) => b.x < 73 && b.y < 38));
  for (const b of start.buildings) {
    const grown = end.buildings.find((f) => f.path === b.path)!;
    assert.deepEqual([grown.x, grown.y], [b.x, b.y]);
  }
});

test("history starts with houses and zooms out to contain the growing city", async () => {
  const early = [file("src/first.ts")];
  const later = [
    ...early,
    ...Array.from({ length: 500 }, (_, i) =>
      file(`src/area${Math.floor(i / 12)}/module${i}.ts`, 20000),
    ),
  ];
  const state = new CityController(repo([early, later]), {
    history: true,
    speed: 1,
  });
  state.viewport = { width: 126, height: 28 };
  await state.init();
  const closeZoom = state.zoom;
  assert.match(
    renderScene(state, 130, 42)
      .cells.map((c) => c.char)
      .join(""),
    /▲/,
  );
  await state.seek(1);
  state.settleCamera();
  assert.ok(state.zoom < closeZoom);
  assert.equal(state.atlasMode, true);
  const scene = renderScene(state, 130, 42);
  const represented = new Set(
    state.territories.flatMap((r) => r.buildings.map((b) => b.path)),
  );
  assert.equal(
    represented.size,
    later.length,
    "every file survives overview aggregation",
  );
  const old = state.city.buildings.find((b) => b.path === early[0]!.path)!;
  state.select(old, true);
  await state.inspect();
  assert.equal(state.panel, true);
  await state.togglePlayback();
  assert.equal(state.index, 0);
  assert.equal(state.autoCamera, true);
  assert.equal(state.panel, false);
  assert.ok(
    state.zoom >= closeZoom * 0.99,
    "replay returns from manual inspection to the little starting town",
  );
  state.close();
});

test("pointer zoom preserves the world location under the cursor; keys separate zoom and speed", async () => {
  const state = new CityController(repo([[file("one.ts")]]), {
    history: true,
    speed: 1,
  });
  await state.init();
  const x = 21,
    y = 7,
    before = {
      x: state.camera.x + x / state.zoom,
      y: state.camera.y + y / state.zoom,
    };
  state.zoomAt(1.5, x, y);
  assert.ok(Math.abs(state.camera.x + x / state.zoom - before.x) < 1e-8);
  assert.ok(Math.abs(state.camera.y + y / state.zoom - before.y) < 1e-8);
  assert.equal(state.autoCamera, false);
  const initial = state.zoom;
  handleKey(
    state,
    { name: "-", sequence: "-", ctrl: false, shift: false },
    () => {},
  );
  assert.ok(state.zoom < initial);
  assert.equal(state.speed, 1);
  handleKey(
    state,
    { name: ".", sequence: ".", ctrl: false, shift: false },
    () => {},
  );
  assert.equal(state.speed, 2);
  state.close();
});

test("native mouse wheel and overview clicks drill through dense cells into exact files", async () => {
  const files = Array.from({ length: 2500 }, (_, i) =>
    file(`src/module${String(i).padStart(4, "0")}.ts`, 2000),
  );
  const state = new CityController(repo([files]), { history: true, speed: 1 });
  state.viewport = { width: 116, height: 28 };
  await state.init();
  const setup = await createTestRenderer({ width: 120, height: 42 });
  try {
    const view = new CityView(setup.renderer, state);
    setup.renderer.root.add(view);
    state.onChange = () => view.requestRender();
    state.resetCamera(true);
    await setup.renderOnce();
    state.settleCamera();
    await setup.renderOnce();
    state.enter("src", true);
    state.resetCamera(true);
    state.settleCamera();
    await setup.renderOnce();
    const cluster = view.scene!.hits.find((h) => (h.members?.length ?? 0) > 1)!;
    assert.ok(cluster, "thousands of files form clickable overview cells");
    const target = cluster.members![0]!.path;
    const overviewZoom = state.zoom;
    await setup.mockMouse.click(cluster.x, cluster.y);
    await setup.renderOnce();
    assert.ok(state.zoom > overviewZoom);
    assert.equal(state.autoCamera, false);
    for (let i = 0; i < 8 && state.selected !== target; i++) {
      const hit = view.scene!.hits.find((h) =>
        (h.members ?? [h.building]).some((b) => b.path === target),
      );
      assert.ok(hit, `file remains available at drill-down ${i}`);
      await setup.mockMouse.click(
        hit.x + Math.floor(hit.width / 2),
        hit.y + Math.floor(hit.height / 2),
      );
      await setup.renderOnce();
    }
    assert.equal(state.selected, target);
    await state.inspect();
    assert.equal(state.detail?.path, target);
    state.panel = false;
    view.requestRender();
    await setup.renderOnce();
    const before = state.zoom;
    await setup.mockMouse.scroll(25, 15, "down");
    await setup.renderOnce();
    assert.ok(state.zoom < before);
    await setup.mockMouse.click(110, 3);
    state.settleCamera();
    await setup.renderOnce();
    assert.equal(state.autoCamera, true);
    assert.ok(state.zoom < 0.35);
  } finally {
    state.close();
    setup.renderer.destroy();
  }
});
