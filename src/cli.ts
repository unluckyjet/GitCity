import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoFile, Repository } from "./types.ts";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

export interface CliOptions {
  repo: string;
  history: boolean;
  speed: number;
  exclude: string[];
  snapshot: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    repo: ".",
    history: false,
    speed: 1,
    exclude: [],
    snapshot: false,
    json: false,
    help: false,
    version: false,
  };
  let hasRepo = false;
  let positionalOnly = false;
  const takeValue = (arg: string, index: number): [string, number] => {
    const equal = arg.indexOf("=");
    if (equal >= 0) return [arg.slice(equal + 1), index];
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`${arg} requires a value.`);
    return [value, index + 1];
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!positionalOnly && arg === "--") {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && ["--help", "-h"].includes(arg)) {
      options.help = true;
      continue;
    }
    if (!positionalOnly && ["--version", "-v"].includes(arg)) {
      options.version = true;
      continue;
    }
    if (!positionalOnly && arg === "--history") {
      options.history = true;
      continue;
    }
    if (!positionalOnly && arg === "--snapshot") {
      options.snapshot = true;
      continue;
    }
    if (!positionalOnly && arg === "--json") {
      options.json = true;
      continue;
    }
    if (!positionalOnly && (arg === "--speed" || arg.startsWith("--speed="))) {
      const [value, next] = takeValue(arg, i);
      i = next;
      const speed = Number(value);
      if (
        !value.trim() ||
        !Number.isFinite(speed) ||
        speed < 0.25 ||
        speed > 32
      )
        throw new Error("--speed must be a number between 0.25 and 32.");
      options.speed = speed;
      continue;
    }
    if (
      !positionalOnly &&
      (arg === "--exclude" || arg.startsWith("--exclude="))
    ) {
      const [value, next] = takeValue(arg, i);
      i = next;
      if (!value.trim())
        throw new Error("--exclude requires a non-empty glob pattern.");
      options.exclude.push(value);
      continue;
    }
    if (!positionalOnly && arg.startsWith("-"))
      throw new Error(`Unknown option: ${arg}. Run gitcity --help for usage.`);
    if (hasRepo)
      throw new Error(
        "Provide one repository at a time. Quote local paths containing spaces.",
      );
    if (!arg.trim()) throw new Error("The repository cannot be empty.");
    options.repo = arg;
    hasRepo = true;
  }
  return options;
}

export function helpText(): string {
  return `Git City ${version} — Explore your codebase as a living city.

Usage: gitcity owner/repo [options]

Repository: a public GitHub owner/repo, HTTPS URL, or github.com/owner/repo.
Public repos are downloaded automatically; no GitHub token is needed.
Local repositories still work with ./path or an absolute path. Defaults to .

Options:
  --history          Open at the first commit, ready to replay
  --speed <number>   Playback multiplier, 0.25–32 (default: 1)
  --exclude <glob>   Exclude paths; repeat for multiple patterns
  --snapshot         Print a headless city summary and exit
  --json             Print a headless repository snapshot as JSON
  -h, --help         Show this help
  -v, --version      Print the version

Examples:
  gitcity facebook/react
  gitcity expressjs/express --history --speed 4
  gitcity . --exclude '*.lock' --exclude 'docs/**'
  gitcity . --snapshot

Controls:
  WASD / arrows  Move camera (Explore mode)
  Mouse          Click dense blocks to zoom in; click a building to inspect
  Mouse wheel    Zoom toward the pointer (pauses playback)
  Enter          Inspect selected building
  [ / ]          Select previous / next building
  Tab            Toggle inspector panel
  T              Toggle Explore / History mode
  Left / Right   Previous / next commit (History mode)
  Space          Play / pause; replay from the beginning at HEAD
  + / -          Zoom in / out
  , / .          Slower / faster playback
  Home / End     First / latest commit
  R / FIT        Fit the whole city; restore automatic growth framing
  Esc            Close inspector / leave History mode
  ?              Toggle help
  Q / Ctrl+C     Quit

Interactive mode needs a terminal and Node.js 26.4+ or Bun on PATH.
The launcher enables Node's experimental FFI for OpenTUI automatically.
`;
}

