import test from "node:test";
import assert from "node:assert/strict";
import { WorldMap } from "../src/world.ts";
import { createCityLayout } from "../src/city.ts";
import { CityController } from "../src/controller.ts";
import type { RepoFile, Repository } from "../src/types.ts";

function file(path: string, size = 400): RepoFile {
  return {
    path,
    directory: path.split("/").slice(0, -1).join("/") || ".",
    language: "TypeScript",
    size,
    lines: 20,
    commits: 1,
    contributors: 1,
    createdAt: "2020-01-01T00:00:00Z",
    lastModified: "2020-01-01T00:00:00Z",
  };
}

function repo(files: RepoFile[]): Repository {
  return {
    name: "owner/city",
    root: "/fixture",
    githubUrl: "https://github.com/owner/city",
    allPaths: files.map((f) => f.path),
    commits: [
      {
        hash: "a".repeat(40),
        date: "2020-01-01T00:00:00Z",
        author: "Test",
        subject: "City",
        changes: files.map((f) => ({ path: f.path, status: "added" as const })),
      },
    ],
    snapshot: async () => files,
    inspect: async (_, path) => files.find((f) => f.path === path),
    dispose: async () => {},
  };
}

test("world and normalized are inverses; city center maps onto the island", () => {
  const paths = ["src/a.ts", "src/b.ts", "lib/c.ts", "docs/readme.md"];
  const world = new WorldMap(createCityLayout(paths, paths), paths, "owner/city");
  for (const point of [
    { x: 0, y: 0 },
    { x: 140, y: 29 },
    { x: world.lifetime.width / 2, y: world.lifetime.height / 2 },
    { x: 12.25, y: 7.5 },
  ]) {
    const round = world.normalized(world.world(point.x, point.y).x, world.world(point.x, point.y).y);
    assert.ok(Math.abs(round.x - point.x) < 1e-9);
    assert.ok(Math.abs(round.y - point.y) < 1e-9);
    const back = world.world(
      world.normalized(point.x, point.y).x,
      world.normalized(point.x, point.y).y,
    );
    assert.ok(Math.abs(back.x - point.x) < 1e-9);
    assert.ok(Math.abs(back.y - point.y) < 1e-9);
  }
  const center = world.normalized(
    world.lifetime.width / 2,
    world.lifetime.height / 2,
  );
  assert.ok(Math.abs(center.x - 140) < 1e-9);
  assert.ok(Math.abs(center.y - 29) < 1e-9);
});

test("settlements sit on land in city space after inland placement", async () => {
  const files = Array.from({ length: 40 }, (_, i) =>
    file(`pkg/${i < 20 ? "core" : "ui"}/f${i}.ts`),
  );
  const state = new CityController(repo(files), { history: false, speed: 1 });
  await state.init();
  assert.ok(state.geography.settlements.length > 0);
  for (const site of state.geography.settlements) {
    assert.ok(
      state.geography.land(site.x, site.y),
      `${site.region.path} at ${site.x},${site.y}`,
    );
  }
  state.close();
});

test("terrain at a city point matches the island sample at its normalized atlas point", () => {
  const paths = Array.from({ length: 40 }, (_, i) =>
    `pkg/${i < 20 ? "core" : "ui"}/f${i}.ts`,
  );
  const world = new WorldMap(createCityLayout(paths, paths), paths, "owner/city");
  const x = world.lifetime.buildings[0]!.x;
  const y = world.lifetime.buildings[0]!.y;
  const atlas = world.normalized(x, y);
  const geo = world.geography([]);
  assert.equal(geo.elevation(x, y), world.terrain.elevation(atlas.x, atlas.y));
  assert.equal(geo.river(x, y), world.terrain.river(atlas.x, atlas.y));
});

test("entering a folder keeps building coordinates; zoom keeps settlement anchors", async () => {
  const files = [
    file("src/one.ts"),
    file("src/two.ts"),
    file("lib/util.ts"),
    file("docs/guide.md", 80),
  ];
  const state = new CityController(repo(files), { history: false, speed: 1 });
  await state.init();
  const before = state.city.buildings.map((b) => [b.path, b.x, b.y, b.width]);
  const house = state.city.buildings.find((b) => b.path === "src/one.ts")!;
  state.enter("src");
  const nested = state.visibleBuildings.find((b) => b.path === "src/one.ts")!;
  assert.deepEqual([nested.x, nested.y, nested.width], [house.x, house.y, house.width]);
  assert.deepEqual(
    state.city.buildings.map((b) => [b.path, b.x, b.y, b.width]),
    before,
  );
  state.back();
  const sites = state.geography.settlements.map((s) => [
    s.region.path,
    s.x,
    s.y,
  ]);
  state.zoomAt(0.2);
  assert.deepEqual(
    state.geography.settlements.map((s) => [s.region.path, s.x, s.y]),
    sites,
  );
  const geo = state.geography;
  const sample = geo.elevation(house.x, house.y);
  state.zoomAt(3);
  assert.equal(state.geography.elevation(house.x, house.y), sample);
  state.close();
});
