import { architectureFor, paintArchitecture } from "./architecture.ts";
import { paintLandscape, paintNeighborhood } from "./landscape.ts";
import { geographyFor } from "./geography.ts";
import { inScope } from "./atlas.ts";
import type { CityController } from "./controller.ts";
import type { Building } from "./types.ts";
import stringWidth from "string-width";

export const palette = {
  bg: "#090e16",
  panel: "#101925",
  ink: "#e7e8e0",
  muted: "#637487",
  dim: "#253346",
  road: "#172332",
  gold: "#edbc72",
  green: "#84c6ae",
};
export interface Cell {
  char: string;
  fg: string;
  bg: string;
}
export interface Hit {
  x: number;
  y: number;
  width: number;
  height: number;
  building: Building;
  members?: Building[];
}
export interface Action {
  x: number;
  y: number;
  width: number;
  height: number;
  run: () => void;
  label?: string;
}
export interface Scene {
  actions: Action[];
  width: number;
  height: number;
  cells: Cell[];
  hits: Hit[];
  timelineY: number;
}

/** All terminal control characters in Git metadata are rendered as ordinary spaces. */
export function safeText(text: string) {
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
}
const fmt = (n: number) => n.toLocaleString("en-US");
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
// OpenTUI renders our text-mode play triangle in one cell (emoji width libraries
// otherwise classify this particular unqualified symbol as two cells).
const cellWidth = (segment: string) =>
  ["▶", "▪"].includes(segment) ? 1 : stringWidth(segment);
const textWidth = (value: string) =>
  [...segmenter.segment(value)].reduce(
    (sum, { segment }) => sum + cellWidth(segment),
    0,
  );
