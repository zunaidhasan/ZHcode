/**
 * FileIndex — lightweight file metadata index.
 *
 * Scans the project and builds a fast-lookup index of file metadata
 * without reading file contents.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Dirent } from "node:fs";
import type { FileMetadata, ProjectLanguage } from "./types";

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
  ".idea",
  ".vscode",
]);

/** Files that are typically important (entry points, configs). */
const IMPORTANT_FILES = new Set([
  "index.ts",
  "index.js",
  "index.tsx",
  "index.jsx",
  "main.ts",
  "main.js",
  "app.ts",
  "app.js",
  "App.tsx",
  "App.jsx",
  "package.json",
  "tsconfig.json",
  "README.md",
  "README",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  ".env.example",
]);

/** Extension to language mapping. */
const EXTENSION_LANGUAGE: Record<string, ProjectLanguage> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".php": "php",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".rb": "ruby",
};

export class FileIndex {
  private files: FileMetadata[] = [];
  private pathMap = new Map<string, FileMetadata>();
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  /** Build the index by scanning the project. */
  async build(): Promise<void> {
    this.files = [];
    this.pathMap.clear();
    await this.scanDir(this.root);
  }

  /** Get all indexed files. */
  getAll(): FileMetadata[] {
    return [...this.files];
  }

  /** Get a file by relative path. */
  getByPath(relativePath: string): FileMetadata | undefined {
    return this.pathMap.get(relativePath);
  }

  /** Get files filtered by language. */
  getByLanguage(language: ProjectLanguage): FileMetadata[] {
    return this.files.filter((f) => f.language === language);
  }

  /** Get important files. */
  getImportant(): FileMetadata[] {
    return this.files.filter((f) => f.isImportant);
  }

  /** Get total file count. */
  get count(): number {
    return this.files.length;
  }

  /** Get total size in bytes. */
  get totalSize(): number {
    return this.files.reduce((sum, f) => sum + f.size, 0);
  }

  /** Search files by path pattern. */
  searchByPath(query: string): FileMetadata[] {
    const lower = query.toLowerCase();
    return this.files.filter((f) => f.path.toLowerCase().includes(lower));
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async scanDir(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path
        .relative(this.root, fullPath)
        .replace(/\\/g, "/");

      if (entry.isDirectory()) {
        await this.scanDir(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(fullPath);
          const ext = path.extname(entry.name);
          const metadata: FileMetadata = {
            path: relativePath,
            extension: ext,
            size: stat.size,
            language: EXTENSION_LANGUAGE[ext] ?? "unknown",
            lastModified: stat.mtimeMs,
            isImportant: IMPORTANT_FILES.has(entry.name),
          };
          this.files.push(metadata);
          this.pathMap.set(relativePath, metadata);
        } catch {
          // Skip files we can't stat.
        }
      }
    }
  }
}
