#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const args = process.argv.slice(2);
if (!existsSync(entry)) {
  process.stderr.write(
    "gitcity: Build the project first with npm install && npm run build.\n",
  );
  process.exit(1);
}

const headless = args.some((arg) =>
  ["--help", "-h", "--version", "-v", "--snapshot", "--json"].includes(arg),
);
const [major, minor] = process.versions.node.split(".").map(Number);
const nodeSupportsFFI = major > 26 || (major === 26 && minor >= 4);
if (
  process.versions.bun ||
  headless ||
  (nodeSupportsFFI && process.execArgv.includes("--experimental-ffi"))
) {
  const { main } = await import(
    new URL("../dist/cli.js", import.meta.url).href
  );
  await main();
} else {
  const runtime = nodeSupportsFFI ? process.execPath : "bun";
  const runtimeArgs = nodeSupportsFFI
    ? ["--experimental-ffi", entry, ...args]
    : [entry, ...args];
  const child = spawnSync(runtime, runtimeArgs, { stdio: "inherit" });
  if (child.error) {
    process.stderr.write(
      nodeSupportsFFI
        ? `gitcity: Could not start the renderer: ${child.error.message}\n`
        : "gitcity: Interactive mode needs Node.js 26.4+ or Bun on PATH. Upgrade Node.js, or install Bun and retry. Use --snapshot for a headless preview.\n",
    );
    process.exitCode = 1;
  } else {
    process.exitCode =
      child.status ??
      (child.signal === "SIGINT" ? 130 : child.signal === "SIGTERM" ? 143 : 1);
  }
}
