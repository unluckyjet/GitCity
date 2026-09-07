#!/usr/bin/env node
/** A deterministic, fictional repository for Git City demos. Never overwrites files. */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

const destination = process.argv[2];
if (!destination || process.argv.length !== 3) {
  process.stderr.write(
    "Usage: node scripts/create-demo.ts <empty-destination-directory>\n",
  );
  process.exit(1);
}
const root = resolve(destination);
if (
  existsSync(root) &&
  (lstatSync(root).isSymbolicLink() ||
    !lstatSync(root).isDirectory() ||
    readdirSync(root).length)
) {
  process.stderr.write(
    `Refusing to overwrite a nonempty directory, file, or symlink: ${root}\n`,
  );
  process.exit(1);
}
mkdirSync(root, { recursive: true });

const git = (args: string[], env: NodeJS.ProcessEnv = process.env): string =>
  execFileSync(
    "git",
    [
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgSign=false",
      "-c",
      "core.autocrlf=false",
      ...args,
    ],
    { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
git(["init", "--quiet", "--initial-branch=main"]);

const paths = [
  "README.md",
  "src/index.ts",
  "package.json",
  "src/app.ts",
  ...[
    "Button",
    "Card",
    "Dialog",
    "Header",
    "Footer",
    "Nav",
    "Search",
    "Avatar",
    "Table",
    "Toast",
    "Tabs",
    "Chart",
  ].map((name) => `src/components/${name}.tsx`),
  "src/api/auth.ts",
  "src/api/users.ts",
  "src/api/projects.ts",
  "src/api/events.ts",
  "src/api/server.go",
  "src/api/worker.rs",
  "src/api/legacy.js",
  ...[
    "dates.ts",
    "format.ts",
    "validate.ts",
    "cache.ts",
    "http.ts",
    "colors.ts",
    "legacy.ts",
  ].map((name) => `src/utils/${name}`),
  ...["auth", "users", "projects", "components", "cache", "integration"].map(
    (name) => `tests/${name}.test.ts`,
  ),
  "docs/guide.md",
  "docs/architecture.md",
  "docs/api.md",
  "docs/contributing.md",
  "styles/base.css",
  "styles/components.css",
  "styles/theme.scss",
  "scripts/seed.py",
  "scripts/audit.sh",
];
const active = new Set<string>();
const revisions = new Map<string, number>();
const authors = [
  ["Ada Chen", "ada@example.test"],
  ["Sam Rivera", "sam@example.test"],
  ["Alex Kim", "alex@example.test"],
  ["Priya Shah", "priya@example.test"],
  ["Morgan Ellis", "morgan@example.test"],
];
const names = [
  "Foundation",
  "Identity",
  "Projects",
  "Navigation",
  "Search",
  "Performance",
  "Accessibility",
  "Release",
];

function content(path: string, revision: number, ordinal: number): string {
  const count = 5 + (ordinal % 9) * 4 + revision * 7;
  const unit = basename(path).replace(/[^a-zA-Z0-9]/g, "_");
  const extension = extname(path);
  const header = `${path} · revision ${revision}`;
  if (path === "package.json")
    return (
      JSON.stringify(
        {
          name: "gitcity-demo",
          version: `0.${revision}.0`,
          private: true,
          description: "Fictional history fixture for Git City",
          keywords: Array.from({ length: count }, (_, i) => `feature-${i}`),
        },
        null,
        2,
      ) + "\n"
    );
  if (extension === ".md")
    return (
      `# ${path === "README.md" ? "Atlas — Git City demo" : unit}\n\nA fictional project with deterministic commits from 2018 through 2026.\n\n` +
      Array.from(
        { length: count },
        (_, i) =>
          `## Milestone ${i + 1}\n\nRevision ${revision} documents the ${names[i % names.length]!.toLowerCase()} workflow and its examples.\n`,
      ).join("\n")
    );
  if ([".css", ".scss"].includes(extension))
    return (
      `/* ${header} */\n` +
      Array.from(
        { length: count },
        (_, i) =>
          `.atlas-${i} {\n  color: hsl(${(i * 37) % 360} 40% 70%);\n  padding: ${(i % 8) + 2}px;\n}\n`,
      ).join("\n")
    );
  if (extension === ".py")
    return (
      `# ${header}\n\n` +
      Array.from(
        { length: count },
        (_, i) =>
          `def seed_${i}(value):\n    """Prepare fixture ${i}."""\n    return {"id": ${i}, "value": value, "revision": ${revision}}\n`,
      ).join("\n")
    );
  if (extension === ".sh")
    return (
      `#!/bin/sh\n# ${header}\nset -eu\n\n` +
      Array.from(
        { length: count },
        (_, i) =>
          `printf '%s\\n' 'Audit check ${i + 1}, revision ${revision}'\n`,
      ).join("")
    );
  if (extension === ".go")
    return (
      `package api\n\n// ${header}\n` +
      Array.from(
        { length: count },
        (_, i) =>
          `func Event${i}(value int) int {\n    return value + ${i + revision}\n}\n`,
      ).join("\n")
    );
  if (extension === ".rs")
    return (
      `// ${header}\n\n` +
      Array.from(
        { length: count },
        (_, i) =>
          `pub fn task_${i}(value: usize) -> usize {\n    value + ${i + revision}\n}\n`,
      ).join("\n")
    );
  if (extension === ".tsx")
    return (
      `// ${header}\n\n` +
      Array.from(
        { length: count },
        (_, i) =>
          `export function ${unit}_${i}() {\n  return <section data-revision="${revision}">${names[i % names.length]} ${i + 1}</section>;\n}\n`,
      ).join("\n")
    );
  return (
    `// ${header}\n\n` +
    Array.from(
      { length: count },
      (_, i) =>
        `export function ${unit}_${i}(value${extension === ".ts" ? ": number" : ""}) {\n  // Normalize ${names[i % names.length]!.toLowerCase()} data.\n  return value + ${i + revision};\n}\n`,
    ).join("\n")
  );
}

function update(path: string): void {
  const revision = (revisions.get(path) ?? 0) + 1;
  revisions.set(path, revision);
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(
    join(root, path),
    content(path, revision, Math.max(0, paths.indexOf(path))),
  );
  active.add(path);
}
function remove(path: string): void {
  unlinkSync(join(root, path));
  active.delete(path);
}
function rename(from: string, to: string): void {
  mkdirSync(dirname(join(root, to)), { recursive: true });
  renameSync(join(root, from), join(root, to));
  active.delete(from);
  active.add(to);
  revisions.set(to, revisions.get(from) ?? 1);
}

const first = Date.parse("2018-01-12T12:00:00Z");
const last = Date.parse("2026-09-06T12:00:00Z");
for (let index = 0; index < 120; index++) {
  let message = `${names[Math.floor(index / 15)]}: refine ${names[index % names.length]!.toLowerCase()} workflows`;
  if (index === 0) {
    update(paths[0]!);
    update(paths[1]!);
    message = "Foundation: the first two buildings";
  } else if (index <= paths.length - 2) {
    update(paths[index + 1]!);
    message = `Build ${paths[index + 1]}`;
  }
  if (index === 59) {
    remove("src/api/legacy.js");
    message = "Retire the legacy JavaScript API";
  }
  if (index === 71) {
    remove("src/utils/legacy.ts");
    message = "Remove obsolete compatibility utilities";
  }
  if (index === 83) {
    rename("src/components/Card.tsx", "src/components/Panel.tsx");
    message = "Rename Card to Panel as the design system grows";
  }
  if (index === 95) {
    update("src/api/search.ts");
    message = "Open the new search service";
  }
  if (index === 107) {
    rename("docs/guide.md", "docs/getting-started.md");
    message = "Reorganize the getting started guide";
  }
  if (index === 111) {
    update("tests/search.test.ts");
    message = "Add search integration coverage";
  }
  if (index > 0) {
    const candidates = [...active].filter(
      (path) =>
        !["src/components/Panel.tsx", "docs/getting-started.md"].includes(path),
    );
    update(candidates[(index * 7) % candidates.length]!);
    update(candidates[(index * 13 + 3) % candidates.length]!);
  }
  git(["add", "--all"]);
  const author = authors[index % authors.length]!;
  const date = new Date(
    Math.round(first + ((last - first) * index) / 119),
  ).toISOString();
  git(["commit", "--quiet", "--no-verify", "-m", message], {
    ...process.env,
    GIT_AUTHOR_NAME: author[0],
    GIT_AUTHOR_EMAIL: author[1],
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: author[0],
    GIT_COMMITTER_EMAIL: author[1],
    GIT_COMMITTER_DATE: date,
  });
}
process.stderr.write(
  `Created 120 commits, ${active.size} files, and five contributors (2018–2026).\n`,
);
process.stdout.write(`${root}\n`);
