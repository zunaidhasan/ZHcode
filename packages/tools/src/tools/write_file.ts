/**
 * write_file — create or overwrite a file.
 *
 * Requires write permission. All paths resolve relative to project root.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool } from "../types";
import { ToolError } from "../types";
import type { ToolContext } from "../context";

export const writeFileTool: Tool = {
  name: "write_file",
  description:
    "Create or overwrite a file with the given content. " +
    "All paths are relative to the project root. Requires write permission.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path relative to the project root.",
      },
      content: {
        type: "string",
        description: "The full content to write to the file.",
      },
    },
    required: ["path", "content"],
  },
  permission: "write",

  async execute(input: Record<string, unknown>, context: ToolContext) {
    const relPath = input.path as string;
    const content = input.content as string;

    if (!relPath) {
      throw new ToolError("write_file", "path is required", "INPUT_INVALID");
    }
    if (content === undefined || content === null) {
      throw new ToolError("write_file", "content is required", "INPUT_INVALID");
    }

    const absPath = context.resolvePath(relPath);

    // Ensure parent directory exists.
    const dir = path.dirname(absPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(absPath, content, "utf-8");

    return {
      success: true,
      data: {
        path: relPath,
        bytesWritten: Buffer.byteLength(content, "utf-8"),
      },
      message: `File written: ${relPath}`,
    };
  },
};