export function mix(color: string, factor: number) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(parseInt(color.slice(i, i + 2), 16) * factor)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function hash(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function date(text?: string) {
  return text
    ? new Date(text).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "No commits";
}

export function renderScene(
  state: CityController,
  width: number,
  height: number,
  frame = 0,
): Scene {
  width = Math.max(1, Math.floor(width));
  height = Math.max(1, Math.floor(height));
  const cells: Cell[] = Array.from({ length: width * height }, () => ({
    char: " ",
    fg: palette.ink,
    bg: palette.bg,
  }));
  const hits: Hit[] = [];
  const actions: Action[] = [];
  const put = (
    x: number,
    y: number,
    char: string,
    fg = palette.ink,
    bg = palette.bg,
  ) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < width && y >= 0 && y < height)
      cells[y * width + x] = { char, fg, bg };
  };
  const text = (
    x: number,
    y: number,
    value: string,
    fg = palette.ink,
    bg = palette.bg,
    max = width - x,
  ) => {
    const clean = safeText(value),
      truncated = textWidth(clean) > max,
      limit = Math.max(0, max - (truncated ? 1 : 0));
    let used = 0;
    for (const { segment } of segmenter.segment(clean)) {
      const size = cellWidth(segment);
      if (used + size > limit) break;
      if (size > 0) {
        put(x + used, y, segment, fg, bg);
        for (let i = 1; i < size; i++) put(x + used + i, y, "", fg, bg);
        used += size;
      }
    }
    if (truncated && max > 0) put(x + used, y, "…", fg, bg);
  };
  const fill = (
    x: number,
    y: number,
    w: number,
    h: number,
    bg: string,
    char = " ",
    fg = palette.dim,
  ) => {
    for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy++)
      for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx++)
        put(xx, yy, char, fg, bg);
  };
  const line = (
    x: number,
    y: number,
    w: number,
    color = palette.dim,
    char = "─",
  ) => text(x, y, char.repeat(Math.max(0, w)), color);
  if (width < 55 || height < 20) {
    text(2, 2, "GIT CITY", palette.gold);
    text(2, 4, "Give the view a little more room.");
    text(2, 6, "Resize to at least 55 × 20.  Q to quit.", palette.muted);
    return { width, height, cells, hits, actions, timelineY: height - 5 };
  }
  text(2, 1, "▟▙", palette.gold);
  text(6, 1, "GIT CITY", palette.gold);
  text(17, 1, "/", palette.dim);
  text(
    20,
    1,
    state.repository.name,
    palette.ink,
    palette.bg,
    Math.max(10, width - 63),
  );
  const badge = state.playing
    ? "● LIVE HISTORY"
    : state.timelineMode
      ? "◷ TIME MACHINE"
      : "◉ EXPLORE";
  text(
    width - badge.length - 3,
    1,
    badge,
    state.playing ? palette.gold : palette.green,
  );
  line(2, 3, width - 4);
  const top = 5,
    bottom = height - 9,
    worldHeight = bottom - top;
  const cx = state.camera.x,
    cy = state.camera.y,
    zoom = state.zoom;
  const sx = (x: number) => Math.round((x - cx) * zoom) + 2;
  const sy = (y: number) => Math.round((y - cy) * zoom) + top;
  const overview = zoom < 0.35;
  const zoomLabel = `${state.autoCamera ? "AUTO" : "ZOOM"} ${(zoom * 100).toFixed(zoom < 0.1 ? 1 : 0)}%`;
  text(Math.max(2, width - 36), 3, zoomLabel, palette.gold, palette.bg, 15);
  text(width - 20, 3, "[−] [+] [FIT]", palette.gold);
  const inWorld = (
    x: number,
    y: number,
    c: string,
    fg = palette.dim,
    bg?: string,
  ) => {
    if (y >= top && y < bottom && x >= 2 && x < width - 2)
      put(
        x,
        y,
        c,
        fg,
        bg ?? cells[Math.round(y) * width + Math.round(x)]?.bg ?? palette.bg,
      );
  };
  const worldText = (
    x: number,
    y: number,
    t: string,
    fg = palette.muted,
    max = width - x - 2,
  ) => {
    let offset = 0;
    for (const { segment } of segmenter.segment(safeText(t))) {
      const size = cellWidth(segment);
      if (offset + size > max) break;
      if (size > 0 && x + offset >= 2 && x + offset + size <= width - 2) {
        inWorld(
          x + offset,
          y,
          segment,
          fg,
          cells[Math.round(y) * width + Math.round(x + offset)]?.bg ??
            palette.bg,
        );
        for (let i = 1; i < size; i++)
          inWorld(
            x + offset + i,
            y,
            "",
            fg,
            cells[Math.round(y) * width + Math.round(x + offset + i)]?.bg ??
              palette.bg,
          );
      }
      offset += size;
    }
  };

  if (!state.atlasMode)
    paintNeighborhood(state, {
      width,
      top,
      bottom,
      actions,
      put: (x, y, char, fg, bg) =>
        inWorld(
          x,
          y,
          char,
          fg,
          bg ?? cells[Math.round(y) * width + Math.round(x)]?.bg ?? palette.bg,
        ),
      text: worldText,
    });
  const now = new Date(state.commit?.date ?? Date.now()).getTime();
  const edited = new Set(
    state.commit?.changes
      .filter((c) => c.status !== "deleted")
      .map((c) => c.path),
  );
  const ordered = (state.atlasMode ? [] : state.visibleBuildings)
    .filter(
      (b) =>
        b.x + b.width + 2 > cx &&
        b.x < cx + (width - 4) / zoom &&
        b.y + 3 >= cy &&
        b.y - b.height - 3 < cy + worldHeight / zoom,
    )
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (overview) {
    const buckets = new Map<
      string,
      { x: number; y: number; members: Building[] }
    >();
    for (const building of ordered) {
      const x = sx(building.x + building.width / 2),
        y = sy(building.y - building.height / 2);
      if (x < 2 || x >= width - 2 || y < top || y >= bottom) continue;
      const key = `${x},${y}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.members.push(building);
      else buckets.set(key, { x, y, members: [building] });
    }
    for (const bucket of buckets.values()) {
      const selected = bucket.members.some((b) => b.path === state.selected);
      const building =
        bucket.members.find((b) => edited.has(b.path)) ?? bucket.members[0]!;
      const char =
        bucket.members.length > 4
          ? "▓"
          : bucket.members.length > 1
            ? "▥"
            : "▪";
      inWorld(
        bucket.x,
        bucket.y,
        char,
        selected ? palette.gold : mix(building.color, 0.9),
        "#0e1722",
      );
      hits.push({
        x: bucket.x,
        y: bucket.y,
        width: 1,
        height: 1,
        building,
        members: bucket.members,
      });
    }
  } else
    for (const b of ordered) {
      const x = sx(b.x),
        ground = sy(b.y);
      const bw = Math.max(2, Math.round(b.width * zoom));
      const transition = state.transitions.get(b.path);
      const growth =
        transition?.kind === "add"
          ? Math.max(0.15, Math.min(1, (state.clock - transition.start) / 800))
          : 1;
      const bh = Math.max(1, Math.round(b.height * zoom * growth));
      const roof = ground - bh;
      const selected = b.path === state.selected;
      const recentlyEdited = edited.has(b.path) || transition?.kind === "edit";
      const age = Math.max(
        0,
        (now - new Date(b.lastModified).getTime()) / 86400000,
      );
      const activity = Math.max(0.1, Math.exp(-age / 110));
      const architecture = architectureFor(b.path, state.worldStyle);
      const wall = selected ? mix(architecture.wall, 1.2) : architecture.wall,
        side = mix(architecture.wall, 0.65);
      const outline = selected
        ? palette.gold
        : mix(b.color, recentlyEdited ? 1 : 0.8);
      const seed = hash(b.path);
      const house =
        architecture.kind === "home" && b.height <= 5 && bw >= 4 && bh >= 3;
      for (let yy = roof + (house ? 2 : 1); yy <= ground; yy++) {
        inWorld(x, yy, "▏", outline, wall);
        for (let xx = 1; xx < bw; xx++) inWorld(x + xx, yy, " ", outline, wall);
        inWorld(x + bw, yy, "▐", mix(b.color, 0.5), side);
        if ((yy - roof) % 2 === 1)
          for (let xx = 1; xx < bw; xx += Math.max(2, Math.round(2 * zoom))) {
            const lit =
              ((seed + xx * 17 + (yy - roof) * 31) % 101) / 100 <
              activity * 0.7 + 0.12;
            const shimmer =
              recentlyEdited && Math.floor(frame / 8) % 3 === 0 ? 1 : 0.9;
            inWorld(
              x + xx,
              yy,
              lit ? "▪" : "·",
              lit ? mix("#ffe0a0", shimmer) : mix(b.color, 0.25),
              wall,
            );
          }
      }
      if (house) {
        const mid = x + Math.floor(bw / 2);
        inWorld(mid, roof, "▲", architecture.roof);
        for (let xx = 1; xx < bw; xx++)
          inWorld(x + xx, roof + 1, "▀", architecture.roof, wall);
        inWorld(x, roof + 1, "╱", outline);
        inWorld(x + bw, roof + 1, "╲", outline);
        inWorld(mid, ground, "▯", mix(b.color, 0.7), wall);
      } else {
        inWorld(x, roof, "┌", outline);
        for (let xx = 1; xx < bw; xx++)
          inWorld(x + xx, roof, "▀", mix(b.color, 0.9), mix(b.color, 0.65));
        if (bw >= 5)
          inWorld(x + bw - 2, roof, "▪", "#bfc8b3", mix(b.color, 0.65));
        inWorld(x + bw, roof, "╮", outline);
        if (bw >= 5) {
          inWorld(x + bw + 1, roof + 1, "╲", mix(b.color, 0.45));
          for (let yy = roof + 2; yy <= ground; yy++)
            inWorld(x + bw + 1, yy, "▐", mix(b.color, 0.32), side);
        }
        if (bh >= 7) {
          inWorld(x + Math.floor(bw / 2), roof - 1, "┴", outline);
          if (b.contributors >= 4)
            inWorld(x + Math.floor(bw / 2), roof - 2, "•", palette.gold);
        }
      }
      paintArchitecture(b, state.worldStyle, x, roof, ground, bw, bh, inWorld);
      for (let xx = 0; xx <= bw; xx++)
        inWorld(x + xx, ground + 1, "▀", mix(b.color, selected ? 0.4 : 0.18));
      if (selected) {
        worldText(
          Math.max(2, x - 1),
          roof - 3,
          "▾ " + b.path.split("/").pop(),
          palette.gold,
        );
        inWorld(x + Math.floor(bw / 2), ground + 2, "◆", palette.gold);
      }
      const hitY = Math.max(top, roof - 2),
        hitX = Math.max(2, x);
      const hitHeight = Math.min(bottom, ground + 2) - hitY,
        hitWidth = Math.min(width - 2, x + bw + 2) - hitX;
      if (hitHeight > 0 && hitWidth > 0)
        hits.push({
          x: hitX,
          y: hitY,
          width: hitWidth,
          height: hitHeight,
          building: b,
        });
    }
  if (state.atlasMode) {
    paintLandscape(state, {
      width,
      top,
      bottom,
      actions,
      put: (x, y, char, fg, bg) =>
        inWorld(
          x,
          y,
          char,
          fg,
          bg ?? cells[Math.round(y) * width + Math.round(x)]?.bg ?? palette.bg,
        ),
      text: worldText,
    });
  } else {
    for (const transition of state.transitions.values()) {
      if (transition.kind !== "delete") continue;
      const b = state.projectBuilding(transition.building);
      if (!inScope(b.path, state.scope, state.direct)) continue;
      const fade = Math.max(0, 1 - (state.clock - transition.start) / 1200);
      const x = sx(b.x),
        y = sy(b.y);
      for (let yy = sy(b.y - b.height); yy <= y; yy++)
        for (let xx = x; xx <= sx(b.x + b.width); xx++)
          inWorld(xx, yy, "░", mix("#ef9a90", fade * 0.55));
    }
  }
  text(
    3,
    4,
    state.hovered || state.activity,
    palette.muted,
    palette.bg,
    width - 6,
  );
  // Every breadcrumb is a navigable real folder.
  let crumbX = 2;
  const crumbs = [
    { label: state.repository.name.split("/").at(-1) || "./", path: "" },
    ...state.scope
      .split("/")
      .filter(Boolean)
      .map((label, i, parts) => ({
        label,
        path: parts.slice(0, i + 1).join("/"),
      })),
  ];
  for (const crumb of crumbs) {
    const label = crumb.label + " / ",
      available = width - 39 - crumbX;
    if (available < 4) break;
    const cw = Math.min(textWidth(label), available);
    text(crumbX, 3, label, palette.green, palette.bg, cw);
    actions.push({
      x: crumbX,
      y: 3,
      width: cw,
      height: 1,
      run: () => state.enter(crumb.path),
    });
    crumbX += cw;
  }
  // A small, clickable map of the active coordinate space.
  if (
    !state.autoCamera &&
    !state.panel &&
    !state.selected &&
    width >= 85 &&
    worldHeight >= 17
  ) {
    const mw = 23,
      mh = 8,
      mx = width - mw - 3,
      my = bottom - mh;
    fill(mx, my, mw, mh, palette.panel);
    const bounds = state.atlasMode
      ? { x: 0, y: 0, w: 280, h: 58 }
      : (() => {
          const bs = state.visibleBuildings;
          let x = Infinity,
            y = Infinity,
            r = -Infinity,
            b = -Infinity;
          for (const v of bs) {
            x = Math.min(x, v.x);
            y = Math.min(y, v.y - v.height);
            r = Math.max(r, v.x + v.width);
            b = Math.max(b, v.y);
          }
          return bs.length
            ? { x, y, w: Math.max(1, r - x), h: Math.max(1, b - y) }
            : { x: 0, y: 0, w: 1, h: 1 };
        })();
    const mapX = (x: number) =>
      mx + 1 + Math.round(((x - bounds.x) / bounds.w) * (mw - 3));
    const mapY = (y: number) =>
      my + 2 + Math.round(((y - bounds.y) / bounds.h) * (mh - 4));
    text(
      mx + 1,
      my,
      "MAP · click to move",
      palette.muted,
      palette.panel,
      mw - 2,
    );
    const points = state.atlasMode
      ? geographyFor(state.territories, state.worldStyle.key).settlements.map(
          (s) => ({
            x: s.x,
            y: s.y,
            color: s.region.color,
          }),
        )
      : state.visibleBuildings;
    for (const b of points)
      put(mapX(b.x), mapY(b.y), "·", b.color, palette.panel);
    const l = Math.max(mx + 1, Math.min(mx + mw - 2, mapX(cx))),
      r = Math.max(
        mx + 1,
        Math.min(mx + mw - 2, mapX(cx + (width - 4) / zoom)),
      );
    const t = Math.max(my + 2, Math.min(my + mh - 2, mapY(cy))),
      b = Math.max(
        my + 2,
        Math.min(my + mh - 2, mapY(cy + worldHeight / zoom)),
      );
    for (let xx = l; xx <= r; xx++) {
      put(xx, t, "─", palette.gold, palette.panel);
      put(xx, b, "─", palette.gold, palette.panel);
    }
    for (let yy = t; yy <= b; yy++) {
      put(l, yy, "│", palette.gold, palette.panel);
      put(r, yy, "│", palette.gold, palette.panel);
    }
    for (let yy = 0; yy < mh - 2; yy++)
      for (let xx = 0; xx < mw - 2; xx++)
        actions.push({
          x: mx + 1 + xx,
          y: my + 2 + yy,
          width: 1,
          height: 1,
          run: () =>
            state.recenter(
              bounds.x + (xx / (mw - 3)) * bounds.w,
              bounds.y + (yy / (mh - 4)) * bounds.h,
            ),
        });
  }
  if (!state.city.buildings.length) {
    text(
      5,
      top + Math.floor(worldHeight / 2),
      "No files at this commit.",
      palette.muted,
    );
    text(
      5,
      top + Math.floor(worldHeight / 2) + 2,
      "Press Space to travel forward.",
      palette.gold,
    );
  }

  // Timeline and commit density: a quiet transport bar below the city.
  const statsY = height - 8,
    chartY = height - 6,
    timelineY = height - 5;
  line(2, statsY - 1, width - 4);
  const districtCount = new Set(state.city.districts.map((d) => d.path)).size;
  text(
    3,
    statsY,
    `${fmt(state.city.buildings.length)} files  ·  ${fmt(districtCount)} folders`,
    palette.muted,
  );
  const count = `${fmt(state.index + 1)} / ${fmt(state.repository.commits.length)} commits`;
  text(width - count.length - 3, statsY, count, palette.muted);
  const left = 9,
    trackWidth = width - 18,
    progress =
      state.repository.commits.length < 2
        ? 1
        : state.index / (state.repository.commits.length - 1);
  const first = state.repository.commits[0]?.date.slice(0, 4) ?? "—",
    last = state.repository.commits.at(-1)?.date.slice(0, 4) ?? "—";
  text(3, timelineY, first, palette.muted);
  text(width - 7, timelineY, last, palette.muted);
  const bars = "▁▂▃▄▅▆▇█";
  for (let x = 0; x < trackWidth; x++) {
    const ci = Math.min(
      state.repository.commits.length - 1,
      Math.floor((x / trackWidth) * state.repository.commits.length),
    );
    const changes = state.repository.commits[ci]?.changes.length ?? 0;
    const n = Math.min(7, Math.floor(Math.log2(changes + 1)));
    put(
      left + x,
      chartY,
      bars[n],
      x / trackWidth <= progress ? mix(palette.gold, 0.55) : palette.dim,
    );
    put(
      left + x,
      timelineY,
      "─",
      x / trackWidth <= progress ? palette.gold : palette.dim,
    );
  }
  put(
    left + Math.round(progress * (trackWidth - 1)),
    timelineY,
    "●",
    palette.gold,
  );
  text(
    3,
    height - 3,
    `${state.playing ? "Ⅱ" : "▶"}  ${date(state.commit?.date)}  ·  ${state.speed}×`,
    palette.gold,
  );
  const subject = state.loading
    ? "Loading snapshot…"
    : state.error
      ? state.error
      : state.commit
        ? `${state.commit.hash.slice(0, 7)}  ${state.commit.subject}`
        : "";
  text(
    33,
    height - 3,
    subject,
    state.error ? "#ef9a90" : palette.muted,
    palette.bg,
    width - 36,
  );
  const footer = state.timelineMode
    ? "← → scrub   Space play   Wheel/+− zoom   , . speed   R fit   ? help"
    : overview
      ? "Click a block to zoom in   Wheel/+− zoom   Space replay   R fit   ? help"
      : "WASD move   Click select   / search   Enter inspect   Esc back   ? help";
  text(3, height - 1, footer, palette.muted, palette.bg, width - 6);

  if (state.selected && !state.panel) {
    const pw = Math.min(42, width - 6),
      px = width - pw - 3,
      py = top;
    fill(px, py, pw, 7, palette.panel);
    text(
      px + 2,
      py + 1,
      state.selected.split("/").at(-1)!,
      palette.gold,
      palette.panel,
      pw - 4,
    );
    const b = state.selectedBuilding;
    text(
      px + 2,
      py + 3,
      b
        ? `${b.language} · ${b.size.toLocaleString()} B · ${b.commits} commits`
        : "",
      palette.muted,
      palette.panel,
      pw - 4,
    );
    text(
      px + 2,
      py + 5,
      "[Enter details]  [V source]",
      palette.ink,
      palette.panel,
      pw - 4,
    );
    actions.push({
      x: px,
      y: py,
      width: pw,
      height: 7,
      run: () => {
        void state.inspect();
      },
    });
    actions.push({
      x: px + 19,
      y: py + 5,
      width: 12,
      height: 1,
      run: () => {
        void state.loadContent("source");
      },
    });
  }
  if (state.panel) {
    const pw = Math.min(state.inspectorTab === "details" ? 42 : 82, width - 6),
      ph =
        state.inspectorTab === "details"
          ? Math.min(22, worldHeight)
          : worldHeight,
      px = width - pw - 3,
      py = top;
    fill(px, py, pw, ph, palette.panel);
    for (let y = py; y < py + ph; y++)
      put(px, y, "│", palette.dim, palette.panel);
    const info = state.detail ?? state.selectedBuilding;
    text(px + 2, py + 1, "FILE DETAILS", palette.gold, palette.panel, pw - 4);
    text(px + 2, py + 2, "─".repeat(pw - 4), palette.dim, palette.panel);
    if (info && state.inspectorTab === "details") {
      const name = info.path.split("/").pop()!;
      text(px + 2, py + 4, name, palette.ink, palette.panel, pw - 4);
      const fields = [
        ["Language", info.language],
        [
          "Lines",
          info.lines === undefined
            ? state.detail
              ? "binary"
              : "…"
            : fmt(info.lines),
        ],
        [
          "Size",
          info.size < 1024
            ? `${info.size} B`
            : `${(info.size / 1024).toFixed(1)} KB`,
        ],
        ["Commits", fmt(info.commits)],
        ["Authors", fmt(info.contributors)],
        ["Changed", date(info.lastModified)],
      ];
      fields.slice(0, Math.max(0, ph - 8)).forEach(([label, value], i) => {
        text(px + 2, py + 6 + i, label, palette.muted, palette.panel);
        text(px + 12, py + 6 + i, value, palette.ink, palette.panel, pw - 14);
      });
      if (ph >= 17) {
        text(px + 2, py + 13, "PATH", palette.muted, palette.panel);
        for (let i = 0; i < 3; i++)
          text(
            px + 2,
            py + 14 + i,
            info.path.slice(i * (pw - 4), (i + 1) * (pw - 4)),
            palette.ink,
            palette.panel,
            pw - 4,
          );
      }
    } else if (!info)
      text(
        px + 2,
        py + 5,
        "Select a building to look inside.",
        palette.muted,
        palette.panel,
        pw - 4,
      );
    text(
      px + 2,
      py + ph - 1,
      "[ ] next / previous    Esc close",
      palette.muted,
      palette.panel,
      pw - 4,
    );
    actions.push({ x: px, y: py, width: pw, height: ph, run: () => {} });
    const tabs = [
      { label: "Info", key: "details" },
      { label: "V Source", key: "source" },
      { label: "D Diff", key: "diff" },
      { label: "G GitHub", key: "github" },
    ];
    let tx = px + 2;
    for (const tab of tabs) {
      text(
        tx,
        py + 3,
        tab.label,
        state.inspectorTab === tab.key ? palette.gold : palette.green,
        palette.panel,
        Math.max(0, px + pw - 2 - tx),
      );
      actions.push({
        x: tx,
        y: py + 3,
        width: tab.label.length,
        height: 1,
        run: () => {
          if (tab.key === "github") state.openGitHub();
          else if (tab.key === "details") {
            state.inspectorTab = "details";
            void state.inspect();
          } else void state.loadContent(tab.key as "source" | "diff");
        },
      });
      tx += tab.label.length + 2;
    }
    if (state.inspectorTab !== "details") {
      text(
        px + 2,
        py + 4,
        state.selected ?? "",
        palette.muted,
        palette.panel,
        pw - 4,
      );
      const rows = (
        state.contentLoading
          ? "Loading…"
          : state.content?.text || "No changes to this file in this commit."
      ).split("\n");
      const count = Math.max(1, ph - 8);
      state.contentScroll = Math.max(
        0,
        Math.min(state.contentScroll, Math.max(0, rows.length - count)),
      );
      rows
        .slice(state.contentScroll, state.contentScroll + count)
        .forEach((row, i) =>
          text(
            px + 2,
            py + 6 + i,
            row.replace(/\t/g, "  "),
            row.startsWith("+")
              ? palette.green
              : row.startsWith("-")
                ? "#ef9a90"
                : palette.ink,
            palette.panel,
            pw - 4,
          ),
        );
      text(
        px + 2,
        py + ph - 1,
        `PgUp/PgDn scroll · Esc close${state.content?.truncated ? " · truncated" : ""}`,
        palette.muted,
        palette.panel,
        pw - 4,
      );
    }
    // Panel occupies the foreground; clicks must not reach buildings behind it.
    for (let i = hits.length - 1; i >= 0; i--)
      if (hits[i].x >= px) hits.splice(i, 1);
  }
  if (state.help) {
    const pw = Math.min(67, width - 8),
      ph = Math.min(21, height - 4),
      px = Math.floor((width - pw) / 2),
      py = Math.floor((height - ph) / 2);
    fill(px, py, pw, ph, palette.panel);
    text(
      px + 3,
      py + 1,
      "EXPLORE YOUR REPOSITORY.",
      palette.gold,
      palette.panel,
      pw - 6,
    );
    const help = [
      "/               Search files and folders; Enter to fly",
      "V / D / G       Source / commit diff / open GitHub",
      "Esc / path      Return to parent / repository",
      "WASD / arrows   Pan the view",
      "Click / Enter   Zoom in / inspect files",
      "[ / ]           Previous / next file",
      "Tab             Toggle the inspector",
      "Space           Play / pause; restart at the end",
      "T               Switch explore / timeline controls",
      "← / →           Previous / next commit in timeline",
      "Home / End      First / latest commit",
      "Wheel / + / -   Zoom toward the pointer / center",
      "R               Fit view and restore automatic zoom",
      "Esc / ?         Close panel / help",
      "Q / Ctrl+C      Quit",
      ", / .           Slower / faster history playback",
      "Height = file size. Color = language.",
      "Lit windows = recent edits. Rooftop lights = authors.",
    ];
    help
      .slice(0, ph - 4)
      .forEach((row, i) =>
        text(
          px + 3,
          py + 3 + i,
          row,
          i >= 13 ? palette.muted : palette.ink,
          palette.panel,
          pw - 6,
        ),
      );
    hits.length = 0;
  }
  if (state.searchOpen) {
    const pw = Math.min(80, width - 8),
      ph = Math.min(height - 6, 19),
      px = Math.floor((width - pw) / 2),
      py = 4;
    fill(px, py, pw, ph, palette.panel);
    text(
      px + 2,
      py + 1,
      "FIND A PLACE  / " + state.query + "▏",
      palette.gold,
      palette.panel,
      pw - 4,
    );
    text(
      px + 2,
      py + 2,
      "Files and folders at this commit · ↑↓ select · Enter fly · Esc close",
      palette.muted,
      palette.panel,
      pw - 4,
    );
    const first = Math.max(0, state.resultIndex - (ph - 6));
    actions.length = 0;
    hits.length = 0;
    state.results.slice(first, first + ph - 5).forEach((r, i) => {
      const selected = first + i === state.resultIndex;
      text(
        px + 2,
        py + 4 + i,
        `${selected ? "›" : " "} ${r.kind === "folder" ? "▣" : "▪"} ${r.path}${r.kind === "folder" ? `/ (${r.count})` : ""}`,
        selected ? palette.gold : palette.ink,
        palette.panel,
        pw - 4,
      );
      actions.push({
        x: px,
        y: py + 4 + i,
        width: pw,
        height: 1,
        run: () => state.activateResult(first + i),
      });
    });
    if (!state.results.length)
      text(
        px + 2,
        py + 5,
        "No matching places in this commit.",
        palette.muted,
        palette.panel,
        pw - 4,
      );
  }
  return { width, height, cells, hits, actions, timelineY };
}
