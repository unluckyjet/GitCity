import assert from "node:assert/strict";
import test from "node:test";
import { createCityLayout, languageColor } from "../src/city.ts";
import type { Building, RepoFile } from "../src/types.ts";

function file(path: string, size = 2048): RepoFile {
  return {
    path,
    directory: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".",
    language: "TypeScript",
    size,
    commits: 3,
    contributors: 2,
    createdAt: "2020-01-01T00:00:00Z",
    lastModified: "2026-01-01T00:00:00Z",
  };
}

function position(building: Building): number[] {
  return [building.x, building.y, building.width];
}

test("history additions and deletions preserve each surviving building's position", () => {
  const paths = ["README.md", "src/a.ts", "src/b.ts", "tests/a.test.ts"];
  const layout = createCityLayout(paths);
  const early = layout.build([file("src/b.ts", 100), file("README.md")]);
  const latest = layout.build(paths.map((path) => file(path, 100_000)));
  const deleted = layout.build([file("src/b.ts", 100_000)]);
  const original = early.buildings.find(
    (building) => building.path === "src/b.ts",
  )!;
  const grown = latest.buildings.find(
    (building) => building.path === "src/b.ts",
  )!;
  assert.deepEqual(position(original), position(grown));
  assert.deepEqual(position(grown), position(deleted.buildings[0]!));
  assert.ok(grown.height > original.height);
  assert.deepEqual([early.width, early.height], [latest.width, latest.height]);
  assert.equal(deleted.districts.length, 1);
  assert.equal(deleted.buildings.length, 1);
  assert.equal(deleted.buildings[0]!.id, "src/b.ts");
});

test("input order and duplicate historical paths do not affect layout", () => {
  const paths = ["src/B.ts", "src/a.ts", "docs/guide.md", "package.json"];
  const files = paths.map((path) => file(path));
  assert.deepEqual(
    createCityLayout(paths).build(files),
    createCityLayout([...paths].reverse().concat(paths[0]!)).build(
      [...files].reverse(),
    ),
  );
});

test("directory neighborhoods preserve exact paths and leave room for their tallest buildings", () => {
  const files = [
    file("src/api/index.ts", 1e9),
    file("src/components/index.ts", 1e9),
    file("index.ts", 1e9),
  ];
  const city = createCityLayout(files.map((item) => item.path)).build(files);
  assert.deepEqual(
    city.districts.map((district) => district.path),
    [".", "src/api", "src/components"],
  );
  for (const district of city.districts) {
    for (const building of district.buildings) {
      assert.equal(building.directory, district.path);
      assert.ok(building.x >= district.x);
      assert.ok(building.x + building.width < district.x + district.width);
      assert.ok(building.y - building.height >= district.y + 2);
      assert.ok(building.y < district.y + district.height);
    }
  }
  assert.equal(
    new Set(city.buildings.map((building) => building.id)).size,
    files.length,
  );
});

test("a huge directory is packed into nonoverlapping compact blocks with no missing files", () => {
  const files = Array.from({ length: 1800 }, (_, index) =>
    file(`src/module-${index.toString().padStart(4, "0")}.ts`, index * 100),
  );
  const city = createCityLayout(files.map((item) => item.path)).build(files);
  assert.equal(city.buildings.length, 1800);
  assert.equal(city.districts.length, 150);
  assert.ok(city.width / city.height > 1);
  assert.ok(city.width / city.height < 4);
  for (let index = 0; index < city.districts.length; index++) {
    const a = city.districts[index]!;
    assert.equal(a.path, "src");
    assert.ok(a.buildings.length <= 12);
    for (const b of city.districts.slice(index + 1)) {
      assert.ok(
        a.x + a.width + 5 <= b.x ||
          b.x + b.width + 5 <= a.x ||
          a.y + a.height + 4 <= b.y ||
          b.y + b.height + 4 <= a.y,
      );
    }
  }
  const footprints = new Set(
    city.buildings.map((building) => `${building.x},${building.y}`),
  );
  assert.equal(footprints.size, files.length);
});

test("file sizes map monotonically to bounded heights and language materials are consistent", () => {
  const sizes = [-1, 0, 100, 500, 1000, 10_000, 100_000, 1e12];
  const files = sizes.map((size, index) => file(`file-${index}.ts`, size));
  const city = createCityLayout(files.map((item) => item.path)).build(files);
  const heights = city.buildings.map((building) => building.height);
  assert.deepEqual(
    heights,
    [...heights].sort((a, b) => a - b),
  );
  assert.equal(heights[0], 2);
  assert.equal(heights.at(-1), 12);
  assert.ok(
    city.buildings.every(
      (building) => building.width >= 5 && building.width <= 9,
    ),
  );
  assert.ok(new Set(city.buildings.map((building) => building.width)).size > 1);
  assert.equal(languageColor(" TypeScript "), languageColor("typescript"));
  assert.notEqual(languageColor("TypeScript"), languageColor("JavaScript"));
  assert.match(languageColor("unrecognized"), /^#[0-9a-f]{6}$/);
});

test("empty snapshots and previously unknown paths retain valid geometry", () => {
  assert.deepEqual(createCityLayout([]).build([]), {
    districts: [],
    buildings: [],
    width: 0,
    height: 0,
  });
  const layout = createCityLayout(["existing.ts"]);
  const before = layout.build([file("existing.ts")]);
  const after = layout.build([file("existing.ts"), file("later.ts")]);
  assert.deepEqual(
    position(before.buildings[0]!),
    position(
      after.buildings.find((building) => building.id === "existing.ts")!,
    ),
  );
  assert.equal(after.buildings.length, 2);
  const empty = layout.build([]);
  assert.equal(empty.buildings.length, 0);
  assert.equal(empty.districts.length, 0);
  assert.deepEqual([empty.width, empty.height], [after.width, after.height]);
});
