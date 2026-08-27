/**
 * ProjectStructure — compact representation of project layout.
 *
 * Provides a human-readable and model-friendly view of the project's
 * directory structure without dumping the entire tree.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ProjectStructure } from "./types";

/** Directories to always skip. */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".cache",
  "coverage",
  "__pycache__",
  ".venv",
  "vendor",
]);

/** Max entries per key directory. */
const MAX_ENTRIES_PER_DIR = 20;

export class StructureBuilder {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  /** Build the project structure. */
  async build(): Promise<ProjectStructure> {
    const topLevel = await this.readDir(this.root);
    const directories = topLevel
      .filter((e) => e.isDirectory)
      .map((e) => e.name);
    const files = topLevel.filter((e) => !e.isDirectory).map((e) => e.name);

    // Read key directories (src/, lib/, app/, etc.)
    const keyDirectories: Record<string, string[]> = {};
    const keyDirNames = [
      "src",
      "lib",
      "app",
      "pages",
      "components",
      "services",
      "utils",
      "hooks",
    ];

    for (const dirName of keyDirNames) {
      if (directories.includes(dirName)) {
        const entries = await this.readDir(path.join(this.root, dirName));
        keyDirectories[dirName] = entries
          .slice(0, MAX_ENTRIES_PER_DIR)
          .map((e) => (e.isDirectory ? `${e.name}/` : e.name));
      }
    }

    return { directories, files, keyDirectories };
  }

  /** Format structure as compact text for model context. */
  format(structure: ProjectStructure): string {
    const lines: string[] = [];

    // Top-level files
    if (structure.files.length > 0) {
      for (const file of structure.files) {
        lines.push(file);
      }
    }

    // Key directories
    for (const [dir, entries] of Object.entries(structure.keyDirectories)) {
      lines.push(`${dir}/`);
      for (const entry of entries) {
        lines.push(`  ${entry}`);
      }
    }

    return lines.join("\n");
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async readDir(
    dirPath: string,
  ): Promise<Array<{ name: string; isDirectory: boolean }>> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((e) => !IGNORED_DIRS.has(e.name) && !e.name.startsWith("."))
        .map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
    } catch {
      return [];
    }
  }
}
