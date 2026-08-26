/**
 * list_files — list files and directories at a given path.
 *
 * Returns structured data. Respects project root and ignores
 * common large directories (node_modules, .git, dist, build).
 */

import * as fs from "node:fs/promises";
import type { Stats } from "node:fs";
import type { Tool, ToolResult } from "../types";
import type { ToolContext } from "../context";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".cache",
  "coverage",
]);

export const listFilesTool: Tool = {
  name: "list_files",
  description:
    "List files and directories at a given path relative to the project root. " +
    "Returns structured data with separate arrays for files and directories.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Directory path relative to the project root (default: '.')",
      },
    },
    required: [],
  },
  permission: "read",

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const relPath = (input.path as string) ?? ".";
    let absPath: string;

    try {
      absPath = context.resolvePath(relPath);
    } catch (err) {
      return {
        success: false,
        data: null,
        message: err instanceof Error ? err.message : String(err),
      };
    }

    let stat: Stats;
    try {
      stat = await fs.stat(absPath);
    } catch {
      return {
        success: false,
        data: null,
        message: `Path not found: ${relPath}`,
      };
    }

    if (!stat.isDirectory()) {
      return {
        success: false,
        data: null,
        message: `Path is not a directory: ${relPath}`,
      };
    }

    const entries = await fs.readdir(absPath, { withFileTypes: true });
    const files: string[] = [];
    const directories: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") {
        if (entry.isDirectory()) continue;
      }
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        directories.push(entry.name);
      } else {
        files.push(entry.name);
      }
    }

    files.sort();
    directories.sort();

    return {
      success: true,
      data: { path: relPath, files, directories },
    };
  },
};
