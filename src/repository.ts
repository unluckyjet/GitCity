import { spawn } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import type {
  Commit,
  FileChange,
  LoadOptions,
  RepoFile,
  Repository,
} from "./types.ts";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "vendor",
  "third_party",
  "third-party",
  "generated",
  "__generated__",
  "build",
  "dist",
  "out",
  "target",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  ".venv",
  "venv",
  "__pycache__",
]);

const LANGUAGES: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  pyw: "Python",
  rs: "Rust",
  go: "Go",
  c: "C",
  h: "C",
  cpp: "C++",
  cc: "C++",
  cxx: "C++",
  hpp: "C++",
  hh: "C++",
  cs: "C#",
  rb: "Ruby",
  php: "PHP",
  swift: "Swift",
  kt: "Kotlin",
  kts: "Kotlin",
  java: "Java",
  dart: "Dart",
  scala: "Scala",
  ex: "Elixir",
  exs: "Elixir",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  fish: "Shell",
  ps1: "PowerShell",
  css: "CSS",
  scss: "SCSS",
  sass: "SCSS",
  less: "CSS",
  html: "HTML",
  htm: "HTML",
  vue: "Vue",
  svelte: "Svelte",
  json: "JSON",
  jsonc: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  md: "Markdown",
  mdx: "Markdown",
  rst: "Text",
  txt: "Text",
  sql: "SQL",
  graphql: "GraphQL",
  gql: "GraphQL",
  xml: "XML",
  svg: "SVG",
  asm: "Assembly",
  s: "Assembly",
  cmake: "CMake",
  lua: "Lua",
  r: "R",
  pl: "Perl",
  pm: "Perl",
  hs: "Haskell",
  ml: "OCaml",
  mli: "OCaml",
  clj: "Clojure",
  cljs: "Clojure",
  erl: "Erlang",
  hrl: "Erlang",
  png: "Image",
  jpg: "Image",
  jpeg: "Image",
  gif: "Image",
  webp: "Image",
  ico: "Image",
  woff: "Font",
  woff2: "Font",
  ttf: "Font",
  otf: "Font",
  csv: "Data",
  tsv: "Data",
};

function languageFor(path: string): string {
  const name = basename(path);
  if (/^Dockerfile(?:\.|$)/i.test(name)) return "Dockerfile";
  if (/^(?:GNUmakefile|Makefile)$/i.test(name)) return "Makefile";
  if (/^CMakeLists\.txt$/i.test(name)) return "CMake";
  if (/^(?:README|LICENSE|LICENCE|NOTICE|CHANGELOG)$/i.test(name))
    return "Text";
  if (/^\.(?:gitignore|gitattributes|editorconfig|npmrc)$/.test(name))
    return "Config";
  return LANGUAGES[extname(name).slice(1).toLowerCase()] ?? "Other";
}

// A slashless glob applies at every directory depth. A matched directory excludes
// its descendants too. Supported syntax: *, **, ?, and character classes.
function exclusionPattern(input: string): RegExp {
  const pattern = input.replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
  if (!pattern) return /$a/;
  let result = pattern.includes("/") ? "^" : "(?:^|/)";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!;
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        while (pattern[i + 1] === "*") i++;
        if (pattern[i + 1] === "/") {
          result += "(?:.*/)?";
          i++;
        } else result += ".*";
      } else result += "[^/]*";
    } else if (char === "?") result += "[^/]";
    else if (char === "[") {
      const end = pattern.indexOf("]", i + 1);
      if (end > i + 1) {
        let characters = pattern.slice(i + 1, end).replace(/\\/g, "\\\\");
        if (characters.startsWith("!")) characters = "^" + characters.slice(1);
        result += "[" + characters + "]";
        i = end;
      } else result += "\\[";
    } else result += char.replace(/[\\^$+?.()|{}\[\]]/g, "\\$&");
  }
  try {
    return new RegExp(result + "(?:/.*)?$", "s");
  } catch {
    throw new Error(`Invalid exclude glob: ${input}`);
  }
}