const plain = (value: string): string =>
  value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
const bytes = (value: number): string =>
  value < 1024
    ? `${value} B`
    : value < 1024 * 1024
      ? `${(value / 1024).toFixed(1)} KB`
      : `${(value / (1024 * 1024)).toFixed(1)} MB`;

export function formatSnapshot(
  repository: Repository,
  index: number,
  files: RepoFile[],
): string {
  const commit = repository.commits[index];
  const districts = new Map<
    string,
    { files: number; size: number; languages: Set<string> }
  >();
  for (const file of files) {
    const district = districts.get(file.directory) ?? {
      files: 0,
      size: 0,
      languages: new Set<string>(),
    };
    district.files += 1;
    district.size += file.size;
    district.languages.add(file.language);
    districts.set(file.directory, district);
  }
  const rows = [...districts.entries()].sort(
    (a, b) => b[1].files - a[1].files || a[0].localeCompare(b[0]),
  );
  const output = [
    `GIT CITY · ${plain(repository.name)}`,
    "Explore your codebase as a living city.",
    "",
    `${files.length.toLocaleString()} buildings · ${districts.size.toLocaleString()} neighborhoods · ${repository.commits.length.toLocaleString()} commits`,
    `Snapshot ${index + 1}/${repository.commits.length} · ${commit?.hash.slice(0, 8) ?? "empty"} · ${commit?.date.slice(0, 10) ?? ""}`,
    commit ? plain(commit.subject) : "No commits.",
    "",
    "NEIGHBORHOOD                         BUILDINGS       SIZE  LANGUAGES",
  ];
  for (const [directory, district] of rows) {
    const name = plain(directory || "/");
    output.push(
      `${(name.length > 35 ? `${name.slice(0, 32)}...` : name).padEnd(35)} ${String(district.files).padStart(9)} ${bytes(district.size).padStart(10)}  ${[...district.languages].sort().join(", ")}`,
    );
  }
  if (!rows.length)
    output.push(
      "No visible files at this commit. Try a later commit or adjust exclusions.",
    );
  return `${output.join("\n")}\n`;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  let repository: Repository | undefined;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  try {
    const options = parseArgs(args);
    if (options.help) {
      process.stdout.write(helpText());
      return;
    }
    if (options.version) {
      process.stdout.write(`${version}\n`);
      return;
    }
    if (
      !options.snapshot &&
      !options.json &&
      (!process.stdin.isTTY || !process.stdout.isTTY)
    ) {
      throw new Error(
        "Interactive mode needs a terminal. Run with --snapshot or --json for headless output.",
      );
    }
    process.once("SIGINT", cancel);
    process.once("SIGTERM", cancel);
    const { loadRepository } = await import("./repository.ts");
    repository = await loadRepository(options.repo, {
      exclude: options.exclude,
      signal: controller.signal,
      onProgress:
        options.json || !process.stderr.isTTY
          ? undefined
          : (message) => process.stderr.write(`\r\x1b[2K${plain(message)}`),
    });
    if (!options.json && process.stderr.isTTY)
      process.stderr.write("\r\x1b[2K");
    const index = options.history
      ? 0
      : Math.max(0, repository.commits.length - 1);
    if (options.snapshot || options.json) {
      const files = await repository.snapshot(index);
      if (options.json) {
        process.stdout.write(
          `${JSON.stringify({ name: repository.name, commitIndex: index, totalCommits: repository.commits.length, commit: repository.commits[index] ?? null, files }, null, 2)}\n`,
        );
      } else process.stdout.write(formatSnapshot(repository, index, files));
    } else {
      process.removeListener("SIGINT", cancel);
      process.removeListener("SIGTERM", cancel);
      const { runApp } = await import("./app.ts");
      await runApp(repository, {
        history: options.history,
        speed: options.speed,
      });
    }
  } catch (error) {
    if (controller.signal.aborted) {
      process.stderr.write("\ngitcity: Cancelled.\n");
      process.exitCode = 130;
    } else {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`gitcity: ${plain(message)}\n`);
      process.exitCode = 1;
    }
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    await repository?.dispose();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
