import type { City, Building } from "./types.ts";
export interface Point {
  x: number;
  y: number;
}
export interface Street {
  points: Point[];
  kind: "avenue" | "lane";
}
export interface Place extends Point {
  width: number;
  height: number;
  kind: "square" | "garden" | "courtyard";
}
export interface NeighborhoodPlan {
  streets: Street[];
  places: Place[];
  entrances: Map<string, Point>;
}
const cache = new WeakMap<City, NeighborhoodPlan>();
/** Road and pedestrian geometry is shared by the painter, traffic, and later route overlays. */
export function planNeighborhood(city: City): NeighborhoodPlan {
  const cached = cache.get(city);
  if (cached) return cached;
  const streets: Street[] = [],
    places: Place[] = [],
    entrances = new Map<string, Point>();
  const spine = Math.min(0, ...city.districts.map((d) => d.x)) - 5,
    connections: number[] = [];
  for (const district of city.districts) {
    const rows = [...new Set(district.buildings.map((b) => b.y))].sort(
      (a, b) => a - b,
    );
    const left = district.x - 2,
      right = district.x + district.width + 2;
    for (const [i, ground] of rows.entries()) {
      const y = ground + 2;
      streets.push({
        kind: "avenue",
        points: [
          { x: spine, y },
          { x: left, y },
          { x: right, y },
        ],
      });
      connections.push(y);
      places.push({
        x: district.x + district.width * 0.45 - 4,
        y: ground + 5,
        width: 9,
        height: 1,
        kind: i === 0 ? "square" : "courtyard",
      });
      places.push({
        x: district.x + district.width * 0.72,
        y: ground + 5,
        width: 6,
        height: 1,
        kind: "garden",
      });
    }
    if (rows.length > 1)
      streets.push({
        kind: "lane",
        points: rows.map((y) => ({ x: left, y: y + 2 })),
      });
    for (const b of district.buildings) {
      const door = { x: b.x + b.width / 2, y: b.y },
        entry = { x: door.x, y: b.y + 2 };
      entrances.set(b.path, entry);
      streets.push({ kind: "lane", points: [door, entry] });
    }
  }
  if (connections.length > 1)
    streets.push({
      kind: "avenue",
      points: [...new Set(connections)]
        .sort((a, b) => a - b)
        .map((y) => ({ x: spine, y })),
    });
  const plan = { streets, places, entrances };
  cache.set(city, plan);
  return plan;
}
/** Lots face an avenue and a central square, instead of scattering at arbitrary angles. */
export function settlementLots(count: number): Point[] {
  const lots: Point[] = [];
  for (let row = 0; lots.length < count; row++)
    for (const x of [-6, -4, -2, 2, 4, 6]) {
      if (lots.length === count) break;
      lots.push({
        x,
        y:
          row % 2 === 0
            ? -1 - Math.floor(row / 2) * 2
            : 2 + Math.floor(row / 2) * 2,
      });
    }
  return lots;
}
export function pathPoint(points: Point[], t: number): Point {
  if (!points.length) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot((p.x - points[i]!.x) / 2, p.y - points[i]!.y));
  let position = (((t % 1) + 1) % 1) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    if (position <= length || i === lengths.length - 1) {
      const f = length ? position / length : 0,
        a = points[i]!,
        b = points[i + 1]!;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    position -= length;
  }
  return points.at(-1)!;
}
