import type { CityController } from "./controller.ts";
import { geographyFor } from "./geography.ts";
import { planNeighborhood, pathPoint, type Point } from "./urban.ts";
import { architectureFor, tint } from "./architecture.ts";
export interface Particle extends Point {
  kind: "car" | "boat" | "smoke";
  char: string;
  color: string;
}
export function daylight(
  time: number,
  mode: "auto" | "day" | "night" = "auto",
) {
  return mode === "day"
    ? 1
    : mode === "night"
      ? 0.43
      : 0.715 + 0.285 * Math.cos((time / 120000) * Math.PI * 2);
}
export function ambientParticles(state: CityController): Particle[] {
  const result: Particle[] = [],
    t = state.ambientTime;
  if (state.atlasMode) {
    const geo = geographyFor(state.territories, state.worldStyle.key);
    geo.roads.slice(0, 16).forEach((road, i) => {
      const point = pathPoint(road.points, t / 30000 + i * 0.19);
      result.push({
        ...point,
        kind: "car",
        char: "▪",
        color: i % 3 === 0 ? "#f7d991" : "#d79975",
      });
    });
    for (let i = 0; i < 2; i++) {
      const y = 7 + ((((t / 65000 + i * 0.45) % 1) + 1) % 1) * 46,
        x = geo.riverCourse(y);
      if (geo.elevation(x, y) > 0.08)
        result.push({ x, y, kind: "boat", char: "▰", color: "#d4e8dd" });
    }
    for (const site of geo.settlements
      .filter((s) =>
        s.region.buildings.some(
          (b) => architectureFor(b.path, state.worldStyle).kind === "workshop",
        ),
      )
      .slice(0, 7)) {
      const phase = (t / 4000 + site.x * 0.013) % 1;
      result.push({
        x: site.x + Math.sin(phase * 3) * 2,
        y: site.y - 4 - phase * 4,
        kind: "smoke",
        char: phase > 0.6 ? "·" : "°",
        color: tint("#b7c1b0", 1 - phase * 0.4),
      });
    }
  } else {
    const roads = planNeighborhood(state.visibleCity).streets.filter(
      (s) => s.kind === "avenue",
    );
    roads.slice(0, 24).forEach((road, i) => {
      const p = pathPoint(road.points, t / 24000 + i * 0.21);
      result.push({
        ...p,
        kind: "car",
        char: i % 2 ? "▰" : "▪",
        color: i % 3 === 0 ? "#efbb79" : "#a9c9c4",
      });
    });
    for (const b of state.visibleBuildings) {
      if (architectureFor(b.path, state.worldStyle).kind !== "workshop")
        continue;
      const phase = (t / 4200 + b.x * 0.013) % 1;
      result.push({
        x:
          b.x +
          b.width -
          2 / Math.max(0.2, state.zoom) +
          Math.sin(phase * 2) * 2,
        y: b.y - b.height - 2 / Math.max(0.2, state.zoom) - phase * 4,
        kind: "smoke",
        char: phase > 0.65 ? "·" : "°",
        color: tint("#c3c8b4", 1 - phase * 0.45),
      });
    }
  }
  return result;
}
export function cloudShade(x: number, y: number, time: number) {
  const cloud =
    Math.sin(x * 0.042 - time / 16000) +
    Math.cos(y * 0.13 + time / 31000) +
    Math.sin((x + y) * 0.019 - time / 23000);
  return cloud > 1.4 ? 0.86 + (2.6 - Math.min(2.6, cloud)) * 0.07 : 1;
}
