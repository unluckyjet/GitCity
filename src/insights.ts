import type { Commit, RepoFile } from "./types.ts";
import type { DependencyGraph } from "./dependencies.ts";
import { stableHash } from "./world-style.ts";
export type Overlay = "off" | "churn" | "size" | "dependents" | "ownership";
export const overlayModes: Overlay[] = [
  "off",
  "churn",
  "size",
  "dependents",
  "ownership",
];
export interface Metric {
  value: number;
  label: string;
  color: string;
}
const authorColors = [
  "#e3a87b",
  "#84cfb1",
  "#b7a1e5",
  "#87bde4",
  "#e2c778",
  "#db90b6",
  "#bdcd83",
  "#80c9d3",
];
export function activityMetrics(
  mode: Overlay,
  files: RepoFile[],
  commits: Commit[],
  index: number,
  graph?: DependencyGraph,
): Map<string, Metric> {
  const counts = new Map<string, number>(),
    authors = new Map<string, Map<string, number>>();
  if (mode === "churn" || mode === "ownership")
    for (const c of commits.slice(
      mode === "churn" ? Math.max(0, index - 99) : 0,
      index + 1,
    ))
      for (const change of c.changes) {
        counts.set(change.path, (counts.get(change.path) ?? 0) + 1);
        if (mode === "ownership") {
          const scores = authors.get(change.path) ?? new Map<string, number>();
          scores.set(c.author, (scores.get(c.author) ?? 0) + 1);
          authors.set(change.path, scores);
        }
      }
  const values = files.map((f) =>
      mode === "size"
        ? f.size
        : mode === "dependents"
          ? (graph?.incoming.get(f.path)?.length ?? 0)
          : (counts.get(f.path) ?? 0),
    ),
    max = Math.max(1, ...values),
    result = new Map<string, Metric>();
  files.forEach((f, i) => {
    const value = values[i]!;
    const leader = [...(authors.get(f.path) ?? [])].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    const intensity = Math.log1p(value) / Math.log1p(max);
    const color =
      mode === "ownership"
        ? authorColors[
            stableHash(leader?.[0] ?? "unknown") % authorColors.length
          ]!
        : intensity > 0.75
          ? "#f18b77"
          : intensity > 0.4
            ? "#edc479"
            : intensity > 0
              ? "#99cab8"
              : "#5c7381";
    result.set(f.path, {
      value,
      label:
        mode === "ownership"
          ? `${leader?.[0] ?? "Unknown"} (${leader?.[1] ?? 0} touches)`
          : mode === "size"
            ? `${value.toLocaleString()} bytes`
            : mode === "dependents"
              ? `${value} resolved incoming imports`
              : `${value} touches / last 100 commits`,
      color,
    });
  });
  return result;
}
export interface TourStop {
  path: string;
  caption: string;
}
export type TourKind = "entrypoints" | "journey" | "busy";
export function createTour(
  kind: TourKind,
  files: RepoFile[],
  graph?: DependencyGraph,
  selected?: string,
): TourStop[] {
  if (kind === "busy")
    return [...files]
      .sort((a, b) => b.commits - a.commits || a.path.localeCompare(b.path))
      .slice(0, 8)
      .map((f) => ({
        path: f.path,
        caption: `${f.commits} commits touched this file on this first-parent history.`,
      }));
  if (kind === "entrypoints")
    return (graph?.entrypoints ?? [])
      .slice(0, 12)
      .map((path) => ({
        path,
        caption:
          "Entry candidate from a package manifest or conventional main/server/app/index filename.",
      }));
  const start = selected ?? graph?.entrypoints[0];
  if (!start || !graph) return [];
  const stops: TourStop[] = [
      {
        path: start,
        caption:
          "Start of a static import journey; this is not a runtime request trace.",
      },
    ],
    seen = new Set([start]);
  let current = start;
  while (stops.length < 10) {
    const next = (graph.outgoing.get(current) ?? [])
      .filter((p) => !seen.has(p))
      .sort(
        (a, b) =>
          (graph.outgoing.get(b)?.length ?? 0) -
            (graph.outgoing.get(a)?.length ?? 0) || a.localeCompare(b),
      )[0];
    if (!next) break;
    stops.push({ path: next, caption: `${current} imports this file.` });
    seen.add(next);
    current = next;
  }
  return stops;
}
