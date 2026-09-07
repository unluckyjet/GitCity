import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeView,
  encodeView,
  formatReplay,
  formatScreenshot,
  formatShareArtifact,
  shareCommand,
} from "../src/view.ts";
import { CityController } from "../src/controller.ts";
import { handleKey } from "../src/app.ts";
import { renderScene } from "../src/scene.ts";
import type { RepoFile, Repository } from "../src/types.ts";

function file(path: string, size = 800): RepoFile {
  return {
    path,
    directory: path.split("/").slice(0, -1).join("/") || ".",
    language: "TypeScript",
    size,
    lines: 40,
    commits: 2,
    contributors: 1,
    createdAt: "2020-01-01T00:00:00Z",
    lastModified: "2021-01-01T00:00:00Z",
  };
}

const files = [file("src/app.ts"), file("src/cli.ts"), file("README.md", 120)];

function repository(): Repository {
  return {
    name: "owner/city",
    root: "/fixture",
    githubUrl: "https://github.com/owner/city",
    allPaths: files.map((f) => f.path),
    commits: [
      {
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        date: "2020-01-01T00:00:00Z",
        author: "Ada",
        subject: "First streets",
        changes: files.map((f) => ({ path: f.path, status: "added" as const })),
      },
      {
        hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        date: "2021-01-01T00:00:00Z",
        author: "Ada",
        subject: "Grow the city",
        changes: [{ path: "src/cli.ts", status: "modified" }],
      },
    ],
    snapshot: async (index) => (index === 0 ? files.slice(0, 2) : files),
    inspect: async (_, path) => files.find((f) => f.path === path),
    dispose: async () => {},
  };
}

test("view tokens round-trip and produce a pasteable gitcity command", () => {
  const view = {
    zoom: 0.82,
    x: 12.4,
    y: -3.1,
    scope: "src",
    direct: true,
    selected: "src/cli.ts",
    at: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  const token = encodeView(view);
  assert.match(
    token,
    /^z:0\.82,x:12\.4,y:-3\.1,scope:src,direct:1,focus:src\/cli.ts,at:a{40}$/,
  );
  assert.deepEqual(decodeView(token), {
    ...view,
    zoom: 0.82,
    x: 12.4,
    y: -3.1,
  });
  const command = shareCommand("owner/city", view);
  assert.match(command, /^gitcity owner\/city --at a{40} --focus src\/cli.ts --view /);
  assert.doesNotThrow(() => decodeView(command.split("--view ")[1]!));
  assert.throws(() => decodeView("nope"), /Invalid view field/);
  assert.throws(() => decodeView("z:1,x:0"), /z, x, and y/);
});

test("Y yanks a screenshot plus command; --view restores camera, scope, and file", async () => {
  const state = new CityController(repository(), { history: false, speed: 1 });
  await state.init();
  state.viewport = { width: 80, height: 24 };
  const house = state.city.buildings.find((b) => b.path === "src/cli.ts")!;
  state.enter("src");
  state.select(house, true);
  state.zoomAt(1.6);
  const before = {
    zoom: state.zoom,
    x: state.camera.x,
    y: state.camera.y,
    scope: state.scope,
    selected: state.selected,
  };
  handleKey(state, { name: "y", sequence: "y", ctrl: false, shift: false }, () => {});
  assert.ok(state.share);
  assert.match(state.share, /GIT CITY SHARE/);
  assert.match(state.share, /gitcity owner\/city --at b{40} --focus src\/cli.ts --view /);
  assert.match(state.share, /SCREENSHOT/);
  assert.match(state.share, /GIT CITY/);
  assert.match(state.share, /cli\.ts/);
  const token = state.viewToken();
  const scene = renderScene(state, 84, 38);
  const shot = formatScreenshot(scene);
  assert.match(shot, /GIT CITY/);
  assert.match(shot, /owner\/city/);

  const replayed = new CityController(repository(), {
    history: false,
    speed: 1,
    view: token,
  });
  await replayed.init();
  assert.equal(replayed.scope, before.scope);
  assert.equal(replayed.selected, before.selected);
  assert.ok(Math.abs(replayed.zoom - before.zoom) < 1e-5);
  assert.ok(Math.abs(replayed.camera.x - before.x) < 1e-5);
  assert.ok(Math.abs(replayed.camera.y - before.y) < 1e-5);
  assert.equal(replayed.autoCamera, false);

  await state.seek(0);
  const early = formatScreenshot(renderScene(state, 84, 38));
  await state.seek(1);
  const late = formatScreenshot(renderScene(state, 84, 38));
  const replay = formatReplay([
    { title: state.repository.commits[0]!.hash.slice(0, 8), body: early },
    { title: state.repository.commits[1]!.hash.slice(0, 8), body: late },
  ]);
  assert.match(replay, /== aaaaaaaa ==/);
  assert.match(replay, /== bbbbbbbb ==/);
  assert.match(replay, /GIT CITY/);
  assert.ok(early.includes("src") || late.includes("README"));
  const artifact = formatShareArtifact(
    shareCommand("owner/city", state.captureView()),
    late,
    replay,
  );
  assert.match(artifact, /REPLAY/);
  assert.match(artifact, /gitcity owner\/city/);
  handleKey(state, { name: "escape", sequence: "\u001b", ctrl: false, shift: false }, () => {});
  assert.equal(state.share, undefined);
  state.close();
  replayed.close();
});
