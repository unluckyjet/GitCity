import { planNeighborhood, settlementLots } from "./urban.ts";
import { architectureFor } from "./architecture.ts";
import type { CityController } from "./controller.ts";
import type { Action } from "./scene.ts";
import { noise, type Geography, type Settlement } from "./geography.ts";

interface Painter {
  width: number;
  top: number;
  bottom: number;
  put: (x: number, y: number, char: string, fg: string, bg?: string) => void;
  text: (x: number, y: number, text: string, fg: string, max?: number) => void;
  actions: Action[];
}
const ink = {
  sea: "#102d40",
  deep: "#0b2333",
  shallows: "#24505a",
  sand: "#9caa7e",
  grass: "#36594b",
  forest: "#244d43",
  hill: "#526b52",
  road: "#b5a478",
  roof: "#d78962",
  wall: "#baa990",
  light: "#ffe0a1",
  muted: "#83aaa1",
};
function hash(value: string) {
  let n = 0;
  for (const c of value) n = (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0;
  return n;
}
function terrain(x: number, y: number, geo: Geography) {
  const h = geo.elevation(x, y),
    n = geo.noise(x * 1.5, y * 1.5);
  if (h < -0.08) return geo.style.deep;
  if (h < 0.012) return geo.style.sea;
  if (h < 0.048) return ink.shallows;
  if (h < 0.088) return geo.style.sand;
  if (geo.river(x, y)) return geo.style.sea;
  if (n > 0.47 && h > 0.34) return geo.style.hill;
  return n < -0.08 ? geo.style.forest : geo.style.grass;
}
export function paintLandscape(
  state: CityController,
  p: Painter,
  settlements = true,
) {
  const z = state.zoom,
    cx = state.camera.x,
    cy = state.camera.y;
  const sx = (x: number) => Math.round((x - cx) * z) + 2,
    sy = (y: number) => Math.round((y - cy) * z) + p.top;
  const geo = state.geography;
  // Half-cell terrain doubles the vertical resolution of the native TUI.
  for (let y = p.top; y < p.bottom; y++) {
    let previous: Settlement | undefined,
      start = 2;
    for (let x = 2; x < p.width - 2; x++) {
      const wx = cx + (x - 2) / z,
        wy = cy + (y - p.top) / z;
      p.put(x, y, "▀", terrain(wx, wy, geo), terrain(wx, wy + 0.5 / z, geo));
      const site = settlements ? geo.pick(wx, wy) : undefined;
      if (site !== previous) {
        if (previous) {
          const chosen = previous;
          p.actions.push({
            x: start,
            y,
            width: x - start,
            height: 1,
            label: `${chosen.region.path || "./"} · ${chosen.region.buildings.length} files`,
            run: () => state.enter(chosen.region.path, chosen.region.direct),
          });
        }
        start = x;
        previous = site;
      }
      if (x === p.width - 3 && site) {
        const chosen = site;
        p.actions.push({
          x: start,
          y,
          width: x - start + 1,
          height: 1,
          label: `${site.region.path || "./"} · ${site.region.buildings.length} files`,
          run: () => state.enter(chosen.region.path, chosen.region.direct),
        });
      }
    }
  }
  // Fine contour detail stays subordinate to settlement silhouettes.
  for (let gy = 3; gy < 57; gy += 2.7)
    for (let gx = 6; gx < 277; gx += 6.3) {
      const wp = state.world.world(
          gx + noise(gx, gy) * 2,
          gy + noise(gy, gx) * 0.8,
        ),
        wx = wp.x,
        wy = wp.y;
      const h = geo.elevation(wx, wy),
        n = geo.noise(wx * 1.5, wy * 1.5),
        x = sx(wx),
        y = sy(wy);
      if (
        h > 0.13 &&
        !geo.river(wx, wy) &&
        geo.settlements.every((s) => Math.hypot((s.x - wx) / 3, s.y - wy) > 3.2)
      ) {
        if (n > 0.53 && h > 0.37) {
          p.put(x, y, "▲", "#8d9c77");
          p.put(x + 1, y, "▴", "#667e63");
        } else if (n < -0.22) p.put(x, y, "♠", "#497b5d");
      } else if (
        h < -0.16 &&
        hash(`${Math.round(gx)},${Math.round(gy)}`) % 11 === 0
      )
        p.put(x, y, "~", "#21475b");
    }
  // Roads are visual connections between folders, not inferred dependencies.
  for (const road of state.worldGeography.roads) {
    let last: { x: number; y: number } | undefined;
    for (const point of road.points) {
      const x = sx(point.x),
        y = sy(point.y);
      if (last && (x !== last.x || y !== last.y)) {
        const char =
          y === last.y
            ? "─"
            : x === last.x
              ? "│"
              : (x - last.x) * (y - last.y) > 0
                ? "╲"
                : "╱";
        p.put(x, y, char, geo.river(point.x, point.y) ? "#e0c496" : ink.road);
      }
      last = { x, y };
    }
  }
  if (settlements)
    for (const b of state.visibleBuildings) {
      const x = sx(b.x + b.width / 2),
        y = sy(b.y);
      if (x >= 2 && x < p.width - 2 && y >= p.top && y < p.bottom)
        p.put(x, y, "▄", architectureFor(b.path, state.worldStyle).roof);
    }
  if (!settlements) return;
  const ordered = [...geo.settlements].sort((a, b) => a.y - b.y || a.x - b.x);
  const largest = [...geo.settlements].sort(
    (a, b) => b.region.buildings.length - a.region.buildings.length,
  )[0];
  for (const site of ordered) {
    const x = sx(site.x),
      y = sy(site.y),
      major = site.size >= (geo.level ? 5 : 8),
      dominant = site === largest;
    const large = major && z * state.world.scale >= 0.33,
      seed = hash(site.region.path),
      spread = large ? 5 : 2;
    if (x < -10 || x > p.width + 10 || y < p.top - 6 || y > p.bottom + 6)
      continue;
    // Warm roof clusters gather around a taller civic center.
    const count = large ? (geo.level ? 18 : 11) : site.size > 4 ? 5 : 2;
    if (large) {
      for (let dx = -7; dx <= 7; dx++)
        p.put(x + dx, y + 1, "─", ink.road, "#586451");
      for (let dy = -3; dy <= 3; dy++) p.put(x - 7, y + dy, "│", ink.road);
      p.put(x - 1, y + 2, "▪", "#8fb1a0");
      p.put(x, y + 2, "◉", "#87b9b9");
      p.put(x + 1, y + 2, "▪", "#8fb1a0");
    }
    for (let i = 0; i < count; i++) {
      const lot = settlementLots(count)[i]!;
      const bx = x + Math.round(lot.x * (large ? 1 : 0.5)),
        by = y + lot.y;
      const architecture = architectureFor(
        site.region.buildings[i % site.region.buildings.length]!.path,
        state.worldStyle,
      );
      p.put(
        bx,
        by - 1,
        architecture.kind === "workshop"
          ? "◢"
          : architecture.kind === "library"
            ? "▰"
            : "▄",
        architecture.roof,
      );
      p.put(bx, by, "▪", i % 2 === 0 ? ink.light : ink.wall);
      p.actions.push({
        x: bx,
        y: by - 1,
        width: large ? 2 : 1,
        height: 3,
        label: `${site.region.path || "./"} · ${site.region.buildings.length} files`,
        run: () => state.enter(site.region.path, site.region.direct),
      });
      if (large && i % 3 === 0) {
        p.put(bx + 1, by, "▐", "#816e58");
        p.put(bx, by + 1, "▀", "#213e37");
      }
    }
    if (dominant || large) {
      p.put(x, y - 3, dominant ? "╷" : "│", ink.light);
      p.put(x, y - 2, "▲", dominant ? "#edce8c" : "#d3ae7d");
      p.put(x - 1, y - 1, "▟", ink.wall);
      p.put(x, y - 1, "█", ink.light);
      p.put(x + 1, y - 1, "▙", ink.wall);
      p.put(x - 1, y, "▥", ink.wall);
      p.put(x, y, "▥", ink.light);
      p.put(x + 1, y, "▥", ink.wall);
      p.put(x - 1, y + 1, "▀", "#213e37");
      p.put(x, y + 1, "▀", "#213e37");
      p.put(x + 1, y + 1, "▀", "#213e37");
    }
    p.actions.push({
      x: Math.max(2, x - spread),
      y: Math.max(p.top, y - 3),
      width: spread * 2 + 2,
      height: 6,
      label: `${site.region.path || "./"} · ${site.region.buildings.length.toLocaleString()} files · click to explore`,
      run: () => state.enter(site.region.path, site.region.direct),
    });
  }
  for (const dock of geo.docks) {
    const x = sx(dock.x),
      y = sy(dock.y);
    p.put(x - 1, y, "╞", "#d0ad77");
    p.put(x, y, "═", "#d0ad77");
    p.put(x + 1, y, "╡", "#d0ad77");
    p.actions.push({
      x: x - 1,
      y,
      width: 3,
      height: 1,
      label: `${dock.site.region.path || "./"} · ${dock.site.region.buildings.length} files`,
      run: () => state.enter(dock.site.region.path, dock.site.region.direct),
    });
  }
  // Cartographic labels use real folder names; smaller sites reveal on hover.
  const occupied: { x: number; y: number; w: number; h: number }[] = [];
  for (const site of [...geo.settlements].sort((a, b) => b.size - a.size)) {
    const label =
      site.region.label === "./" && !state.scope
        ? state.repository.name.split("/").at(-1)!
        : site.region.label;
    const x = sx(site.x),
      y = sy(site.y),
      w = Math.min(
        29,
        Math.max(
          label.length + 2,
          site.region.buildings.length.toLocaleString().length + 8,
        ),
      );
    const positions = [
      { x: x - Math.floor(w / 2), y: y + 3 },
      { x: x - Math.floor(w / 2), y: y - 5 },
      { x: x + 5, y: y },
    ];
    const at = positions.find(
      (a) =>
        a.x >= 3 &&
        a.x + w < p.width - 3 &&
        a.y >= p.top + 1 &&
        a.y + 1 < p.bottom - 1 &&
        !occupied.some(
          (b) =>
            a.x < b.x + b.w + 2 &&
            a.x + w + 2 > b.x &&
            a.y < b.y + b.h + 1 &&
            a.y + 2 > b.y,
        ),
    );
    if (!at || (site.size < 3 && z * state.world.scale < 0.6)) continue;
    occupied.push({ ...at, w, h: 2 });
    p.text(at.x, at.y, label, site === largest ? "#ffe2ae" : "#dfe6cf", w);
    if (site.size > 7)
      p.text(
        at.x,
        at.y + 1,
        site.region.buildings.length.toLocaleString() + " files",
        ink.muted,
        w,
      );
    p.actions.push({
      x: at.x,
      y: at.y,
      width: w,
      height: 2,
      label: `${site.region.path || "./"} · ${site.region.buildings.length} files`,
      run: () => state.enter(site.region.path, site.region.direct),
    });
  }
  // A restrained compass provides orientation without naming the metaphor.
  p.text(p.width - 9, p.top + 1, "N", "#a4b8b4", 1);
  p.put(p.width - 9, p.top + 2, "↑", "#7e9d9e");
}

export function paintNeighborhood(state: CityController, p: Painter) {
  const z = state.zoom,
    cx = state.camera.x,
    cy = state.camera.y;
  paintLandscape(state, p, false);
  const sx = (x: number) => Math.round((x - cx) * z) + 2,
    sy = (y: number) => Math.round((y - cy) * z) + p.top;
  const plan = planNeighborhood(state.visibleCity);
  for (const street of plan.streets)
    for (let i = 1; i < street.points.length; i++) {
      const a = street.points[i - 1]!,
        b = street.points[i]!;
      const ax = sx(a.x),
        ay = sy(a.y),
        bx = sx(b.x),
        by = sy(b.y);
      const left = Math.max(2, Math.min(ax, bx)),
        right = Math.min(p.width - 3, Math.max(ax, bx)),
        top = Math.max(p.top, Math.min(ay, by)),
        bottom = Math.min(p.bottom - 1, Math.max(ay, by));
      if (ay === by) {
        if (ay < p.top || ay >= p.bottom) continue;
        for (let xx = left; xx <= right; xx++) {
          p.put(
            xx,
            ay,
            street.kind === "avenue" && Math.floor((xx - ax) / 3) % 2 === 0
              ? "─"
              : " ",
            "#a6a58d",
            "#293334",
          );
          if (z > 0.5 && street.kind === "avenue") {
            p.put(xx, ay - 1, "▄", "#687467");
            p.put(xx, ay + 1, "▀", "#586654");
          }
        }
        if (z > 0.5 && street.kind === "avenue")
          for (let wx = a.x + 3; wx < b.x; wx += 22) {
            const lx = sx(wx);
            p.put(lx, ay - 2, "•", "#ffda92");
            p.put(lx, ay - 1, "│", "#889884");
          }
      } else if (ax === bx) {
        if (ax < 2 || ax >= p.width - 2) continue;
        for (let yy = top; yy <= bottom; yy++)
          p.put(
            ax,
            yy,
            street.kind === "avenue" && yy % 3 === 0 ? "┊" : " ",
            "#9d9d85",
            street.kind === "avenue" ? "#293334" : "#687064",
          );
      }
    }
  if (z > 0.45)
    for (const place of plan.places) {
      const x = sx(place.x),
        y = sy(place.y),
        w = Math.max(3, Math.round(place.width * z));
      if (place.kind === "garden") {
        for (let i = 0; i < w; i++)
          p.put(
            x + i,
            y,
            i % 2 === 0 ? "♠" : "·",
            i % 2 === 0 ? "#739d70" : "#d0b37e",
            "#355b42",
          );
      } else {
        for (let i = 0; i < w; i++)
          p.put(x + i, y, i % 2 === 0 ? "▦" : "·", "#99a391", "#586456");
        p.put(
          x + Math.floor(w / 2),
          y,
          place.kind === "square" ? "◉" : "♠",
          place.kind === "square" ? "#a7d2c9" : "#a8c18f",
          "#586456",
        );
      }
    }
}
