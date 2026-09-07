import ts from "typescript";
import { posix as path } from "node:path";
import type { SourceSnapshot } from "./types.ts";
export interface DependencyGraph {
  outgoing: Map<string, string[]>;
  incoming: Map<string, string[]>;
  unresolved: Map<string, string[]>;
  analyzed: number;
  skipped: number;
  entrypoints: string[];
}
/** Parse syntax only. Repository code and package scripts are never executed. */
export function analyzeDependencies(
  snapshot: SourceSnapshot,
  paths: string[],
): DependencyGraph {
  const files = new Set(paths),
    outgoing = new Map<string, string[]>(),
    incoming = new Map<string, string[]>(),
    unresolved = new Map<string, string[]>();
  const packages = new Map<string, { dir: string; main: string }>(),
    configs: { dir: string; base: string; paths: Record<string, string[]> }[] =
      [],
    entries = new Set<string>();
  const resolveFile = (p: string): string | undefined => {
    p = path.normalize(p);
    for (const candidate of [
      p,
      ...[
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".mts",
        ".mjs",
        ".cts",
        ".cjs",
        ".json",
        "/index.ts",
        "/index.tsx",
        "/index.js",
        "/index.jsx",
      ].map((e) => p + e),
    ])
      if (files.has(candidate)) return candidate;
    if (/\.[mc]?js$/.test(p))
      return [".ts", ".tsx", ".mts", ".cts"]
        .map((e) => p.replace(/\.[mc]?js$/, e))
        .find((c) => files.has(c));
  };
  for (const [p, source] of snapshot.texts) {
    if (!/(?:^|\/)(?:package|tsconfig|jsconfig)\.json$/.test(p)) continue;
    const json = ts.parseConfigFileTextToJson(p, source).config;
    if (!json) continue;
    const dir = path.dirname(p) === "." ? "" : path.dirname(p);
    if (p.endsWith("package.json")) {
      const main =
        typeof json.module === "string"
          ? json.module
          : typeof json.main === "string"
            ? json.main
            : "index.js";
      if (typeof json.name === "string") packages.set(json.name, { dir, main });
      for (const item of [
        main,
        typeof json.bin === "string" ? json.bin : undefined,
        ...Object.values(
          json.bin && typeof json.bin === "object" ? json.bin : {},
        ),
      ])
        if (typeof item === "string") {
          const entry = resolveFile(path.join(dir, item));
          if (entry) entries.add(entry);
        }
    } else {
      const c = json.compilerOptions ?? {};
      configs.push({
        dir,
        base: path.join(dir, typeof c.baseUrl === "string" ? c.baseUrl : "."),
        paths: c.paths ?? {},
      });
    }
  }
  configs.sort((a, b) => b.dir.length - a.dir.length);
  function resolveImport(from: string, spec: string) {
    if (spec.startsWith("."))
      return resolveFile(path.join(path.dirname(from), spec));
    const config = configs.find((c) => !c.dir || from.startsWith(c.dir + "/"));
    if (config) {
      for (const [alias, targets] of Object.entries(config.paths)) {
        const [pre, post] = alias.split("*");
        if (
          spec === alias ||
          (alias.includes("*") &&
            spec.startsWith(pre!) &&
            spec.endsWith(post ?? ""))
        ) {
          const middle = spec.slice(
            pre!.length,
            post ? -post.length : undefined,
          );
          for (const target of Array.isArray(targets) ? targets : []) {
            if (typeof target !== "string") continue;
            const found = resolveFile(
              path.join(config.base, target.replace("*", middle)),
            );
            if (found) return found;
          }
        }
      }
      const found = resolveFile(path.join(config.base, spec));
      if (found) return found;
    }
    for (const [name, pkg] of packages)
      if (spec === name || spec.startsWith(name + "/")) {
        const found = resolveFile(
          path.join(
            pkg.dir,
            spec === name ? pkg.main : spec.slice(name.length + 1),
          ),
        );
        if (found) return found;
      }
  }
  let analyzed = 0;
  for (const [p, source] of snapshot.texts) {
    if (!/\.[cm]?[jt]sx?$/.test(p)) continue;
    analyzed++;
    const ast = ts.createSourceFile(p, source, ts.ScriptTarget.Latest, true),
      specs = new Set<string>();
    const visit = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteralLike(node.moduleSpecifier)
      )
        specs.add(node.moduleSpecifier.text);
      if (
        ts.isCallExpression(node) &&
        node.arguments.length === 1 &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require")) &&
        ts.isStringLiteralLike(node.arguments[0]!)
      )
        specs.add(node.arguments[0]!.text);
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression &&
        ts.isStringLiteralLike(node.moduleReference.expression)
      )
        specs.add(node.moduleReference.expression.text);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    const edges = new Set<string>(),
      missing: string[] = [];
    for (const spec of specs) {
      const target = resolveImport(p, spec);
      if (target && target !== p) edges.add(target);
      else if (!target) missing.push(spec);
    }
    outgoing.set(p, [...edges].sort());
    if (missing.length) unresolved.set(p, missing.sort());
    for (const target of edges) {
      const list = incoming.get(target) ?? [];
      list.push(p);
      incoming.set(target, list);
    }
  }
  for (const p of paths)
    if (/(?:^|\/)(?:main|server|app|index)\.[cm]?[jt]sx?$/.test(p))
      entries.add(p);
  return {
    outgoing,
    incoming,
    unresolved,
    analyzed,
    skipped: snapshot.skipped.length,
    entrypoints: [...entries].sort(),
  };
}
