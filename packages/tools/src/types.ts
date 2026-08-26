/**
 * Core types for the ZHcode Tool System.
 *
 * Every tool implements the Tool interface. The agent runtime only
 * interacts with tools through these abstractions.
 */

import type { ToolContext } from "./context";

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

/** A tool the agent can invoke. */
export interface Tool {
  /** Unique name (e.g. "read_file", "list_files"). */
  name: string;
  /** Human-readable description shown to the model. */
  description: string;
  /** JSON Schema for the input parameters. */
  inputSchema: Record<string, unknown>;
  /** Permission level required to use this tool. */
  permission: PermissionLevel;
  /** Execute the tool with validated input. */
  execute(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

// ---------------------------------------------------------------------------
// Tool result
// ---------------------------------------------------------------------------

/** What every tool returns. */
export interface ToolResult {
  /** Whether the tool succeeded. */
  success: boolean;
  /** The structured output data. */
  data: unknown;
  /** Human-readable message (error description or summary). */
  message?: string;
}

// ---------------------------------------------------------------------------
// Permission levels
// ---------------------------------------------------------------------------

export type PermissionLevel = "read" | "write" | "execute" | "network" | "git";

// ---------------------------------------------------------------------------
// Tool error
// ---------------------------------------------------------------------------

export class ToolError extends Error {
  constructor(
    public readonly toolName: string,
    message: string,
    public readonly code: ToolErrorCode = "EXECUTION_ERROR",
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export type ToolErrorCode =
  | "EXECUTION_ERROR"
  | "FILE_NOT_FOUND"
  | "FILE_EXISTS"
  | "PATH_RESTRICTED"
  | "PERMISSION_DENIED"
  | "INPUT_INVALID"
  | "COMMAND_BLOCKED"
  | "BINARY_REJECTED"
  | "FILE_TOO_LARGE"
  | "AMBIGUOUS_MATCH"
  | "TEXT_NOT_FOUND";
