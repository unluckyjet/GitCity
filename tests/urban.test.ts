import test from "node:test";
import assert from "node:assert/strict";
import { createCityLayout } from "../src/city.ts";
import { planNeighborhood, pathPoint, settlementLots } from "../src/urban.ts";
import type { RepoFile } from "../src/types.ts";
const files: RepoFile[] = Array.from({ length: 30 }, (_, i) => ({
  path: `src/file${i}.ts`,
  directory: "src",
  language: "TypeScript",
  size: 20000,
  commits: 1,
  contributors: 1,
  createdAt: "2020-01-01",
  lastModified: "2020-01-01",
}));
test("every file faces an avenue and plazas occupy clear gaps between building rows", () => {
  const city = createCityLayout(files.map((f) => f.path)).build(files),
    plan = planNeighborhood(city);
  assert.equal(plan.entrances.size, files.length);
  assert.ok(plan.places.some((p) => p.kind === "square"));
  assert.ok(plan.places.some((p) => p.kind === "garden"));
  assert.ok(plan.places.some((p) => p.kind === "courtyard"));
  for (const b of city.buildings) {
    const entry = plan.entrances.get(b.path)!;
    assert.equal(entry.y, b.y + 2);
    assert.ok(
      plan.streets.some(
        (s) =>
          s.kind === "avenue" &&
          s.points.some((p) => p.y === entry.y) &&
          s.points[0]!.x <= entry.x &&
          s.points.at(-1)!.x >= entry.x,
      ),
    );
  }
  for (const p of plan.places)
    for (const b of city.buildings)
      assert.ok(
        p.x + p.width <= b.x ||
          p.x >= b.x + b.width ||
          p.y + p.height <= b.y - b.height ||
          p.y > b.y,
        `${p.kind} overlaps ${b.path}`,
      );
  assert.equal(planNeighborhood(city), plan);
});
test("planned settlement lots do not overlap and traffic traverses paths by distance", () => {
  const lots = settlementLots(30);
  assert.equal(new Set(lots.map((p) => `${p.x},${p.y}`)).size, 30);
  assert.ok(lots.every((p) => p.x !== 0));
  const line = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 10 },
  ];
  assert.deepEqual(pathPoint(line, 0.5), { x: 20, y: 0 });
  assert.deepEqual(pathPoint(line, 1), { x: 0, y: 0 });
});
