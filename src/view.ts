import type { Scene } from "./scene.ts";

export interface ViewLocation {
  zoom: number;
  x: number;
  y: number;
  scope: string;
  direct: boolean;
  selected?: string;
  at?: string;
}

const keys = ["z", "x", "y", "scope", "direct", "focus", "at"] as const;

function quote(value: string) {
  return /[\s"']/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

export function encodeView(view: ViewLocation): string {
  const num = (n: number) => String(Math.round(n * 1e6) / 1e6);
  const parts = [`z:${num(view.zoom)}`, `x:${num(view.x)}`, `y:${num(view.y)}`];
  if (view.scope) parts.push(`scope:${view.scope}`);
  if (view.direct) parts.push("direct:1");
  if (view.selected) parts.push(`focus:${view.selected}`);
  if (view.at) parts.push(`at:${view.at}`);
  return parts.join(",");
}

export function decodeView(token: string): ViewLocation {
  const raw = token.trim();
  if (!raw) throw new Error("View token is empty.");
  const view: ViewLocation = {
    zoom: NaN,
    x: NaN,
    y: NaN,
    scope: "",
    direct: false,
  };
  for (const piece of raw.split(",")) {
    const split = piece.indexOf(":");
    if (split <= 0) throw new Error(`Invalid view field: ${piece}.`);
    const key = piece.slice(0, split);
    const value = piece.slice(split + 1);
    if (!(keys as readonly string[]).includes(key))
      throw new Error(`Unknown view field: ${key}.`);
    if (key === "z" || key === "x" || key === "y") {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`Invalid view ${key}.`);
      view[key === "z" ? "zoom" : key] = n;
    } else if (key === "direct") view.direct = value === "1" || value === "true";
    else if (key === "scope") view.scope = value;
    else if (key === "focus") view.selected = value;
    else if (key === "at") view.at = value;
  }
  if (
    !Number.isFinite(view.zoom) ||
    view.zoom <= 0 ||
    !Number.isFinite(view.x) ||
    !Number.isFinite(view.y)
  )
    throw new Error("View token needs z, x, and y.");
  return view;
}

export function shareCommand(repo: string, view: ViewLocation): string {
  const args = ["gitcity", quote(repo)];
  if (view.at) args.push("--at", quote(view.at));
  if (view.selected) args.push("--focus", quote(view.selected));
  args.push("--view", quote(encodeView(view)));
  return args.join(" ");
}

export function formatScreenshot(scene: Pick<Scene, "cells" | "width" | "height">): string {
  const rows: string[] = [];
  for (let y = 0; y < scene.height; y++) {
    let row = "";
    for (let x = 0; x < scene.width; x++)
      row += scene.cells[y * scene.width + x]?.char || " ";
    rows.push(row.replace(/[ \t]+$/g, ""));
  }
  while (rows.length && !rows[rows.length - 1]) rows.pop();
  return `${rows.join("\n")}\n`;
}

export function formatReplay(
  frames: { title: string; body: string }[],
): string {
  return frames
    .map((frame) => `== ${frame.title} ==\n${frame.body.replace(/\n+$/, "")}`)
    .join("\n\n");
}

export function formatShareArtifact(
  command: string,
  screenshot: string,
  replay?: string,
): string {
  const parts = [
    "GIT CITY SHARE",
    command,
    "",
    "SCREENSHOT",
    screenshot.replace(/\n+$/, ""),
  ];
  if (replay) {
    parts.push("", "REPLAY", replay.replace(/\n+$/, ""));
  }
  return `${parts.join("\n")}\n`;
}
