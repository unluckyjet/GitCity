import type {
  Building,
  City,
  CityLayout,
  District,
  RepoFile,
} from "./types.ts";

const MAX_HEIGHT = 12;
const FILES_PER_BLOCK = 12;
const SLOT_WIDTH = 11;
const ROW_HEIGHT = MAX_HEIGHT + 3;
const STREET_X = 5;
const STREET_Y = 4;

const MATERIALS: Record<string, string> = {
  typescript: "#e3b85c",
  javascript: "#ba9ce6",
  python: "#5fbca8",
  go: "#56bec5",
  rust: "#d88a65",
  ruby: "#d47185",
  java: "#dc9970",
  kotlin: "#b28be0",
  swift: "#e39c77",
  c: "#819fc1",
  "c++": "#8498cc",
  "c#": "#a591d2",
  css: "#8c9dda",
  scss: "#c088b0",
  html: "#d18b6d",
  vue: "#79b99b",
  svelte: "#dd9175",
  shell: "#93b58b",
  bash: "#93b58b",
  markdown: "#98a7ba",
  json: "#aaad8e",
  yaml: "#b8a888",
  toml: "#a4a291",
  sql: "#7eb5ba",
  php: "#a497ce",
  dart: "#73b6c5",
  text: "#91a0b2",
  unknown: "#91a0b2",
};

/** The same language material is shared by buildings, legends, and inspectors. */
export function languageColor(language: string): string {
  return MATERIALS[language.trim().toLowerCase()] ?? MATERIALS.unknown!;
}

interface Slot {
  path: string;
  x: number;
  y: number;
  width: number;
}

interface Block {
  path: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  slots: Slot[];
}

function comparePaths(a: string, b: string): number {
  // Do not use localeCompare: the same repository should render identically on
  // machines with different locales, and Git paths are case-sensitive.
  return a < b ? -1 : a > b ? 1 : 0;
}

function directoryOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "." : path.slice(0, slash) || ".";
}

function pathHash(path: string): number {
  let value = 2166136261;
  for (let i = 0; i < path.length; i++) {
    value = Math.imul(value ^ path.charCodeAt(i), 16777619);
  }
  return value >>> 0;
}

function buildingHeight(size: number): number {
  const bytes = Number.isFinite(size) ? Math.max(0, size) : 0;
  return Math.min(
    MAX_HEIGHT,
    Math.max(2, Math.round(2 + Math.log2(1 + bytes / 128))),
  );
}

function blocksForPaths(
  paths: string[],
  births?: Map<string, number>,
): Block[] {
  const ordered = (a: string, b: string) =>
    births
      ? (births.get(a) ?? Infinity) - (births.get(b) ?? Infinity) ||
        comparePaths(a, b)
      : comparePaths(a, b);
  const directories = new Map<string, string[]>();
  for (const path of [...new Set(paths)].sort(ordered)) {
    const directory = directoryOf(path);
    const existing = directories.get(directory);
    if (existing) existing.push(path);
    else directories.set(directory, [path]);
  }

  const blocks: Block[] = [];
  for (const [directory, entries] of [...directories.entries()].sort(
    ([a], [b]) => comparePaths(a, b),
  )) {
    const totalBlocks = Math.ceil(entries.length / FILES_PER_BLOCK);
    for (let offset = 0; offset < entries.length; offset += FILES_PER_BLOCK) {
      const group = entries.slice(offset, offset + FILES_PER_BLOCK);
      const columns =
        group.length <= 6 ? group.length : Math.ceil(group.length / 2);
      const rows = Math.ceil(group.length / columns);
      const width = Math.max(24, columns * SLOT_WIDTH + 2);
      const height = rows * ROW_HEIGHT + 4;
      const padding = Math.floor((width - columns * SLOT_WIDTH) / 2);
      const label =
        directory === "."
          ? "ROOT"
          : directory.split("/").join(" / ").toUpperCase();
      blocks.push({
        path: directory,
        label:
          totalBlocks > 1
            ? `${label} · ${Math.floor(offset / FILES_PER_BLOCK) + 1}`
            : label,
        x: 0,
        y: 0,
        width,
        height,
        slots: group.map((path, index) => {
          const buildingWidth = 5 + (pathHash(path) % 5);
          return {
            path,
            x:
              padding +
              (index % columns) * SLOT_WIDTH +
              Math.floor((SLOT_WIDTH - buildingWidth) / 2),
            // A roof is drawn at y - height; leave two clear rows at the top.
            y: MAX_HEIGHT + 2 + Math.floor(index / columns) * ROW_HEIGHT,
            width: buildingWidth,
          };
        }),
      });
    }
  }
  return births
    ? blocks.sort((a, b) => ordered(a.slots[0]!.path, b.slots[0]!.path))
    : blocks;
}

