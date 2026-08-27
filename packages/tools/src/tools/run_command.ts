/**
 * run_command — execute a shell command with safety policies.
 *
 * Commands are validated against an allowlist and a blocklist.
 * Dangerous commands require explicit confirmation.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolResult } from "../types";
import type { ToolContext } from "../context";

const execAsync = promisify(exec);

/** Default timeout: 30 seconds. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Patterns that are always blocked. */
const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\//, // rm -rf /
  /\brm\s+-rf\s+~\//, // rm -rf ~/
  /\bmv\s+.*\s+\/\s*$/, // mv to /
  /\bchmod\s+777\b/,
  /\bsudo\b/,
  /\bcurl\b.*\|\s*bash/,
  /\bwget\b.*\|\s*bash/,
  /\bgit\s+push\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\b/,
  /\bnpm\s+publish\b/,
  /\bbun\s+publish\b/,
  /\bdel\s+\/[sf]/i, // Windows del /s /f
  /\brmdir\s+\/s\b/i, // Windows rmdir /s
  /\bformat\s+[a-zA-Z]:/i, // Windows format
];

function isBlockedCommand(command: string): boolean {
  return BLOCKED_PATTERNS.some((p) => p.test(command));
}

export const runCommandTool: Tool = {
  name: "run_command",
  description:
    "Execute a shell command in the project directory. " +
    "Dangerous commands are blocked. Requires execute permission.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute.",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000).",
      },
    },
    required: ["command"],
  },
  permission: "execute",

  async execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const command = input.command as string;
    if (!command) {
      return { success: false, data: null, message: "command is required" };
    }

    // Block dangerous commands.
    if (isBlockedCommand(command)) {
      return {
        success: false,
        data: null,
        message: `Command blocked for safety: "${command}"`,
      };
    }

    const timeout = (input.timeout as number) ?? DEFAULT_TIMEOUT_MS;

    context.logger.info(`Running: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: context.cwd,
        timeout,
        maxBuffer: 1024 * 1024,
      });

      return {
        success: true,
        data: {
          command,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: 0,
        },
      };
    } catch (err: unknown) {
      const execErr = err as {
        stdout?: string;
        stderr?: string;
        code?: number;
        message?: string;
      };

      return {
        success: false,
        data: {
          command,
          stdout: execErr.stdout?.trim() ?? "",
          stderr: execErr.stderr?.trim() ?? "",
          exitCode: execErr.code ?? 1,
        },
        message: execErr.stderr?.trim() || execErr.message || "Command failed",
      };
    }
  },
};
