import type { Building } from "./types.ts";
import { stableHash, type WorldStyle } from "./world-style.ts";
export type ArchitectureKind =
  | "library"
  | "workshop"
  | "shop"
  | "observatory"
  | "utility"
  | "home";
export interface Architecture {
  kind: ArchitectureKind;
  family: number;
  wall: string;
  roof: string;
  trim: string;
}
export function tint(color: string, amount: number) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.max(
          0,
          Math.min(
            255,
            Math.round(parseInt(color.slice(i, i + 2), 16) * amount),
          ),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function architectureFor(path: string, style: WorldStyle): Architecture {
  const p = path.toLowerCase(),
    base = p.split("/").at(-1)!,
    folder = path.split("/").slice(0, -1).join("/");
  const kind: ArchitectureKind =
    /(^|\/)(__tests__|tests?|specs?)(\/|$)|\.(test|spec)\./.test(p)
      ? "observatory"
      : /\.(md|mdx|rst|txt)$/.test(base) ||
          /(^|\/)(docs?|documentation)(\/|$)/.test(p)
        ? "library"
        : /(^|\/)(scripts?|build|tools?|\.github)(\/|$)/.test(p) ||
            /^(makefile|dockerfile|gulpfile|webpack|vite\.config|rollup)/.test(
              base,
            )
          ? "workshop"
          : /\.(tsx|jsx|vue|svelte)$/.test(base) ||
              /(^|\/)(components?|views?|pages)(\/|$)/.test(p)
            ? "shop"
            : /\.(json|ya?ml|toml|ini|lock)$/.test(base) || /config/.test(base)
              ? "utility"
              : "home";
  const family = stableHash(style.key + "/" + folder) % 5;
  return {
    kind,
    family,
    wall: tint(style.stone, 0.48 + family * 0.055),
    roof: tint(style.roof, 0.75 + family * 0.07),
    trim: tint(style.stone, 0.9 + family * 0.035),
  };
}
type Put = (
  x: number,
  y: number,
  char: string,
  fg: string,
  bg?: string,
) => void;
/** Details are attached to the same file footprint and keep the facade facing its road. */
export function paintArchitecture(
  b: Building,
  style: WorldStyle,
  x: number,
  roof: number,
  ground: number,
  w: number,
  h: number,
  put: Put,
) {
  const a = architectureFor(b.path, style),
    middle = x + Math.floor(w / 2);
  if (w < 4 || h < 3) return;
  put(middle, ground, "▯", a.trim, a.wall);
  if (a.kind === "library") {
    put(middle, roof - 1, "▲", a.roof);
    for (let i = 1; i < w; i++) put(x + i, roof, "═", a.trim, a.roof);
    for (let i = 1; i < w; i += 3)
      for (let yy = Math.max(roof + 2, ground - 2); yy <= ground; yy++)
        put(x + i, yy, "║", a.trim, a.wall);
  } else if (a.kind === "workshop") {
    for (let i = 1; i < w; i += 3) put(x + i, roof, "◢", a.roof, a.wall);
    put(x + w - 2, roof - 1, "█", a.trim);
    put(x + w - 2, roof - 2, "▄", a.trim);
    for (let i = 1; i < w; i++) put(x + i, ground, "▥", a.trim, a.wall);
  } else if (a.kind === "shop") {
    for (let i = 0; i <= w; i++)
      put(x + i, ground - 2, "▀", i % 2 ? a.roof : a.trim, a.wall);
    for (let i = 1; i < w; i++)
      put(
        x + i,
        ground - 1,
        i === Math.floor(w / 2) ? "│" : "▪",
        "#f9d89d",
        a.wall,
      );
  } else if (a.kind === "observatory") {
    put(middle, roof - 2, "╱", a.trim);
    put(middle, roof - 1, "◉", a.roof);
    for (let i = 1; i < w; i++) put(x + i, roof, "▀", a.roof, a.wall);
    put(x, roof, "╭", a.roof);
    put(x + w, roof, "╮", a.roof);
  } else if (a.kind === "utility") {
    put(x + 1, roof, "▤", a.trim, a.roof);
    put(x + w - 1, roof, "▤", a.trim, a.roof);
    put(middle, ground - 1, "╳", a.trim, a.wall);
  }
}
