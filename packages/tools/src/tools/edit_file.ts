/**
 * edit_file — apply a targeted text replacement in a file.
 *
 * Requires an exact match of oldText. Fails if:
 *   - oldText is not found
 *   - oldText occurs more than once (ambiguous)
 */

import * as fs from "node:fs/promises";
import type { Tool, ToolResult } from "../types";
import type { ToolContext } from "../context";

export const editFileTool: Tool = {
  name: "edit_file",
  description:
    "Replace an exact text snippet in a file. Requires the oldText to appear exactly once. " +
    "Use this for targeted edits instead of rewriting entire files.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path relative to the project root.",
      },
      oldText: {
        type: "string",
        description:
          "The exact text to find and replace. Must appear exactly once.",
      },
      newText: {
        type: "string",
        description: "The replacement text.",
      },
    },
    required: ["path", "oldText", "newText"],
  },
  permission: "write",

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const relPath = input.path as string;
    const oldText = input.oldText as string;
    const newText = input.newText as string;

    if (!relPath) {
      return { success: false, data: null, message: "path is required" };
    }
    if (oldText === undefined || oldText === null) {
      return { success: false, data: null, message: "oldText is required" };
    }
    if (newText === undefined || newText === null) {
      return { success: false, data: null, message: "newText is required" };
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

    let content: string;
    try {
      content = await fs.readFile(absPath, "utf-8");
    } catch {
      return {
        success: false,
        data: null,
        message: `File not found: ${relPath}`,
      };
    }

    const count = content.split(oldText).length - 1;

    if (count === 0) {
      return {
        success: false,
        data: null,
        message: `Target text not found in ${relPath}. Ensure oldText matches exactly (including whitespace and indentation).`,
      };
    }

    if (count > 1) {
      return {
        success: false,
        data: null,
        message: `Target text is ambiguous — found ${count} occurrences in ${relPath}. Provide more surrounding context to make it unique.`,
      };
    }

    const updated = content.replace(oldText, newText);
    await fs.writeFile(absPath, updated, "utf-8");

    return {
      success: true,
      data: {
        path: relPath,
        replaced: true,
        oldLength: oldText.length,
        newLength: newText.length,
      },
      message: `Edited ${relPath}: replaced ${oldText.length} chars with ${newText.length} chars.`,
    };
  },
};
