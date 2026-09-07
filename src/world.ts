import { Geography } from "./geography.ts";
import { inScope, type Territory } from "./atlas.ts";
import type { Building, City, CityLayout, RepoFile } from "./types.ts";

const dummyFile = (path: string): Building => ({
  path,
  directory: path.split("/").slice(0, -1).join("/"),
  language: "Other",
  size: 0,
  commits: 0,
  contributors: 0,
  createdAt: "",
  lastModified: "",
  id: path,
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  color: "",
});

/** One coordinate system from the first house to the entire repository. */
export class WorldMap {
  readonly lifetime: City;
  readonly scale: number;
  readonly offset: { x: number; y: number };
  readonly terrain: Geography;
  private cache = new WeakMap<Territory[], Geography>();
  private anchors = new Map<string, { x: number; y: number }>();
  private identity: string;

  constructor(layout: CityLayout, paths: string[], identity: string) {
    this.identity = identity;
    this.lifetime = layout.build(
      paths.map(
        (path) =>
          ({
            path,
            directory: path.split("/").slice(0, -1).join("/"),
            language: "Other",
            size: 0,
            commits: 0,
            contributors: 0,
            createdAt: "",
            lastModified: "",
          }) satisfies RepoFile,
      ),
    );
    this.scale = Math.max(
      1,
      this.lifetime.width / 160,
      this.lifetime.height / 32,
    );
    this.offset = {
      x: this.lifetime.width / 2 - 140 * this.scale,
      y: this.lifetime.height / 2 - 29 * this.scale,
    };
    this.terrain = new Geography(
      [
        {
          path: "",
          direct: false,
          label: "",
          kind: "street",
          x: 0,
          y: 0,
          width: 280,
          height: 58,
          color: "",
          language: "",
          buildings: [dummyFile(".")],
        },
      ],
      identity,
    );
  }

  normalized(x: number, y: number) {
    return {
      x: (x - this.offset.x) / this.scale,
      y: (y - this.offset.y) / this.scale,
    };
  }

  world(x: number, y: number) {
    return {
      x: x * this.scale + this.offset.x,
      y: y * this.scale + this.offset.y,
    };
  }

  anchor(region: Territory) {
    const key = JSON.stringify([region.path, region.direct]);
    let value = this.anchors.get(key);
    if (!value) {
      const buildings = this.lifetime.buildings.filter((b) =>
        inScope(b.path, region.path, region.direct),
      );
      if (buildings.length) {
        const left = Math.min(...buildings.map((b) => b.x));
        const right = Math.max(...buildings.map((b) => b.x + b.width));
        const top = Math.min(...buildings.map((b) => b.y));
        const bottom = Math.max(...buildings.map((b) => b.y));
        value = { x: (left + right) / 2, y: (top + bottom) / 2 };
      } else
        value = {
          x: this.lifetime.width / 2,
          y: this.lifetime.height / 2,
        };
      this.anchors.set(key, value);
    }
    return value;
  }

  geography(regions: Territory[]): Geography {
    let geo = this.cache.get(regions);
    if (geo) return geo;
    const placed = regions.map((region) => {
      const point = this.normalized(this.anchor(region).x, this.anchor(region).y);
      return {
        ...region,
        x: 140 + (point.x - 140) / 0.84,
        y: 29 + (point.y - 29) / 0.8,
        width: 0,
        height: 0,
      };
    });
    geo = new Geography(placed, this.identity);
    for (const site of geo.settlements) {
      const original = regions.find(
        (region) =>
          region.path === site.region.path &&
          region.direct === site.region.direct,
      );
      if (!original) continue;
      site.region = original;
      const city = this.world(site.x, site.y);
      site.x = city.x;
      site.y = city.y;
    }
    for (const road of geo.roads) {
      road.points = Array.from({ length: 100 }, (_, i) => {
        const t = i / 99;
        return {
          x: road.from.x + (road.to.x - road.from.x) * t,
          y:
            road.from.y +
            (road.to.y - road.from.y) * t +
            Math.sin(t * Math.PI) * this.scale * 1.2,
        };
      });
    }
    const terrain = this.terrain;
    geo.elevation = (x, y) => {
      const point = this.normalized(x, y);
      return terrain.elevation(point.x, point.y);
    };
    geo.noise = (x, y) => {
      const point = this.normalized(x, y);
      return terrain.noise(point.x, point.y);
    };
    geo.river = (x, y) => {
      const point = this.normalized(x, y);
      return terrain.river(point.x, point.y);
    };
    geo.riverCourse = (y) =>
      this.world(terrain.riverCourse(this.normalized(0, y).y), 0).x;
    geo.land = (x, y) => geo!.elevation(x, y) > 0.035 && !geo!.river(x, y);
    geo.docks.length = 0;
    for (const site of geo.settlements) {
      if (geo.elevation(site.x, site.y) > 0.4) continue;
      let best: { x: number; y: number; distance: number } | undefined;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8)
        for (let step = 2; step < 30; step += 2) {
          const x = site.x + Math.cos(angle) * step * 2 * this.scale;
          const y = site.y + Math.sin(angle) * step * this.scale;
          if (geo.elevation(x, y) < 0.04) {
            if (!best || step < best.distance) best = { x, y, distance: step };
            break;
          }
        }
      if (best) geo.docks.push({ x: best.x, y: best.y, site });
    }
    geo.pick = (x, y) => {
      if (!geo!.land(x, y)) return;
      let best = Infinity;
      let result: Geography["settlements"][number] | undefined;
      for (const site of geo!.settlements) {
        const d = Math.hypot((site.x - x) / 2, site.y - y);
        if (d < best) {
          best = d;
          result = site;
        }
      }
      return result;
    };
    this.cache.set(regions, geo);
    return geo;
  }
}