/**
 * Reserve every historical path before replay starts. File additions, deletions,
 * and growth therefore never move a surviving building or neighboring district.
 * Large directories become adjacent numbered blocks with the same directory
 * identity, avoiding a single street thousands of columns wide.
 */
export function createCityLayout(
  allPaths: string[],
  birthOrder?: string[],
): CityLayout {
  const births = birthOrder
    ? new Map([...new Set(birthOrder)].map((path, index) => [path, index]))
    : undefined;
  const knownPaths = new Set(allPaths);
  const blocks = blocksForPaths(allPaths, births);
  const area = blocks.reduce(
    (sum, block) => sum + (block.width + STREET_X) * (block.height + STREET_Y),
    0,
  );
  // Terminal cells are roughly twice as tall as they are wide. The physical
  // shape is compact even for repositories containing many thousands of files.
  const targetWidth = Math.max(96, Math.ceil(Math.sqrt(area * 2.7)));
  let cursorX = 0;
  let cursorY = 0;
  let shelfHeight = 0;
  let worldWidth = 0;
  let worldHeight = 0;
  let placedArea = 0;

  function place(block: Block): void {
    // Shelf width expands from the area born so far, not future repository
    // size. Early neighborhoods are compact and never move on later growth.
    placedArea += (block.width + STREET_X) * (block.height + STREET_Y);
    const shelfWidth = births
      ? Math.max(96, Math.ceil(Math.sqrt(placedArea * 9)))
      : targetWidth;
    if (cursorX > 0 && cursorX + block.width > shelfWidth) {
      cursorX = 0;
      cursorY += shelfHeight + STREET_Y;
      shelfHeight = 0;
    }
    block.x = cursorX;
    block.y = cursorY;
    cursorX += block.width + STREET_X;
    shelfHeight = Math.max(shelfHeight, block.height);
    worldWidth = Math.max(worldWidth, block.x + block.width);
    worldHeight = Math.max(worldHeight, block.y + block.height);
  }
  for (const block of blocks) place(block);

  return {
    build(files: RepoFile[]): City {
      const byPath = new Map(files.map((file) => [file.path, file]));
      // Repository loaders normally provide the complete history path universe.
      // If a caller supplies an extra path, append it without losing the file or
      // disturbing any coordinates already used by the renderer.
      const extraPaths = [...byPath.keys()].filter(
        (path) => !knownPaths.has(path),
      );
      if (extraPaths.length) {
        const extraBlocks = blocksForPaths(extraPaths, births);
        for (const block of extraBlocks) place(block);
        blocks.push(...extraBlocks);
        for (const path of extraPaths) knownPaths.add(path);
      }

      const districts: District[] = [];
      const buildings: Building[] = [];
      for (const block of blocks) {
        const members: Building[] = [];
        for (const slot of block.slots) {
          const file = byPath.get(slot.path);
          if (!file) continue;
          const building: Building = {
            ...file,
            id: slot.path,
            directory: block.path,
            x: block.x + slot.x,
            y: block.y + slot.y,
            width: slot.width,
            height: buildingHeight(file.size),
            color: languageColor(file.language),
          };
          members.push(building);
          buildings.push(building);
        }
        if (members.length) {
          districts.push({
            path: block.path,
            label: block.label,
            x: block.x,
            y: block.y,
            width: block.width,
            height: block.height,
            buildings: members,
          });
        }
      }
      return { districts, buildings, width: worldWidth, height: worldHeight };
    },
  };
}
