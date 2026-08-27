/**
 * Project initialization for the ZHcode CLI.
 *
 * `/init` detects metadata about the current project (name, git, package
 * manager, language) and persists it to `.zhcode/config.json`. Pure
 * async logic — no terminal I/O — so it can be unit tested.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface ProjectInfo {
  /** Project name (package.json "name", else directory basename). */
  name: string;
  /** Absolute path to the project root. */
  root: string;
  /** Whether the project is a git repository. */
  git: boolean;
  /** Detected package manager, if any. */
  packageManager: "bun" | "npm" | "yarn" | "pnpm" | "none";
  /** Detected primary language / toolchain. */
  language: string;
}

export const CONFIG_DIR = ".zhcode";
export const CONFIG_FILE = "config.json";

function detectPackageManager(
  files: Set<string>,
): ProjectInfo["packageManager"] {
  if (files.has("bun.lock") || files.has("bun.lockb")) return "bun";
  if (files.has("pnpm-lock.yaml")) return "pnpm";
  if (files.has("yarn.lock")) return "yarn";
  if (files.has("package-lock.json") || files.has("npm-shrinkwrap.json"))
    return "npm";
  return "none";
}

function detectLanguage(files: Set<string>): string {
  if (files.has("package.json")) return "typescript";
  if (files.has("go.mod")) return "go";
  if (files.has("Cargo.toml")) return "rust";
  if (files.has("pyproject.toml") || files.has("requirements.txt"))
    return "python";
  if (
    files.has("pom.xml") ||
    files.has("build.gradle") ||
    files.has("build.gradle.kts")
  )
    return "java";
  if (files.has("composer.json")) return "php";
  if (files.has("Gemfile")) return "ruby";
  return "unknown";
}

/** Detect metadata about the project at `root`. */
export async function detectProject(root: string): Promise<ProjectInfo> {
  const entries = await fs
    .readdir(root, { withFileTypes: true })
    .catch(() => []);
  const files = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
  const dirs = new Set(
    entries.filter((e) => e.isDirectory()).map((e) => e.name),
  );

  let name = path.basename(root);
  if (files.has("package.json")) {
    try {
      const pkg = JSON.parse(
        await fs.readFile(path.join(root, "package.json"), "utf-8"),
      ) as { name?: string };
      if (typeof pkg.name === "string" && pkg.name) name = pkg.name;
    } catch {
      // Fall back to directory basename.
    }
  }

  return {
    name,
    root,
    git: dirs.has(".git"),
    packageManager: detectPackageManager(files),
    language: detectLanguage(files),
  };
}

/** Detect project info and persist it to `.zhcode/config.json`. */
export async function initializeProject(
  root: string,
): Promise<{ info: ProjectInfo; configPath: string }> {
  const info = await detectProject(root);
  const configPath = path.join(root, CONFIG_DIR, CONFIG_FILE);

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(info, null, 2) + "\n", "utf-8");

  return { info, configPath };
}

/** Render a human-readable summary of a detected project. */
export function formatProjectInfo(info: ProjectInfo): string[] {
  return [
    `ZHcode initialized for ${info.name}`,
    `  root:            ${info.root}`,
    `  git:             ${info.git ? "yes" : "no"}`,
    `  package manager: ${info.packageManager}`,
    `  language:        ${info.language}`,
  ];
}
