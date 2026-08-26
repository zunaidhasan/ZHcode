/**
 * search_files — search for text patterns across the project.
 *
 * Uses ripgrep (rg) if available, falls back to a simple recursive
 * grep implementation.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolResult } from "../types";
import type { ToolContext } from "../context";

const execFileAsync = promisify(execFile);

/** Max matches to return. */
const MAX_MATCHES = 250;

/** Directories to always skip. */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".cache",
  "coverage",
]);

export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  text: string;
}

async function searchWithRipgrep(
  query: string,
  searchPath: string,
  input: Record<string, unknown>,
): Promise<SearchMatch[]> {
  const args = [
    "--json",
    "--max-count", String(MAX_MATCHES),
    "--no-heading",
    "-n",
    // Always exclude common large/irrelevant directories
    "--glob", "!node_modules",
    "--glob", "!.git",
    "--glob", "!dist",
    "--glob", "!build",
    "--glob", "!.next",
    "--glob", "!.cache",
    "--glob", "!coverage",
  ];

  if (input.caseInsensitive) args.push("-i");
  if (input.filePattern) args.push("-g", input.filePattern as string);

  args.push("--", query, searchPath);

  const { stdout } = await execFileAsync("rg", args, {
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });

  const matches: SearchMatch[] = [];
  for (const line of stdout.split("\n").filter(Boolean)) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === "match") {
        const match = parsed.data;
        matches.push({
          file: path.relative(searchPath, match.path.text),
          line: match.line_number,
          column: match.submatches?.[0]?.start ?? 0,
          text: match.lines.text.trim(),
        });
      }
    } catch {
      // Skip malformed lines.
    }
    if (matches.length >= MAX_MATCHES) break;
  }

  return matches;
}

async function searchNative(
  query: string,
  searchPath: string,
  input: Record<string, unknown>,
): Promise<SearchMatch[]> {
  const caseInsensitive = input.caseInsensitive === true;
  const regex = new RegExp(query, caseInsensitive ? "gi" : "g");
  const matches: SearchMatch[] = [];

  const searchDir = async (dir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (matches.length >= MAX_MATCHES) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await searchDir(fullPath);
      } else if (entry.isFile()) {
        // Skip binary files by extension.
        if (/\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)$/.test(entry.name)) continue;
        try {
          const content = await fs.readFile(fullPath, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= MAX_MATCHES) return;
            const line = lines[i]!;
            regex.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = regex.exec(line)) !== null) {
              matches.push({
                file: path.relative(searchPath, fullPath),
                line: i + 1,
                column: m.index,
                text: line.trim(),
              });
              if (matches.length >= MAX_MATCHES) break;
            }
          }
        } catch {
          // Skip files that can't be read as UTF-8.
        }
      }
    }
  };

  await searchDir(searchPath);
  return matches;
}

export const searchFilesTool: Tool = {
  name: "search_files",
  description:
    "Search for a text pattern across project files. Returns matches with file, line, column, and matched text. " +
    "Uses ripgrep when available for fast searching.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Text or regex pattern to search for.",
      },
      path: {
        type: "string",
        description: "Directory to search within (relative to project root). Default: entire project.",
      },
      caseInsensitive: {
        type: "boolean",
        description: "Case-insensitive search. Default: false.",
      },
      filePattern: {
        type: "string",
        description: "Filter to files matching this glob (e.g. '*.ts').",
      },
    },
    required: ["query"],
  },
  permission: "read",

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const query = input.query as string;
    if (!query) {
      return { success: false, data: null, message: "query is required" };
    }

    let searchPath: string;
    try {
      searchPath = input.path
        ? context.resolvePath(input.path as string)
        : context.projectRoot;
    } catch (err) {
      return {
        success: false,
        data: null,
        message: err instanceof Error ? err.message : String(err),
      };
    }

    // Validate search path is within project root.
    if (!searchPath.startsWith(context.projectRoot)) {
      return {
        success: false,
        data: null,
        message: "Search path must be within the project root.",
      };
    }

    let matches: SearchMatch[];
    try {
      matches = await searchWithRipgrep(query, searchPath, input);
    } catch {
      matches = await searchNative(query, searchPath, input);
    }

    return {
      success: true,
      data: { matches, totalMatches: matches.length },
    };
  },
};
