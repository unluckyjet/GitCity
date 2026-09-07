import test from "node:test";
import assert from "node:assert/strict";
import { activityMetrics, createTour } from "../src/insights.ts";
import type { Commit, RepoFile } from "../src/types.ts";
const files: RepoFile[] = ["a.ts", "b.ts", "c.ts"].map((path, i) => ({
  path,
  directory: "",
  language: "TypeScript",
  size: (i + 1) * 100,
  commits: 3 - i,
  contributors: 2,
  createdAt: "2020-01-01",
  lastModified: "2020-01-01",
}));
const commits: Commit[] = Array.from({ length: 105 }, (_, i) => ({
  hash: String(i),
  date: "2020-01-01",
  author: i % 3 ? "A" : "B",
  subject: "touch",
  changes: [{ path: i < 5 ? "b.ts" : "a.ts", status: "modified" }],
}));
const graph = {
  outgoing: new Map([
    ["a.ts", ["b.ts"]],
    ["b.ts", ["a.ts", "c.ts"]],
  ]),
  incoming: new Map([
    ["a.ts", ["b.ts"]],
    ["b.ts", ["a.ts"]],
    ["c.ts", ["b.ts"]],
  ]),
  unresolved: new Map(),
  analyzed: 3,
  skipped: 0,
  entrypoints: ["a.ts"],
};
test("overlay data respects historical index, 100-commit window, real bytes, imports and dominant author", () => {
  assert.equal(
    activityMetrics("churn", files, commits, 104).get("b.ts")!.value,
    0,
  );
  assert.equal(
    activityMetrics("churn", files, commits, 4).get("b.ts")!.value,
    5,
  );
  assert.equal(
    activityMetrics("size", files, commits, 104).get("c.ts")!.value,
    300,
  );
  assert.equal(
    activityMetrics("dependents", files, commits, 104, graph).get("c.ts")!
      .value,
    1,
  );
  assert.match(
    activityMetrics("ownership", files, commits, 104).get("a.ts")!.label,
    /^A /,
  );
});
test("tours use true graph edges, stop at cycles, and rank busiest files", () => {
  const tour = createTour("journey", files, graph, "a.ts");
  assert.deepEqual(
    tour.map((s) => s.path),
    ["a.ts", "b.ts", "c.ts"],
  );
  assert.match(tour[1]!.caption, /a.ts imports/);
  assert.equal(createTour("busy", files)[0]!.path, "a.ts");
  assert.equal(createTour("entrypoints", files, graph)[0]!.path, "a.ts");
  assert.deepEqual(createTour("journey", files), []);
});
