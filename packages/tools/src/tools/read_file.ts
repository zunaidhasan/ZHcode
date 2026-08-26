/**
 * read_file — read the contents of a file.
 *
 * Safety: path traversal prevention, binary detection, size limit.
 */

import * as fs from "node:fs/promises";
import type { Stats } from "node:fs";
import type { Tool, ToolResult } from "../types";
import type { ToolContext } from "../context";

/** Max file size to read (256 KB). */
const MAX_FILE_SIZE = 256 * 1024;

/** Binary detection: check first 512 bytes for null bytes. */
const BINARY_CHECK_BYTES = 512;

export const readFileTool: Tool = {
  name: "read_file",
  description:
    "Read the contents of a file. Returns the text content with line numbers. " +
    "Rejects binary files and files larger than 256KB.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path relative to the project root.",
      },
      offset: {
        type: "number",
        description: "Line number to start reading from (1-indexed). Default: 1.",
      },
      limit: {
        type: "number",
        description: "Maximum number of lines to read. Default: 2000.",
      },
    },
    required: ["path"],
  },
  permission: "read",

  async execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const relPath = input.path as string;
    if (!relPath) {
      return { success: false, data: null, message: "path is required" };
    }

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
      return { success: false, data: null, message: `File not found: ${relPath}` };
    }

    if (stat.isDirectory()) {
      return { success: false, data: null, message: `Path is a directory, not a file: ${relPath}` };
    }

    // Size check.
    if (stat.size > MAX_FILE_SIZE) {
      return {
        success: false,
        data: null,
        message: `File too large: ${relPath} (${stat.size} bytes, limit: ${MAX_FILE_SIZE})`,
      };
    }

    // Binary detection.
    const fd = await fs.open(absPath, "r");
    try {
      const buf = Buffer.alloc(BINARY_CHECK_BYTES);
      const { bytesRead } = await fd.read(buf, 0, BINARY_CHECK_BYTES, 0);
      if (buf.subarray(0, bytesRead).includes(0)) {
        return { success: false, data: null, message: `Binary file rejected: ${relPath}` };
      }
    } finally {
      await fd.close();
    }

    // Read the full content.
    const content = await fs.readFile(absPath, "utf-8");
    const allLines = content.split("\n");

    const offset = Math.max(1, (input.offset as number) ?? 1);
    const limit = Math.min(2000, Math.max(1, (input.limit as number) ?? 2000));
    const startIdx = offset - 1;
    const endIdx = startIdx + limit;
    const lines = allLines.slice(startIdx, endIdx);

    const numbered = lines.map((line, i) => {
      const num = String(startIdx + i + 1).padStart(4, " ");
      return `${num} | ${line}`;
    });

    return {
      success: true,
      data: {
        path: relPath,
        content: numbered.join("\n"),
        totalLines: allLines.length,
        offset,
        linesRead: lines.length,
      },
    };
  },
};
