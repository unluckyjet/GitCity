import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestRenderer } from "@opentui/core/testing";
import { CityController } from "../src/controller.ts";
import { CityView, handleKey } from "../src/app.ts";
import { renderScene } from "../src/scene.ts";
import type { RepoFile, Repository } from "../src/types.ts";

const files: RepoFile[] = Array.from({ length: 16 }, (_, i) => ({
  path: `src/${i < 8 ? "api" : "components"}/file-${i}.ts`,
  directory: `src/${i < 8 ? "api" : "components"}`,
  language: "TypeScript",
  size: 700 + i * 1000,
  lines: 50 + i * 60,
  commits: 10,
  contributors: 5,
  createdAt: "2020-01-01T00:00:00Z",
  lastModified: "2026-01-01T00:00:00Z",
}));
function repository(): Repository {
  return {
    name: "city-test",
    root: "/fixture",
    commits: [0, 1, 2].map((i) => ({
      hash: String(i).repeat(40),
      date: `202${i + 4}-01-01T00:00:00Z`,
      author: "Test Author",
      subject: `Build the city ${i}`,
      changes: [],
    })),
    allPaths: files.map((f) => f.path),
    snapshot: async (index) => (index === 0 ? files.slice(0, 3) : files),
    inspect: async (_, path) => files.find((f) => f.path === path),
    dispose: async () => {},
  };
}

test("native OpenTUI paints the city, selects a file with the mouse, and resizes", async () => {
  const repo = repository();
  repo.name = "city-test 城市💡";
  const state = new CityController(repo, { history: false, speed: 1 });
  await state.init();
  const setup = await createTestRenderer({ width: 120, height: 42 });
  try {
    const view = new CityView(setup.renderer, state);
    state.onChange = () => view.requestRender();
    setup.renderer.root.add(view);
    setup.renderer.keyInput.on("keypress", (key) =>
      handleKey(state, key, () => {}),
    );
    await setup.renderOnce();
    let screen = setup.captureCharFrame();
    assert.match(screen, /GIT CITY/);
    assert.match(screen, /16 files/);
    assert.match(screen, /2026/);
    assert.match(screen, /城市💡/);
    const intendedFrame = Array.from({ length: 42 }, (_, y) =>
      view
        .scene!.cells.slice(y * 120, (y + 1) * 120)
        .map((c) => c.char)
        .join(""),
    ).join("\n");
    assert.equal(
      screen.trimEnd(),
      intendedFrame.trimEnd(),
      "native glyph widths agree with the scene's cell positions",
    );
    assert.ok(
      view.scene!.hits.length > 0,
      "real buildings are visible and selectable",
    );
    const hit = view.scene!.hits[0];
    await setup.mockMouse.click(hit.x + 1, hit.y + 1);
    await setup.renderOnce();
    assert.equal(state.selected, hit.building.path);
    assert.equal(state.panel, false);
    assert.match(setup.captureCharFrame(), /Enter details/);
    await state.inspect();
    await setup.renderOnce();
    assert.equal(state.panel, true);
    assert.match(setup.captureCharFrame(), /FILE DETAILS/);
    setup.mockInput.pressEscape();
    await new Promise((resolve) => setTimeout(resolve, 40));
    await setup.renderOnce();
    assert.equal(state.panel, false);
    setup.resize(48, 15);
    await setup.renderOnce();
    assert.match(setup.captureCharFrame(), /little more room/);
    setup.resize(80, 24);
    await setup.renderOnce();
    assert.match(setup.captureCharFrame(), /GIT CITY/);
  } finally {
    state.close();
    setup.renderer.destroy();
  }
});

test("arrow keys move the camera in explore and step exact commits in time mode", async () => {
  const state = new CityController(repository(), { history: false, speed: 1 });
  await state.init();
  const key = (name: string, sequence = name) =>
    handleKey(state, { name, sequence, ctrl: false, shift: false }, () => {});
  key("left");
  assert.equal(state.index, 2);
  assert.equal(state.autoCamera, false);
  key("t");
  key("left");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.index, 1);
  key("space", " ");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.playing, true);
  key("space", " ");
  assert.equal(state.playing, false);
  key("return");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.panel, true);
  key("escape");
  assert.equal(state.panel, false);
  state.close();
});

test("scene clips to each terminal size and sanitizes Git control characters", async () => {
  const repo = repository();
  repo.name = "test\x1b[2J\nrepo";
  const state = new CityController(repo, { history: false, speed: 1 });
  await state.init();
  for (const [width, height] of [
    [1, 1],
    [55, 20],
    [80, 24],
    [140, 48],
  ]) {
    const scene = renderScene(state, width, height);
    assert.equal(scene.cells.length, width * height);
    assert.ok(scene.cells.every((c) => !/[\u0000-\u001f\u007f]/.test(c.char)));
    assert.ok(
      scene.hits.every(
        (h) =>
          h.x >= 0 &&
          h.y >= 0 &&
          h.x + h.width <= width &&
          h.y + h.height <= height,
      ),
    );
  }
  state.close();
});
