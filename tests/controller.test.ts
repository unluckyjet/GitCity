import assert from "node:assert/strict";
import test from "node:test";
import { CityController } from "../src/controller.ts";
import type { RepoFile, Repository } from "../src/types.ts";

function file(path: string, lines?: number): RepoFile {
  return {
    path,
    directory: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".",
    language: "TypeScript",
    size: 4096,
    lines,
    commits: 3,
    contributors: 2,
    createdAt: "2020-01-01T00:00:00Z",
    lastModified: "2026-01-01T00:00:00Z",
  };
}

function repository(
  snapshots: RepoFile[][],
  overrides: Partial<Repository> = {},
): Repository {
  return {
    name: "controller-fixture",
    root: "/fixture",
    commits: snapshots.map((_, index) => ({
      hash: index.toString(16).padStart(40, "0"),
      date: `2020-01-${(index + 1).toString().padStart(2, "0")}T00:00:00Z`,
      author: "Test Author",
      subject: `Commit ${index + 1}`,
      changes: [],
    })),
    allPaths: [
      ...new Set(
        snapshots.flatMap((snapshot) => snapshot.map((item) => item.path)),
      ),
    ],
    async snapshot(index) {
      return snapshots[index]!;
    },
    async inspect(index, path) {
      return snapshots[index]!.find((item) => item.path === path);
    },
    async dispose() {},
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("a slow old snapshot cannot replace a newer seek that finishes first", async () => {
  const slow = deferred<RepoFile[]>(),
    fast = deferred<RepoFile[]>();
  const state = new CityController(
    repository([[file("a.ts")], [file("b.ts")], [file("c.ts")]], {
      snapshot: (index) => (index === 1 ? slow.promise : fast.promise),
    }),
    { history: true, speed: 1 },
  );
  const oldRequest = state.seek(1);
  const newRequest = state.seek(2);
  assert.equal(state.requestedIndex, 2);
  assert.equal(state.loading, true);
  fast.resolve([file("c.ts")]);
  await newRequest;
  assert.equal(state.index, 2);
  assert.equal(state.loading, false);
  slow.resolve([file("b.ts")]);
  await oldRequest;
  assert.equal(state.index, 2);
  assert.deepEqual(
    state.city.buildings.map((building) => building.path),
    ["c.ts"],
  );
  assert.equal(state.error, "");
});

test("an outdated failed seek cannot clear the current loading state or show an error", async () => {
  const old = deferred<RepoFile[]>(),
    current = deferred<RepoFile[]>();
  const state = new CityController(
    repository([[file("a.ts")], [file("b.ts")], [file("c.ts")]], {
      snapshot: (index) => (index === 1 ? old.promise : current.promise),
    }),
    { history: true, speed: 1 },
  );
  const oldRequest = state.seek(1);
  const currentRequest = state.seek(2);
  old.reject(new Error("outdated failure"));
  await oldRequest;
  assert.equal(state.loading, true);
  assert.equal(state.error, "");
  current.resolve([file("c.ts")]);
  await currentRequest;
  assert.equal(state.loading, false);
  assert.equal(state.index, 2);
});

test("playback rewinds from the final commit, advances, stops at the end, and can restart", async () => {
  const state = new CityController(
    repository([[file("a.ts")], [file("a.ts"), file("b.ts")], [file("b.ts")]]),
    { history: false, speed: 1 },
  );
  await state.init();
  assert.equal(state.index, 2);
  await state.togglePlayback();
  assert.equal(state.index, 0);
  assert.equal(state.playing, true);
  assert.equal(state.timelineMode, true);
  state.tick(125);
  await flush();
  assert.equal(state.index, 1);
  state.tick(250);
  await flush();
  assert.equal(state.index, 2);
  assert.equal(state.playing, false);
  await state.togglePlayback();
  assert.equal(state.index, 0);
  assert.equal(state.playing, true);
  await state.togglePlayback();
  state.tick(1000);
  await flush();
  assert.equal(state.playing, false);
  assert.equal(state.index, 0);
});

test("pressing play then pause during a slow rewind does not start playback afterward", async () => {
  const rewind = deferred<RepoFile[]>();
  const state = new CityController(
    repository([[file("a.ts")], [file("b.ts")]], {
      snapshot: (index) =>
        index === 0 ? rewind.promise : Promise.resolve([file("b.ts")]),
    }),
    { history: false, speed: 1 },
  );
  await state.init();
  const playRequest = state.togglePlayback();
  assert.equal(state.loading, true);
  await state.togglePlayback();
  rewind.resolve([file("a.ts")]);
  await playRequest;
  assert.equal(state.playing, false);
  state.tick(1000);
  await flush();
  assert.equal(state.index, 0);
});

test("a manual seek superseding a pending replay rewind leaves playback stopped", async () => {
  const rewind = deferred<RepoFile[]>();
  const state = new CityController(
    repository([[file("a.ts")], [file("b.ts")], [file("c.ts")]], {
      snapshot: (index) =>
        index === 0
          ? rewind.promise
          : Promise.resolve([file(index === 1 ? "b.ts" : "c.ts")]),
    }),
    { history: false, speed: 1 },
  );
  await state.init();
  const playRequest = state.togglePlayback();
  await state.seek(1);
  rewind.resolve([file("a.ts")]);
  await playRequest;
  assert.equal(state.index, 1);
  assert.equal(state.playing, false);
});

test("cycling backwards from no selection starts at the last building and wraps", async () => {
  const state = new CityController(
    repository([[file("a.ts"), file("b.ts"), file("c.ts")]]),
    { history: true, speed: 1 },
  );
  await state.init();
  state.cycle(-1);
  assert.equal(state.selected, "c.ts");
  state.cycle(1);
  assert.equal(state.selected, "a.ts");
  state.cycle(-1);
  assert.equal(state.selected, "c.ts");
});

test("seeking to a deletion removes the selected building and its inspector details", async () => {
  const state = new CityController(
    repository([[file("a.ts", 42), file("b.ts", 100)], [file("b.ts", 100)]]),
    { history: true, speed: 1 },
  );
  await state.init();
  state.select(
    state.city.buildings.find((building) => building.path === "a.ts")!,
  );
  await state.inspect();
  assert.equal(state.detail?.lines, 42);
  await state.seek(1);
  assert.equal(state.selected, undefined);
  assert.equal(state.selectedBuilding, undefined);
  assert.equal(state.detail, undefined);
  assert.deepEqual(
    state.city.buildings.map((building) => building.path),
    ["b.ts"],
  );
});

test("an inspection result for a previous selection never replaces the current details", async () => {
  const first = deferred<RepoFile | undefined>(),
    second = deferred<RepoFile | undefined>();
  const state = new CityController(
    repository([[file("a.ts"), file("b.ts")]], {
      inspect: (_index, path) =>
        path === "a.ts" ? first.promise : second.promise,
    }),
    { history: true, speed: 1 },
  );
  await state.init();
  state.select(
    state.city.buildings.find((building) => building.path === "a.ts")!,
  );
  const firstRequest = state.inspect();
  state.select(
    state.city.buildings.find((building) => building.path === "b.ts")!,
  );
  second.resolve(file("b.ts", 222));
  await flush();
  assert.equal(state.detail?.path, "b.ts");
  first.resolve(file("a.ts", 111));
  await firstRequest;
  assert.equal(state.selected, "b.ts");
  assert.equal(state.detail?.path, "b.ts");
  assert.equal(state.detail?.lines, 222);
});

test("an inspection result for the same file at an older commit cannot replace new details", async () => {
  const old = deferred<RepoFile | undefined>(),
    current = deferred<RepoFile | undefined>();
  const state = new CityController(
    repository([[file("a.ts")], [file("a.ts")]], {
      inspect: (index) => (index === 0 ? old.promise : current.promise),
    }),
    { history: true, speed: 1 },
  );
  await state.init();
  state.select(state.city.buildings[0]!);
  const oldRequest = state.inspect();
  await state.seek(1);
  current.resolve(file("a.ts", 200));
  await flush();
  old.resolve(file("a.ts", 10));
  await oldRequest;
  assert.equal(state.index, 1);
  assert.equal(state.detail?.lines, 200);
});

test("an inspection failure after its file is deleted is ignored", async () => {
  const pending = deferred<RepoFile | undefined>();
  const state = new CityController(
    repository([[file("a.ts")], []], {
      inspect: () => pending.promise,
    }),
    { history: true, speed: 1 },
  );
  await state.init();
  state.select(state.city.buildings[0]!);
  const inspection = state.inspect();
  await state.seek(1);
  pending.reject(new Error("old file inspection failed"));
  await inspection;
  assert.equal(state.selected, undefined);
  assert.equal(state.error, "");
});

test("camera movement leaves history unchanged while consecutive steps use the requested commit", async () => {
  const pendingOne = deferred<RepoFile[]>(),
    pendingTwo = deferred<RepoFile[]>();
  const files = Array.from({ length: 30 }, (_, index) =>
    file(`src/file-${index}.ts`),
  );
  const state = new CityController(
    repository([files, files, files], {
      snapshot: (index) =>
        index === 0
          ? Promise.resolve(files)
          : index === 1
            ? pendingOne.promise
            : pendingTwo.promise,
    }),
    { history: true, speed: 1 },
  );
  await state.init();
  state.timelineMode = false;
  state.viewport = { width: 20, height: 10 };
  const prior = { ...state.cameraTarget };
  state.move(4, 2);
  assert.equal(state.index, 0);
  assert.equal(state.requestedIndex, 0);
  assert.equal(state.timelineMode, false);
  assert.equal(state.autoCamera, false);
  assert.notDeepEqual(state.cameraTarget, prior);
  const first = state.step(1);
  const second = state.step(1);
  assert.equal(state.requestedIndex, 2);
  assert.equal(state.timelineMode, true);
  pendingTwo.resolve(files);
  await second;
  pendingOne.resolve(files);
  await first;
  assert.equal(state.index, 2);
});

test("closing the controller prevents pending work from publishing a new frame", async () => {
  const next = deferred<RepoFile[]>(),
    inspection = deferred<RepoFile | undefined>();
  const state = new CityController(
    repository([[file("a.ts")], [file("b.ts")]], {
      snapshot: (index) =>
        index === 0 ? Promise.resolve([file("a.ts")]) : next.promise,
      inspect: () => inspection.promise,
    }),
    { history: true, speed: 1 },
  );
  await state.init();
  state.select(state.city.buildings[0]!);
  const detailRequest = state.inspect();
  const seekRequest = state.seek(1);
  let notifications = 0;
  state.onChange = () => notifications++;
  state.close();
  inspection.resolve(file("a.ts", 100));
  next.resolve([file("b.ts")]);
  await Promise.all([detailRequest, seekRequest]);
  assert.equal(state.index, 0);
  assert.equal(state.detail, undefined);
  assert.equal(state.playing, false);
  assert.equal(notifications, 0);
});

test("slow snapshots keep one playback request in flight and catch up to elapsed time afterward", async () => {
  const firstFrame = deferred<RepoFile[]>();
  const files = [file("a.ts")];
  const requested: number[] = [];
  const state = new CityController(
    repository(
      Array.from({ length: 301 }, () => files),
      {
        snapshot(index) {
          requested.push(index);
          return index === 1 ? firstFrame.promise : Promise.resolve(files);
        },
      },
    ),
    { history: true, speed: 1 },
  );
  await state.init();
  await state.togglePlayback();
  state.tick(125);
  state.tick(625);
  state.tick(1125);
  assert.deepEqual(requested, [0, 1]);
  assert.equal(state.loading, true);
  firstFrame.resolve(files);
  await flush();
  assert.equal(state.index, 1);
  state.tick(1250);
  await flush();
  // A 300-commit history tours at ten commits per second: time spent waiting
  // for the tree is retained, so the next rendered frame is commit 12.
  assert.deepEqual(requested, [0, 1, 12]);
  assert.equal(state.index, 12);
  assert.equal(state.loading, false);
  state.close();
});

test("automatic city fitting yields to panning and keyboard inspection", async () => {
  const files = [file("a/first.ts"), file("z/last.ts")];
  const repo = repository(
    Array.from({ length: 101 }, (_, i) => (i < 10 ? files.slice(0, 1) : files)),
  );
  for (const commit of repo.commits) {
    commit.changes = [
      { path: "z/last.ts", status: "modified", added: 1, removed: 0 },
    ];
  }
  const state = new CityController(repo, { history: true, speed: 1 });
  state.viewport = { width: 20, height: 20 };
  await state.init();
  const initialCamera = { ...state.cameraTarget };
  await state.togglePlayback();
  state.tick(125);
  await flush();
  state.tick(1625);
  await flush();
  assert.equal(state.autoCamera, true);
  assert.notDeepEqual(state.cameraTarget, initialCamera);

  state.move(-4, -2);
  const manualCamera = { ...state.cameraTarget };
  state.tick(3250);
  await flush();
  assert.equal(state.autoCamera, false);
  assert.deepEqual(state.cameraTarget, manualCamera);

  state.resetCamera(true);
  await state.inspect();
  assert.ok(state.selected);
  const inspectorCamera = { ...state.cameraTarget };
  state.tick(4750);
  await flush();
  assert.equal(state.autoCamera, false);
  assert.deepEqual(state.cameraTarget, inspectorCamera);
  state.close();
});
