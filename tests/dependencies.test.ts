import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDependencies } from "../src/dependencies.ts";
import { loadRepository } from "../src/repository.ts";
import { CityController } from "../src/controller.ts";
import { renderScene } from "../src/scene.ts";
import { resolve } from "node:path";
test("syntax graph resolves relative/index/extension imports, aliases and workspace packages without comment/string false positives", () => {
  const texts = new Map(
    Object.entries({
      "src/main.ts": `// import fake from './fake';\nconst s="require('./fake')"; import x from './one.js'; export * from '@/two'; const y = require('pkg'); import('./folder'); import('external');`,
      "src/one.ts": "",
      "src/two.ts": "",
      "src/folder/index.ts": "",
      "src/fake.ts": "",
      "lib/index.ts": "",
      "lib/package.json": '{"name":"pkg","main":"index.ts"}',
      "tsconfig.json":
        '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}',
    }),
  );
  const g = analyzeDependencies({ texts, skipped: [] }, [...texts.keys()]);
  assert.deepEqual(g.outgoing.get("src/main.ts"), [
    "lib/index.ts",
    "src/folder/index.ts",
    "src/one.ts",
    "src/two.ts",
  ]);
  assert.deepEqual(g.incoming.get("src/one.ts"), ["src/main.ts"]);
  assert.deepEqual(g.unresolved.get("src/main.ts"), ["external"]);
});
test("Git batch reads exact revision sources and dependency links navigate to actual files", async () => {
  const repo = await loadRepository(resolve("."));
  try {
    const latest = repo.commits.length - 1;
    const snapshot = await repo.sources!(latest);
    assert.ok(
      snapshot.texts.get("src/controller.ts")?.includes("CityController"),
    );
    const state = new CityController(repo, { history: false, speed: 1 });
    await state.init();
    state.visitFile("src/controller.ts");
    state.dependencyMode = true;
    await state.ensureGraph();
    assert.ok(state.connections.some((c) => c.path === "src/city.ts"));
    const scene = renderScene(state, 130, 42);
    const link = scene.actions.find((a) => a.label === "imports src/city.ts");
    assert.ok(link);
    link.run();
    assert.equal(state.selected, "src/city.ts");
    state.close();
  } finally {
    await repo.dispose();
  }
});