function pathFilter(excludes: string[]): (path: string) => boolean {
  const patterns = excludes.map(exclusionPattern);
  return (path) => {
    if (
      path
        .split("/")
        .slice(0, -1)
        .some((segment) => IGNORED_DIRECTORIES.has(segment))
    )
      return false;
    if (/(?:\.min\.(?:js|css)|\.map|\.(?:generated|gen)\.[^/]+)$/.test(path))
      return false;
    return !patterns.some((pattern) => pattern.test(path));
  };
}

function abortError(): Error {
  const error = new Error("Repository loading was cancelled.");
  error.name = "AbortError";
  return error;
}

/** Never uses a shell: repository paths and URLs remain individual arguments. */
async function git(
  cwd: string,
  args: string[],
  signal?: AbortSignal,
  consume?: (chunk: Buffer) => void,
  input?: string,
): Promise<Buffer> {
  if (signal?.aborted) throw abortError();
  return await new Promise((resolveResult, reject) => {
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "Never",
      GIT_OPTIONAL_LOCKS: "0",
    };
    // An inherited GIT_DIR must not silently redirect the repository the user chose.
    for (const key of [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    ]) {
      delete (env as NodeJS.ProcessEnv)[key];
    }
    const child = spawn("git", ["--no-pager", "-C", cwd, ...args], {
      env,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    if (input !== undefined) {
      child.stdin?.on("error", () => {});
      child.stdin?.end(input);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    let stderr = "";
    let failure: Error | undefined;
    const abort = () => {
      failure = abortError();
      child.kill("SIGTERM");
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout!.on("data", (chunk: Buffer) => {
      if (failure) return;
      try {
        if (consume) consume(chunk);
        else {
          total += chunk.length;
          if (total > 256 * 1024 * 1024)
            throw new Error(
              "Git returned more than 256 MB for one file listing.",
            );
          chunks.push(chunk);
        }
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
        child.kill("SIGTERM");
      }
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      if (stderr.length < 16_384)
        stderr += chunk.toString("utf8").slice(0, 16_384 - stderr.length);
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      signal?.removeEventListener("abort", abort);
      reject(
        error.code === "ENOENT"
          ? new Error("Git is required. Install Git and try again.")
          : error,
      );
    });
    child.once("close", (code) => {
      signal?.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(new Error(stderr.trim() || `Git exited with status ${code}.`));
      else resolveResult(Buffer.concat(chunks, total));
    });
  });
}

export function githubRemote(
  input: string,
): { url: string; name: string } | undefined {
  let source = input;
  if (/^github\.com\//i.test(source)) source = "https://" + source;
  else if (
    /^[\w.-]+\/[\w.-]+(?:\.git)?\/?$/.test(source) &&
    !source.startsWith(".")
  )
    source = "https://github.com/" + source;
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return undefined;
  }
  if (
    !/^(?:https?:)$/.test(url.protocol) ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Use a public GitHub repository URL (https://github.com/owner/repo) or a local repository directory.",
    );
  }
  const parts = url.pathname
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/, "")
    .split("/");
  if (
    parts.length !== 2 ||
    parts.some(
      (part) => !/^[\w.-]+$/.test(part) || part === "." || part === "..",
    )
  ) {
    throw new Error(
      "Provide a repository URL, without a branch, file, query, or fragment.",
    );
  }
  return {
    url: `https://github.com/${parts.join("/")}.git`,
    name: parts.join("/"),
  };
}

interface Touch {
  index: number;
  date: string;
  commits: number;
  contributors: number;
}
interface PathHistory {
  createdAt: string;
  touches: Touch[];
  authors: Set<string>;
}
interface History {
  commits: Commit[];
  paths: Map<string, PathHistory>;
}

/** Stream NUL-delimited history, including paths with spaces, tabs, or newlines. */
async function readHistory(
  root: string,
  head: string,
  include: (path: string) => boolean,
  options: LoadOptions,
): Promise<History> {
  const commits: Commit[] = [];
  const paths = new Map<string, PathHistory>();
  let pending = Buffer.alloc(0);
  let header: string[] | undefined;
  let current: Commit | undefined;
  let authorIdentity = "";
  let raw: string | undefined;
  let changes = new Map<string, FileChange>();

  const finishCommit = () => {
    if (!current) return;
    current.changes = [...changes.values()];
    const index = commits.length;
    for (const change of current.changes) {
      let history = paths.get(change.path);
      if (!history) {
        history = { createdAt: current.date, touches: [], authors: new Set() };
        paths.set(change.path, history);
      }
      history.authors.add(authorIdentity);
      history.touches.push({
        index,
        date: current.date,
        commits: history.touches.length + 1,
        contributors: history.authors.size,
      });
    }
    commits.push(current);
    if (commits.length % 2000 === 0)
      options.onProgress?.(`Read ${commits.length.toLocaleString()} commits…`);
    current = undefined;
    changes = new Map();
  };

  const token = (value: string) => {
    if (header) {
      header.push(value);
      if (header.length === 5) {
        current = {
          hash: header[0]!,
          date: header[1]!,
          author: header[2]!,
          subject: header[4]!,
          changes: [],
        };
        authorIdentity = header[3]!.toLowerCase() || header[2]!;
        header = undefined;
      }
      return;
    }
    if (raw !== undefined) {
      const fields = raw.split(" ");
      const oldIsFile = /^:(?:100\d{3}|120000)$/.test(fields[0]!);
      const newIsFile = /^(?:100\d{3}|120000)$/.test(fields[1]!);
      if ((oldIsFile || newIsFile) && include(value)) {
        changes.set(value, {
          path: value,
          status: !newIsFile ? "deleted" : !oldIsFile ? "added" : "modified",
        });
      }
      raw = undefined;
      return;
    }
    if (value === "") {
      finishCommit();
      header = [];
      return;
    }
    if (!current) throw new Error("Unable to parse Git commit history.");
    // Git inserts a newline before the first diff record of each commit.
    const record = value.startsWith("\n") ? value.slice(1) : value;
    if (record.startsWith(":")) {
      raw = record;
      return;
    }
    if (record) throw new Error("Unable to parse a Git history file change.");
  };

  await git(
    root,
    [
      "log",
      "--first-parent",
      "--reverse",
      "--root",
      "--no-renames",
      "--no-ext-diff",
      "--no-textconv",
      "--no-show-signature",
      "--no-color",
      "--no-notes",
      "--diff-merges=first-parent",
      "--format=%x00%H%x00%aI%x00%an%x00%ae%x00%s",
      "--raw",
      "-z",
      head,
      "--",
    ],
    options.signal,
    (chunk) => {
      const data = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      let start = 0;
      for (
        let end = data.indexOf(0);
        end !== -1;
        end = data.indexOf(0, start)
      ) {
        token(data.toString("utf8", start, end));
        start = end + 1;
      }
      pending = Buffer.from(data.subarray(start));
    },
  );
  if (pending.length || raw !== undefined || (header && header.length > 0))
    throw new Error("Git returned incomplete commit history.");
  finishCommit();
  return { commits, paths };
}

function metricsAt(
  history: PathHistory | undefined,
  index: number,
  fallbackDate: string,
): Omit<RepoFile, "path" | "directory" | "language" | "size" | "lines"> {
  if (!history)
    return {
      commits: 0,
      contributors: 0,
      createdAt: fallbackDate,
      lastModified: fallbackDate,
    };
  let low = 0;
  let high = history.touches.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (history.touches[middle]!.index <= index) low = middle + 1;
    else high = middle;
  }
  const touch = history.touches[low - 1];
  return {
    commits: touch?.commits ?? 0,
    contributors: touch?.contributors ?? 0,
    createdAt: history.createdAt,
    lastModified: touch?.date ?? fallbackDate,
  };
}

interface Snapshot {
  files: RepoFile[];
  blobs: Map<string, string>;
}

async function countBlobLines(
  root: string,
  hash: string,
  signal?: AbortSignal,
): Promise<number | undefined> {
  let bytes = 0;
  let newlines = 0;
  let lastByte = -1;
  let binary = false;
  await git(root, ["cat-file", "blob", hash], signal, (chunk) => {
    if (bytes < 8000 && chunk.subarray(0, 8000 - bytes).includes(0))
      binary = true;
    bytes += chunk.length;
    if (!binary) for (const byte of chunk) if (byte === 10) newlines++;
    if (chunk.length) lastByte = chunk[chunk.length - 1]!;
  });
  return binary ? undefined : newlines + (bytes > 0 && lastByte !== 10 ? 1 : 0);
}

/**
 * Load tracked, committed files from HEAD. History is the first-parent ancestry
 * chain, oldest first; merge frames are diffed against their first parent.
 * Metrics use that same chain, and renames are represented as delete/add.
 */
export async function loadRepository(
  input: string,
  options: LoadOptions = {},
): Promise<Repository> {
  if (!input.trim())
    throw new Error("Provide a local repository directory or GitHub URL.");
  const include = pathFilter(options.exclude ?? []);
  let temporary: string | undefined;
  let root: string;
  let name: string;
  try {
    // Bare owner/repo always means GitHub. Use ./owner/repo to select a local
    // checkout with the same name; behavior must not depend on the current cwd.
    const remote = githubRemote(input);
    if (remote) {
      options.onProgress?.(
        `Cloning ${remote.name} (complete default-branch history)…`,
      );
      temporary = await mkdtemp(join(tmpdir(), "gitcity-"));
      root = join(temporary, "repository.git");
      await git(
        temporary,
        [
          "-c",
          "credential.helper=",
          "clone",
          "--bare",
          "--single-branch",
          "--no-tags",
          "--quiet",
          "--",
          remote.url,
          root,
        ],
        options.signal,
      );
      name = remote.name;
    } else {
      const directory = await realpath(resolve(input)).catch(() => {
        throw new Error(`Repository directory does not exist: ${input}`);
      });
      const bare =
        (
          await git(
            directory,
            ["rev-parse", "--is-bare-repository"],
            options.signal,
          )
        )
          .toString()
          .trim() === "true";
      root = bare
        ? directory
        : (
            await git(
              directory,
              ["rev-parse", "--show-toplevel"],
              options.signal,
            )
          )
            .toString()
            .replace(/\n$/, "");
      name = basename(root).replace(/\.git$/, "");
    }
    const head = (
      await git(
        root,
        ["rev-parse", "--verify", "HEAD^{commit}"],
        options.signal,
      ).catch((error) => {
        if (error instanceof Error && error.name === "AbortError") throw error;
        throw new Error(
          "This repository has no checked-out commit. Create a commit or check out a branch first.",
        );
      })
    )
      .toString()
      .trim();
    options.onProgress?.(`Analyzing ${name}…`);
    const history = await readHistory(root, head, include, options);
    const snapshots = new Map<number, Promise<Snapshot>>();
    const lineCounts = new Map<string, Promise<number | undefined>>();
    let disposed = false;

    const getSnapshot = (index: number): Promise<Snapshot> => {
      if (disposed)
        return Promise.reject(new Error("This repository has been closed."));
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= history.commits.length
      )
        return Promise.reject(
          new RangeError(
            `Commit index ${index} is outside this repository's history.`,
          ),
        );
      const cached = snapshots.get(index);
      if (cached) {
        snapshots.delete(index);
        snapshots.set(index, cached);
        return cached;
      }
      const snapshot = (async () => {
        const commit = history.commits[index]!;
        const tree = await git(
          root,
          ["ls-tree", "-r", "-l", "-z", commit.hash, "--"],
          options.signal,
        );
        const files: RepoFile[] = [];
        const blobs = new Map<string, string>();
        for (const entry of tree.toString("utf8").split("\0")) {
          const tab = entry.indexOf("\t");
          if (tab === -1) continue;
          const metadata = entry.slice(0, tab).split(/\s+/);
          const path = entry.slice(tab + 1);
          if (metadata[1] !== "blob" || !include(path)) continue;
          files.push({
            path,
            directory: dirname(path) === "." ? "" : dirname(path),
            language: languageFor(path),
            size: Number(metadata[3]),
            ...metricsAt(history.paths.get(path), index, commit.date),
          });
          blobs.set(path, metadata[2]!);
        }
        return { files, blobs };
      })();
      snapshots.set(index, snapshot);
      snapshot.catch(() => {
        if (snapshots.get(index) === snapshot) snapshots.delete(index);
      });
      if (snapshots.size > 12) snapshots.delete(snapshots.keys().next().value!);
      return snapshot;
    };

    let githubUrl = remote?.url.replace(/\.git$/, "");
    if (!githubUrl) {
      try {
        const origin = (
          await git(
            root,
            ["config", "--get", "remote.origin.url"],
            options.signal,
          )
        )
          .toString()
          .trim()
          .replace(/^git@github\.com:/, "https://github.com/");
        githubUrl = githubRemote(origin)?.url.replace(/\.git$/, "");
      } catch {
        /* Local repositories need not have a GitHub remote. */
      }
    }
    const boundedContent = async (args: string[]) => {
      const chunks: Buffer[] = [];
      let size = 0,
        truncated = false;
      const limit = 64 * 1024,
        done = new Error("Preview limit reached");
      try {
        await git(root, args, options.signal, (chunk) => {
          const remaining = limit - size;
          chunks.push(chunk.subarray(0, remaining));
          size += Math.min(remaining, chunk.length);
          if (chunk.length > remaining) {
            truncated = true;
            throw done;
          }
        });
      } catch (error) {
        if (error !== done) throw error;
      }
      const bytes = Buffer.concat(chunks);
      const binary = bytes.includes(0);
      const rows = bytes.toString("utf8").split("\n");
      return {
        text: binary
          ? "Binary file — preview unavailable."
          : rows.slice(0, 600).join("\n"),
        binary,
        truncated: truncated || rows.length > 600,
      };
    };
    options.onProgress?.(
      `Ready: ${history.commits.length.toLocaleString()} commits, ${history.paths.size.toLocaleString()} file paths.`,
    );
    return {
      name,
      root,
      githubUrl,
      commits: history.commits,
      allPaths: [...history.paths.keys()].sort(),
      async sources(index) {
        const snapshot = await getSnapshot(index),
          selected: RepoFile[] = [],
          skipped: string[] = [];
        let total = 0;
        for (const file of snapshot.files) {
          if (
            !/\.[cm]?[jt]sx?$|(?:^|\/)(?:package|tsconfig|jsconfig)\.json$/.test(
              file.path,
            )
          )
            continue;
          if (file.size > 1024 * 1024 || total + file.size > 48 * 1024 * 1024) {
            skipped.push(file.path);
            continue;
          }
          total += file.size;
          selected.push(file);
        }
        const texts = new Map<string, string>();
        if (!selected.length) return { texts, skipped };
        const bytes = await git(
          root,
          ["cat-file", "--batch"],
          options.signal,
          undefined,
          selected.map((f) => snapshot.blobs.get(f.path)).join("\n") + "\n",
        );
        let offset = 0;
        for (const file of selected) {
          const end = bytes.indexOf(10, offset),
            header = bytes.toString("utf8", offset, end).split(" "),
            size = Number(header[2]);
          if (end < 0 || !Number.isFinite(size) || header[1] !== "blob")
            throw new Error("Incomplete source batch from Git.");
          const blob = bytes.subarray(end + 1, end + 1 + size);
          offset = end + size + 2;
          if (blob.includes(0)) skipped.push(file.path);
          else texts.set(file.path, blob.toString("utf8"));
        }
        return { texts, skipped };
      },
      async snapshot(index) {
        return (await getSnapshot(index)).files;
      },
      async inspect(index, path) {
        const snapshot = await getSnapshot(index);
        const file = snapshot.files.find((entry) => entry.path === path);
        const hash = snapshot.blobs.get(path);
        if (!file || !hash) return undefined;
        let count = lineCounts.get(hash);
        if (!count) {
          count = countBlobLines(root, hash, options.signal);
          lineCounts.set(hash, count);
          count.catch(() => {
            if (lineCounts.get(hash) === count) lineCounts.delete(hash);
          });
          if (lineCounts.size > 512)
            lineCounts.delete(lineCounts.keys().next().value!);
        }
        return { ...file, lines: await count };
      },
      async preview(index, path) {
        const snapshot = await getSnapshot(index);
        const blob = snapshot.blobs.get(path);
        if (!blob)
          throw new Error("This file does not exist at the selected commit.");
        return boundedContent(["cat-file", "blob", blob]);
      },
      async diff(index, path) {
        await getSnapshot(index);
        return boundedContent([
          "--literal-pathspecs",
          "show",
          "--format=",
          "--first-parent",
          "--root",
          "--no-ext-diff",
          "--no-textconv",
          "--no-color",
          "--unified=3",
          history.commits[index]!.hash,
          "--",
          path,
        ]);
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        snapshots.clear();
        lineCounts.clear();
        if (temporary) await rm(temporary, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}
