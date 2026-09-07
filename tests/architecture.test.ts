import test from "node:test";
import assert from "node:assert/strict";
import { architectureFor, paintArchitecture } from "../src/architecture.ts";
import { styleFor } from "../src/world-style.ts";
import type { Building } from "../src/types.ts";
const style = styleFor("unluckyjet/GitCity");
test("actual file roles select distinct architectural silhouettes with shared folder materials", () => {
  const roles = {
    "docs/guide.md": "library",
    "scripts/build.ts": "workshop",
    "src/components/Button.tsx": "shop",
    "src/Button.test.ts": "observatory",
    "package.json": "utility",
    "src/main.ts": "home",
  };
  for (const [path, kind] of Object.entries(roles))
    assert.equal(architectureFor(path, style).kind, kind);
  const a = architectureFor("src/a.ts", style),
    b = architectureFor("src/b.tsx", style);
  assert.equal(a.family, b.family);
  assert.equal(a.roof, b.roof);
  assert.equal(a.wall, b.wall);
  assert.notDeepEqual(
    architectureFor("src/a.ts", style),
    architectureFor("src/a.ts", styleFor("facebook/react")),
  );
  const drawings = new Set<string>();
  for (const path of Object.keys(roles)) {
    const cells: string[] = [];
    paintArchitecture(
      { path } as Building,
      style,
      10,
      10,
      20,
      8,
      10,
      (x, y, char) => cells.push(`${x},${y}:${char}`),
    );
    drawings.add(cells.join("|"));
  }
  assert.equal(drawings.size, Object.keys(roles).length);
});
