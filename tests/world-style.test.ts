import test from "node:test";
import assert from "node:assert/strict";
import { repositoryIdentity, styleFor } from "../src/world-style.ts";
import { AtlasIndex } from "../src/atlas.ts";
import { createCityLayout } from "../src/city.ts";
import { geographyFor } from "../src/geography.ts";
import type { RepoFile } from "../src/types.ts";
const paths = [
  "src/main.ts",
  "docs/readme.md",
  "tests/main.test.ts",
  "packages/ui/index.ts",
];
const files: RepoFile[] = paths.map((path) => ({
  path,
  directory: path.split("/").slice(0, -1).join("/"),
  language: "TypeScript",
  size: 300,
  commits: 1,
  contributors: 1,
  createdAt: "2020-01-01",
  lastModified: "2020-01-01",
}));
test("GitHub URL, SSH URL, and owner/repo share a stable world identity", () => {
  for (const input of [
    "facebook/react",
    "https://github.com/Facebook/React.git",
    "git@github.com:facebook/react.git",
  ]) {
    assert.equal(repositoryIdentity(input), "facebook/react");
    assert.deepEqual(styleFor(input), styleFor("facebook/react"));
  }
});
test("different repositories have different terrain while historical settlement positions stay fixed", () => {
  const atlas = new AtlasIndex(paths),
    layout = createCityLayout(paths),
    full = atlas.territories("", layout.build(files).buildings),
    early = atlas.territories("", layout.build(files.slice(0, 2)).buildings);
  const world = geographyFor(full, "facebook/react"),
    other = geographyFor(full, "expressjs/express"),
    before = geographyFor(early, "facebook/react");
  assert.notDeepEqual(
    Array.from({ length: 20 }, (_, i) => world.elevation(i * 14, 17)),
    Array.from({ length: 20 }, (_, i) => other.elevation(i * 14, 17)),
  );
  for (const site of before.settlements) {
    const later = world.settlements.find(
      (s) => s.region.path === site.region.path,
    )!;
    assert.deepEqual([later.x, later.y], [site.x, site.y]);
    assert.equal(world.land(later.x, later.y), true);
  }
  assert.equal(geographyFor(full, "https://github.com/facebook/react"), world);
});
