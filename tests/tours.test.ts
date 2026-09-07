import test from "node:test";
import assert from "node:assert/strict";
import { createTestRenderer } from "@opentui/core/testing";
import { CityController } from "../src/controller.ts";
import { CityView, handleKey } from "../src/app.ts";
import { loadRepository } from "../src/repository.ts";
import { resolve } from "node:path";
test("native tour picker starts a journey, advances, pauses, stops and invalidates on seek", async () => {
  const repo = await loadRepository(resolve("."));
  const state = new CityController(repo, { history: false, speed: 1 });
  await state.init();
  const setup = await createTestRenderer({ width: 130, height: 42 });
  try {
    const view = new CityView(setup.renderer, state);
    setup.renderer.root.add(view);
    state.onChange = () => view.requestRender();
    state.visitFile("src/controller.ts");
    state.tourMenu = true;
    await setup.renderOnce();
    assert.match(setup.captureCharFrame(), /TAKE A WALK/);
    const action = view.scene!.actions.find(
      (a) => a.label === "Start journey tour",
    )!;
    assert.ok(action);
    await setup.mockMouse.click(action.x + 2, action.y);
    await state.ensureGraph();
    await new Promise((r) => setImmediate(r));
    await setup.renderOnce();
    assert.ok(state.tour);
    assert.ok(state.tour!.stops.length > 1);
    assert.equal(state.selected, "src/controller.ts");
    const key = (name: string) =>
      handleKey(
        state,
        { name, sequence: name, ctrl: false, shift: false },
        () => {},
      );
    key("]");
    assert.equal(state.tour!.index, 1);
    key("space");
    assert.equal(state.tour!.playing, false);
    const selected = state.selected;
    state.tick(20000);
    assert.equal(state.selected, selected);
    key("escape");
    assert.equal(state.tour, undefined);
    await state.startTour("busy");
    assert.ok(state.tour);
    await state.seek(0);
    assert.equal(state.tour, undefined);
  } finally {
    state.close();
    setup.renderer.destroy();
    await repo.dispose();
  }
});
