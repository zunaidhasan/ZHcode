/**
 * git_status — get the current git status of the project.
 *
 * Returns branch, clean state, modified files, and untracked files.
 * Handles repos with no commits (orphan repos).
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolResult } from "../types";
import type { ToolContext } from "../context";

const execAsync = promisify(exec);

export const gitStatusTool: Tool = {
  name: "git_status",
  description:
    "Get the current git status: branch, whether the working tree is clean, " +
    "and lists of modified and untracked files.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  permission: "git",

  async execute(_input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      // Get branch name (works even without commits on some git versions).
      let branch = "main";
      try {
        const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
          cwd: context.projectRoot,
          timeout: 5_000,
        });
        branch = stdout.trim();
      } catch {
        // If HEAD doesn't exist (no commits yet), try symbolic-ref.
        try {
          const { stdout } = await execAsync("git symbolic-ref --short HEAD 2>/dev/null || echo unknown", {
            cwd: context.projectRoot,
            timeout: 5_000,
          });
          branch = stdout.trim();
          if (branch === "unknown") branch = "main";
        } catch {
          branch = "main";
        }
      }

      // Get status --porcelain.
      const { stdout: statusOut } = await execAsync("git status --porcelain", {
        cwd: context.projectRoot,
        timeout: 5_000,
      });

      const modified: string[] = [];
      const untracked: string[] = [];
      const staged: string[] = [];

      for (const line of statusOut.split("\n").filter(Boolean)) {
        const indexStatus = line[0];
        const worktreeStatus = line[1];
        const filePath = line.slice(3).trim();

        if (indexStatus === "?") {
          untracked.push(filePath);
        } else {
          if (indexStatus !== " " && indexStatus !== "?") {
            staged.push(filePath);
          }
          if (worktreeStatus !== " " && worktreeStatus !== "?") {
            modified.push(filePath);
          }
        }
      }

      return {
        success: true,
        data: {
          branch,
          clean: modified.length === 0 && untracked.length === 0 && staged.length === 0,
          modified,
          untracked,
          staged,
        },
      };
    } catch (err: unknown) {
      return {
        success: false,
        data: null,
        message: `Failed to get git status: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
};
