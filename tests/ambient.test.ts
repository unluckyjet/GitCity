import test from "node:test";
import assert from "node:assert/strict";
import { CityController } from "../src/controller.ts";
import { ambientParticles, daylight, cloudShade } from "../src/ambient.ts";
import { renderScene } from "../src/scene.ts";
import { handleKey } from "../src/app.ts";
import type { Repository, RepoFile } from "../src/types.ts";
const file: RepoFile = {
  path: "scripts/build.ts",
  directory: "scripts",
  language: "TypeScript",
  size: 2048,
  commits: 1,
  contributors: 1,
  createdAt: "2020-01-01",
  lastModified: "2020-01-01",
};
const repo: Repository = {
  name: "life/fixture",
  root: "/fixture",
  allPaths: [file.path],
  commits: [
    {
      hash: "a".repeat(40),
      date: "2020-01-01",
      author: "a",
      subject: "start",
      changes: [],
    },
  ],
  snapshot: async () => [file],
  inspect: async () => file,
  dispose: async () => {},
};
test("ambient traffic and smoke move while history is paused; M freezes time and N selects lighting", async () => {
  const state = new CityController(repo, { history: false, speed: 1 });
  await state.init();
  state.ambient = true;
  state.settleCamera();
  state.tick(0);
  const first = ambientParticles(state);
  assert.ok(first.some((p) => p.kind === "smoke"));
  assert.ok(first.some((p) => p.kind === "car"));
  for (let t = 50; t <= 5000; t += 50) state.tick(t);
  assert.equal(state.index, 0);
  assert.notDeepEqual(ambientParticles(state), first);
  handleKey(
    state,
    { name: "m", sequence: "m", ctrl: false, shift: false },
    () => {},
  );
  const paused = ambientParticles(state),
    time = state.ambientTime;
  state.tick(6000);
  assert.equal(state.ambientTime, time);
  assert.deepEqual(ambientParticles(state), paused);
  handleKey(
    state,
    { name: "n", sequence: "n", ctrl: false, shift: false },
    () => {},
  );
  assert.equal(state.lighting, "day");
  const day = renderScene(state, 120, 42);
  state.cycleLighting();
  assert.equal(state.lighting, "night");
  assert.notDeepEqual(renderScene(state, 120, 42).cells, day.cells);
  assert.ok(daylight(60000) < daylight(0));
  assert.notDeepEqual(
    Array.from({ length: 20 }, (_, i) => cloudShade(i * 5, 0, 0)),
    Array.from({ length: 20 }, (_, i) => cloudShade(i * 5, 0, 60000)),
  );
  state.zoomAt(0.05);
  state.settleCamera();
  assert.equal(state.atlasMode, true);
  assert.ok(ambientParticles(state).some((p) => p.kind === "boat"));
  state.close();
});
