import { spawn } from "node:child_process";
import {
  createCliRenderer,
  Renderable,
  RGBA,
  type CliRenderer,
  type OptimizedBuffer,
  type RenderContext,
  type KeyEvent,
} from "@opentui/core";
import { CityController } from "./controller.ts";
import { renderScene, palette, type Scene } from "./scene.ts";
import type { AppOptions, Repository } from "./types.ts";

const colors = new Map<string, RGBA>();
function color(hex: string) {
  let value = colors.get(hex);
  if (!value) {
    value = RGBA.fromHex(hex);
    colors.set(hex, value);
  }
  return value;
}

export class CityView extends Renderable {
  readonly controller: CityController;
  scene: Scene | undefined;
  private frame = 0;
  constructor(ctx: RenderContext, controller: CityController) {
    super(ctx, {
      id: "gitcity-world",
      width: "100%",
      height: "100%",
      buffered: true,
    });
    this.controller = controller;
    this.onMouseDown = (event) => {
      if (!this.scene || controller.help) return;
      const x = event.x - this.screenX,
        y = event.y - this.screenY;
      const action = [...this.scene.actions]
        .reverse()
        .find(
          (a) =>
            x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height,
        );
      if (action) {
        action.run();
        return;
      }
      if (controller.searchOpen) return;
      if (y === 3) {
        if (x >= this.width - 20 && x < this.width - 17)
          controller.zoomAt(1 / 1.4);
        else if (x >= this.width - 16 && x < this.width - 13)
          controller.zoomAt(1.4);
        else if (x >= this.width - 12 && x < this.width - 7)
          controller.resetCamera(true);
        return;
      }
      if (y >= this.scene.timelineY - 1 && y <= this.scene.timelineY + 1) {
        controller.stopPlayback();
        controller.timelineMode = true;
        void controller.seek(
          ((x - 9) / Math.max(1, this.width - 19)) *
            (controller.repository.commits.length - 1),
        );
        return;
      }
      if (
        controller.panel &&
        x >=
          this.width -
            Math.min(
              controller.inspectorTab === "details" ? 42 : 82,
              this.width - 6,
            ) -
            3 &&
        y >= 5 &&
        y < 5 + Math.min(20, this.height - 13)
      )
        return;
      const hit = [...this.scene.hits]
        .reverse()
        .find(
          (h) =>
            x >= h.x && x < h.x + h.width && y >= h.y && y < h.y + h.height,
        );
      if (hit) {
        if (hit.members && hit.members.length > 1)
          controller.zoomToGroup(hit.members);
        else {
          controller.select(hit.building, true);
          controller.onChange();
        }
      }
    };
    this.onMouseMove = (event) => {
      if (
        !this.scene ||
        controller.searchOpen ||
        controller.help ||
        controller.panel
      )
        return;
      const x = event.x - this.screenX,
        y = event.y - this.screenY;
      const action = [...this.scene.actions]
        .reverse()
        .find(
          (a) =>
            x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height,
        );
      const label = action?.label ?? "";
      if (controller.hovered !== label) {
        controller.hovered = label;
        controller.onChange();
      }
    };
    this.onMouseScroll = (event) => {
      if (controller.help || controller.searchOpen || !event.scroll) return;
      const x = event.x - this.screenX,
        y = event.y - this.screenY;
      if (y < 5 || y >= this.height - 9) return;
      if (
        controller.panel &&
        x >=
          this.width -
            Math.min(
              controller.inspectorTab === "details" ? 42 : 82,
              this.width - 6,
            ) -
            3
      )
        return;
      if (event.scroll.direction === "up" || event.scroll.direction === "down")
        controller.zoomAt(
          event.scroll.direction === "up" ? 1.3 : 1 / 1.3,
          x - 2,
          y - 5,
        );
    };
  }
  protected onResize(width: number, height: number) {
    super.onResize(width, height);
    if (this.controller) {
      this.controller.resizeViewport(width - 4, Math.max(1, height - 14));
    }
  }
  protected onUpdate() {
    this.frame++;
  }
  protected renderSelf(buffer: OptimizedBuffer) {
    buffer.clear(color(palette.bg));
    this.scene = renderScene(
      this.controller,
      this.width,
      this.height,
      this.frame,
    );
    for (let y = 0; y < this.scene.height; y++) {
      let x = 0;
      while (x < this.scene.width) {
        const first = this.scene.cells[y * this.scene.width + x];
        let run = first.char,
          end = x + 1;
        while (end < this.scene.width) {
          const c = this.scene.cells[y * this.scene.width + end];
          if (c.fg !== first.fg || c.bg !== first.bg) break;
          run += c.char;
          end++;
        }
        buffer.drawText(run, x, y, color(first.fg), color(first.bg));
        x = end;
      }
    }
  }
}

