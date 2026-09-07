/** A repository's identity, never a commit or a machine path, seeds its world. */
export function repositoryIdentity(value: string): string {
  return value
    .trim()
    .replace(/^git@github\.com:/i, "https://github.com/")
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git\/?$/i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}
export function stableHash(value: string): number {
  let n = 2166136261;
  for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export interface WorldStyle {
  key: string;
  seed: number;
  biome: "coast" | "highlands" | "river";
  phase: number;
  radiusX: number;
  radiusY: number;
  riverX: number;
  riverBend: number;
  grass: string;
  forest: string;
  hill: string;
  sand: string;
  sea: string;
  deep: string;
  roof: string;
  stone: string;
}
const palettes = [
  {
    biome: "coast" as const,
    grass: "#36594b",
    forest: "#244d43",
    hill: "#526b52",
    sand: "#bead7f",
    sea: "#173f52",
    deep: "#0b293c",
    roof: "#cf8e6e",
    stone: "#b5ae96",
  },
  {
    biome: "highlands" as const,
    grass: "#59614d",
    forest: "#374f48",
    hill: "#8d9380",
    sand: "#b5b5a1",
    sea: "#284756",
    deep: "#192c3e",
    roof: "#839b9f",
    stone: "#c2bfaf",
  },
  {
    biome: "river" as const,
    grass: "#486545",
    forest: "#2d513e",
    hill: "#788261",
    sand: "#c1b47e",
    sea: "#285859",
    deep: "#123b46",
    roof: "#ba7760",
    stone: "#c4b191",
  },
];
export function styleFor(identity: string): WorldStyle {
  const key = repositoryIdentity(identity),
    seed = key ? stableHash(key) : 0,
    palette = palettes[seed % 3]!;
  return {
    key,
    seed,
    ...palette,
    phase: (seed % 997) / 37,
    radiusX: 110 + (seed % 31),
    radiusY: 21 + ((seed >>> 6) % 8),
    riverX: 113 + ((seed >>> 10) % 53),
    riverBend: 15 + ((seed >>> 15) % 19),
  };
}
