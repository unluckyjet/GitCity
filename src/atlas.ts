import type { Building } from "./types.ts";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Territory extends Rect {
  path: string;
  direct: boolean;
  label: string;
  kind: "country" | "state" | "town" | "street";
  buildings: Building[];
  color: string;
  language: string;
}
export interface SearchResult {
  path: string;
  kind: "file" | "folder";
  count: number;
  score: number;
}

export function inScope(path: string, scope: string, direct = false) {
  if (scope && !path.startsWith(scope + "/")) return false;
  const relative = scope ? path.slice(scope.length + 1) : path;
  return !direct || !relative.includes("/");
}
export function parentPath(path: string) {
  return path.split("/").slice(0, -1).join("/");
}

/** Folder topology is built once from the complete history, keeping territory
 * boundaries stable while files and even whole regions appear or disappear. */
export class AtlasIndex {
  private children = new Map<string, Map<string, number>>();
  constructor(paths: string[]) {
    for (const path of new Set(paths)) {
      const parts = path.split("/");
      for (let depth = 0; depth < parts.length; depth++) {
        const scope = parts.slice(0, depth).join("/");
        const child = depth === parts.length - 1 ? "" : parts[depth]!;
        let children = this.children.get(scope);
        if (!children) this.children.set(scope, (children = new Map()));
        children.set(child, (children.get(child) ?? 0) + 1);
      }
    }
  }
  hasChildren(scope: string) {
    return [...(this.children.get(scope)?.keys() ?? [])].some(
      (key) => key !== "",
    );
  }

  territories(scope: string, buildings: Building[]): Territory[] {
    const groups = new Map<string, Building[]>();
    for (const building of buildings) {
      if (!inScope(building.path, scope)) continue;
      const relative = scope
        ? building.path.slice(scope.length + 1)
        : building.path;
      const child = relative.includes("/") ? relative.split("/")[0]! : "";
      const group = groups.get(child);
      if (group) group.push(building);
      else groups.set(child, [building]);
    }
    const lifetime = new Map(this.children.get(scope) ?? []);
    for (const [key, value] of groups)
      if (!lifetime.has(key)) lifetime.set(key, value.length);
    const slots = [...lifetime]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({ key, weight: Math.sqrt(count) + 3 }));
    const rectangles = partition(slots, { x: 0, y: 0, width: 280, height: 58 });
    const depth = scope ? scope.split("/").length + 1 : 1;
    return rectangles.flatMap(({ key, ...rect }) => {
      const members = groups.get(key) ?? [];
      const languages = new Map<string, { count: number; color: string }>();
      for (const b of members) {
        const current = languages.get(b.language);
        languages.set(b.language, {
          count: (current?.count ?? 0) + 1,
          color: b.color,
        });
      }
      const dominant =
        [...languages].sort((a, b) => b[1].count - a[1].count)[0] ??
        (["No files at this commit", { color: "#384658", count: 0 }] as const);
      const path = key ? (scope ? scope + "/" + key : key) : scope;
      return [
        {
          ...rect,
          path,
          direct: !key,
          label: key || "./",
          kind: !key
            ? "street"
            : depth === 1 && buildings.length > 120
              ? "country"
              : depth === 2 && members.length > 40
                ? "state"
                : "town",
          buildings: members,
          color: dominant[1].color,
          language: dominant[0],
        } as Territory,
      ];
    });
  }
}

function partition(
  items: { key: string; weight: number }[],
  rect: Rect,
): (Rect & { key: string })[] {
  if (!items.length) return [];
  if (items.length === 1) return [{ ...rect, key: items[0]!.key }];
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let split = 1,
    sum = items[0]!.weight;
  while (
    split < items.length - 1 &&
    sum + items[split]!.weight / 2 < total / 2
  ) {
    sum += items[split]!.weight;
    split++;
  }
  const fraction = sum / total;
  const horizontal = rect.width > rect.height * 2;
  const a = horizontal
    ? { ...rect, width: rect.width * fraction }
    : { ...rect, height: rect.height * fraction };
  const b = horizontal
    ? { ...rect, x: rect.x + a.width, width: rect.width - a.width }
    : { ...rect, y: rect.y + a.height, height: rect.height - a.height };
  return [
    ...partition(items.slice(0, split), a),
    ...partition(items.slice(split), b),
  ];
}

/** Ranked substring/subsequence search, with one result per real file/folder. */
export function searchPaths(
  buildings: Building[],
  query: string,
  limit = 40,
): SearchResult[] {
  const folders = new Map<string, number>();
  for (const b of buildings) {
    const parts = b.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const p = parts.slice(0, i).join("/");
      folders.set(p, (folders.get(p) ?? 0) + 1);
    }
  }
  const candidates: SearchResult[] = [...folders].map(([path, count]) => ({
    path,
    count,
    kind: "folder",
    score: 0,
  }));
  candidates.push(
    ...buildings.map((b) => ({
      path: b.path,
      kind: "file" as const,
      count: 1,
      score: 0,
    })),
  );
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const ranked = candidates.flatMap((result) => {
    const lower = result.path.toLowerCase(),
      base = lower.split("/").at(-1)!;
    let score = 0;
    for (const word of words) {
      if (base === word) score += 1000;
      else if (base.startsWith(word)) score += 700;
      else if (lower.includes(word)) score += 450 - lower.indexOf(word);
      else {
        let at = 0,
          spread = 0,
          last = -1;
        for (const char of word) {
          const index = lower.indexOf(char, at);
          if (index < 0) return [];
          spread += last < 0 ? index : index - last - 1;
          last = index;
          at = index + 1;
        }
        score += 100 - spread;
      }
    }
    if (!words.length)
      score =
        result.kind === "folder" ? 200 - result.path.split("/").length * 20 : 0;
    return [{ ...result, score: score - result.path.length / 100 }];
  });
  return ranked
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}