export function handleKey(
  state: CityController,
  key: Pick<KeyEvent, "name" | "sequence" | "ctrl" | "shift">,
  quit: () => void,
) {
  const name = key.name.toLowerCase();
  if (state.searchOpen && !(key.ctrl && name === "c")) {
    if (name === "escape") state.searchOpen = false;
    else if (name === "return" || name === "enter") state.activateResult();
    else if (name === "up" || name === "down")
      state.resultIndex = Math.max(
        0,
        Math.min(
          state.results.length - 1,
          state.resultIndex + (name === "up" ? -1 : 1),
        ),
      );
    else if (name === "backspace")
      state.updateSearch([...state.query].slice(0, -1).join(""));
    else if (
      !key.ctrl &&
      key.sequence &&
      !/[\u0000-\u001f\u007f]/.test(key.sequence)
    )
      state.updateSearch(state.query + key.sequence);
    state.onChange();
    return;
  }
  if (key.sequence === "/" || name === "/") {
    state.openSearch();
    return;
  }
  if ((key.sequence === "D" || (name === "d" && key.shift)) && state.selected) {
    void state.loadContent("diff");
    return;
  }
  if (name === "v" && state.selected) {
    void state.loadContent("source");
    return;
  }
  if (name === "g" && state.selected) {
    state.openGitHub();
    return;
  }
  if (state.panel && (name === "pageup" || name === "pagedown")) {
    state.contentScroll = Math.max(
      0,
      state.contentScroll + (name === "pageup" ? -10 : 10),
    );
    state.onChange();
    return;
  }
  if (name === "q" || (key.ctrl && name === "c")) {
    quit();
    return;
  }
  if (name === "?" || key.sequence === "?") {
    state.help = !state.help;
    state.onChange();
    return;
  }
  if (name === "escape") {
    if (state.help) state.help = false;
    else if (state.panel) state.panel = false;
    else {
      state.timelineMode = false;
      state.stopPlayback();
      if (state.selected) state.selected = undefined;
      else state.back();
    }
    state.onChange();
    return;
  }
  if (state.help) return;
  if (name === "space" || key.sequence === " ") {
    void state.togglePlayback();
    return;
  }
  if (name === "t") {
    state.timelineMode = !state.timelineMode;
    state.onChange();
    return;
  }
  if (name === "tab") {
    if (state.panel) {
      state.panel = false;
      state.onChange();
    } else void state.inspect();
    return;
  }
  if (name === "return" || name === "enter") {
    void state.inspect();
    return;
  }
  if (name === "home") {
    state.stopPlayback();
    void state.seek(0);
    return;
  }
  if (name === "end") {
    state.stopPlayback();
    void state.seek(state.repository.commits.length - 1);
    return;
  }
  if (name === "r") {
    state.resetCamera();
    return;
  }
  if (key.sequence === "[" || name === "[") {
    state.cycle(-1);
    return;
  }
  if (key.sequence === "]" || name === "]") {
    state.cycle(1);
    return;
  }
  if (["+", "="].includes(key.sequence) || name === "+" || name === "=") {
    state.zoomAt(1.4);
    return;
  }
  if (key.sequence === "-" || name === "-") {
    state.zoomAt(1 / 1.4);
    return;
  }
  if ([",", "<"].includes(key.sequence)) {
    state.setSpeed(-1);
    return;
  }
  if ([".", ">"].includes(key.sequence)) {
    state.setSpeed(1);
    return;
  }
  if (state.timelineMode && (name === "left" || name === "right")) {
    void state.step((name === "left" ? -1 : 1) * (key.shift ? 10 : 1));
    return;
  }
  const amount = key.shift ? 10 : 4;
  if (name === "a" || name === "left") state.move(-amount, 0);
  if (name === "d" || name === "right") state.move(amount, 0);
  if (name === "w" || name === "up") state.move(0, -Math.ceil(amount / 2));
  if (name === "s" || name === "down") state.move(0, Math.ceil(amount / 2));
}

export async function runApp(
  repository: Repository,
  options: AppOptions,
): Promise<void> {
  const state = new CityController(repository, options);
  state.onOpenUrl = (url) => {
    if (!/^https:\/\/github\.com\//.test(url)) return;
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "explorer.exe"
          : "xdg-open";
    const child = spawn(command, [url], { stdio: "ignore" });
    child.on("error", (error) => {
      state.error = `Could not open browser: ${error.message}`;
      state.onChange();
    });
    child.unref();
  };
  await state.init();
  if (state.error) throw new Error(state.error);
  const renderer: CliRenderer = await createCliRenderer({
    exitOnCtrlC: false,
    targetFps: 12,
    maxFps: 24,
    backgroundColor: palette.bg,
    useMouse: true,
  });
  const view = new CityView(renderer, state);
  state.onChange = () => view.requestRender();
  renderer.root.add(view);
  const timer = setInterval(() => state.tick(performance.now()), 50);
  renderer.start();
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = (error?: unknown) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      state.close();
      renderer.destroy();
      error ? reject(error) : resolve();
    };
    renderer.on("destroy", () => finish());
    renderer.on("render:error", (event) => finish(event.error));
    renderer.keyInput.on("keypress", (key) =>
      handleKey(state, key, () => finish()),
    );
  });
}
