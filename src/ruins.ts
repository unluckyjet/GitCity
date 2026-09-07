import type { Commit, RepoFile } from "./types.ts";
export interface Ruin {
  path: string;
  deletionIndex: number;
  lastIndex: number;
  file: RepoFile;
}
/** Index deletions once; seeking never has to replay the entire commit log. */
export class RuinIndex {
  private events = new Map<string, number[]>();
  private commits: Commit[];
  constructor(commits: Commit[]) {
    this.commits = commits;
    commits.forEach((c, i) => {
      for (const change of c.changes)
        if (change.status === "deleted" && i > 0) {
          const events = this.events.get(change.path) ?? [];
          events.push(i);
          this.events.set(change.path, events);
        }
    });
  }
  at(index: number, present: Set<string>): Ruin[] {
    const result: Ruin[] = [];
    for (const [path, events] of this.events) {
      if (present.has(path)) continue;
      let lo = 0,
        hi = events.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (events[mid]! <= index) lo = mid + 1;
        else hi = mid;
      }
      if (!lo) continue;
      const deletionIndex = events[lo - 1]!,
        date = this.commits[deletionIndex]!.date;
      result.push({
        path,
        deletionIndex,
        lastIndex: deletionIndex - 1,
        file: {
          path,
          directory: path.split("/").slice(0, -1).join("/") || ".",
          language: "Deleted",
          size: 0,
          commits: 0,
          contributors: 0,
          createdAt: date,
          lastModified: date,
        },
      });
    }
    return result;
  }
}
