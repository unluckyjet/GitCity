import { styleFor, type WorldStyle } from "./world-style.ts";
import type { Territory } from "./atlas.ts";

export interface Settlement {
  region: Territory;
  x: number;
  y: number;
  size: number;
}
export interface Road {
  from: Settlement;
  to: Settlement;
  points: { x: number; y: number }[];
}
export function noise(x: number, y: number) {
  return (
    Math.sin(x * 0.071 + y * 0.13) * 0.48 +
    Math.sin(x * 0.17 - y * 0.29) * 0.27 +
    Math.cos(x * 0.037 + y * 0.31) * 0.25
  );
}
/** Continuous world coordinates keep coasts and rivers anchored during zoom. */
export function elevation(x: number, y: number) {
  const nx = (x - 140) / 122,
    ny = (y - 29) / 24;
  const angle = Math.atan2(ny, nx);
  const coast =
    1 +
    0.09 * Math.sin(angle * 3 + 0.4) +
    0.1 * Math.cos(angle * 5 - 1.4) +
    0.045 * Math.sin(angle * 9);
  return coast - Math.hypot(nx, ny) + noise(x, y) * 0.14;
}
export function river(x: number, y: number) {
  const course = 139 + Math.sin(y * 0.105 + 0.5) * 24 + Math.sin(y * 0.31) * 5;
  return (
    Math.abs(x - course) < 1.6 + Math.sin(y * 0.08) * 0.45 && y > 10 && y < 53
  );
}
export function land(x: number, y: number) {
  return elevation(x, y) > 0.035 && !river(x, y);
}
function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot((a.x - b.x) / 3, a.y - b.y);
}
const cache = new WeakMap<Territory[], Map<string, Geography>>();
export class Geography {
  readonly level: number;
  readonly style: WorldStyle;
  readonly settlements: Settlement[];
  readonly roads: Road[] = [];
  readonly docks: { x: number; y: number; site: Settlement }[] = [];
  constructor(territories: Territory[], identity = "") {
    this.style = styleFor(identity);
    this.level = Math.max(
      0,
      Math.min(
        ...territories.map(
          (r) => (r.path ? r.path.split("/").length : 0) - (r.direct ? 0 : 1),
        ),
        10,
      ),
    );
    this.settlements = territories
      .filter((r) => r.buildings.length)
      .map((region) => {
        let x = 140 + (region.x + region.width / 2 - 140) * 0.84,
          y = 29 + (region.y + region.height / 2 - 29) * 0.8;
        // Move coastal sites inland; never leave a selectable settlement at sea.
        for (let i = 0; i < 24 && !this.land(x, y); i++) {
          x += (140 - x) * 0.08;
          y += (29 - y) * 0.08;
          if (this.river(x, y)) x += 5;
        }
        return { region, x, y, size: Math.log2(region.buildings.length + 1) };
      });
    for (const site of this.settlements) {
      if (this.elevation(site.x, site.y) > 0.4) continue;
      let best: { x: number; y: number; distance: number } | undefined;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8)
        for (let distance = 2; distance < 30; distance += 2) {
          const x = site.x + Math.cos(angle) * distance * 2,
            y = site.y + Math.sin(angle) * distance;
          if (this.elevation(x, y) < 0.04) {
            if (!best || distance < best.distance) best = { x, y, distance };
            break;
          }
        }
      if (best) this.docks.push({ x: best.x, y: best.y, site });
    }
    // A minimum spanning road network connects every occupied settlement.
    const count = this.settlements.length,
      joined = new Set<number>();
    const costs = Array<number>(count).fill(Infinity),
      parents = Array<number>(count).fill(-1);
    if (count) costs[0] = 0;
    while (joined.size < count) {
      let to = -1;
      for (let i = 0; i < count; i++)
        if (!joined.has(i) && (to < 0 || costs[i]! < costs[to]!)) to = i;
      if (to < 0) break;
      joined.add(to);
      const parent = parents[to]!;
      if (parent >= 0) {
        const a = this.settlements[parent]!,
          b = this.settlements[to]!;
        const points = Array.from({ length: 50 }, (_, i) => {
          const t = i / 49;
          return {
            x:
              a.x +
              (b.x - a.x) * t +
              Math.sin(t * Math.PI) * Math.sin((a.x + b.x) * 0.03) * 3,
            y: a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * 1.2,
          };
        });
        this.roads.push({ from: a, to: b, points });
      }
      for (let i = 0; i < count; i++)
        if (!joined.has(i)) {
          const d = distance(this.settlements[to]!, this.settlements[i]!);
          if (d < costs[i]!) {
            costs[i] = d;
            parents[i] = to;
          }
        }
    }
  }
  elevation(x: number, y: number) {
    const scale = this.level ? 0.55 : 1,
      style = this.style;
    const nx = ((x - 140) * scale) / style.radiusX,
      ny = ((y - 29) * scale) / style.radiusY;
    const angle = Math.atan2(ny, nx),
      phase = style.phase;
    const coast =
      1 +
      0.12 * Math.sin(angle * 3 + phase) +
      0.09 * Math.cos(angle * 5 - phase) +
      0.04 * Math.sin(angle * 9 + phase);
    return coast - Math.hypot(nx, ny) + this.noise(x, y) * 0.16;
  }
  noise(x: number, y: number) {
    return noise(x + this.style.phase * 3, y - this.style.phase);
  }
  riverCourse(y: number) {
    return (
      this.style.riverX +
      Math.sin(y * 0.105 + this.style.phase) * this.style.riverBend +
      Math.sin(y * 0.31) * 5
    );
  }
  river(x: number, y: number) {
    return (
      Math.abs(x - this.riverCourse(y)) < 1.6 + Math.sin(y * 0.08) * 0.45 &&
      y > 5 &&
      y < 55
    );
  }
  land(x: number, y: number) {
    return this.elevation(x, y) > 0.035 && !this.river(x, y);
  }
  pick(x: number, y: number): Settlement | undefined {
    if (!this.land(x, y)) return undefined;
    let best = Infinity,
      result: Settlement | undefined;
    for (const site of this.settlements) {
      const d = distance(site, { x, y }) / (1 + site.size * 0.035);
      if (d < best) {
        best = d;
        result = site;
      }
    }
    return result;
  }
}
export function geographyFor(territories: Territory[], identity = "") {
  const key = styleFor(identity).key;
  let worlds = cache.get(territories);
  if (!worlds) {
    worlds = new Map();
    cache.set(territories, worlds);
  }
  let value = worlds.get(key);
  if (!value) {
    value = new Geography(territories, key);
    worlds.set(key, value);
  }
  return value;
}
