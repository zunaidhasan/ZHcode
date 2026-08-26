/**
 * ToolContext — the controlled environment every tool receives.
 *
 * This isolates tools from the host system and prepares for future
 * multi-worktree parallel agents.
 */

import * as nodePath from "node:path";
import type { PermissionLevel } from "./types";

/** Logger interface for tool execution feedback. */
export interface ToolLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** Default silent logger. */
const silentLogger: ToolLogger = {
  info() {},
  warn() {},
  error() {},
};

export interface ToolContextOptions {
  /** Absolute path to the project root. All file paths are relative to this. */
  projectRoot: string;
  /** Current working directory (defaults to projectRoot). */
  cwd?: string;
  /** Permission levels the agent has (default: all read). */
  permissions?: PermissionLevel[];
  /** Environment variables (subset to expose). */
  environment?: Record<string, string>;
  /** Logger for tool output. */
  logger?: ToolLogger;
}

export class ToolContext {
  readonly projectRoot: string;
  readonly cwd: string;
  readonly permissions: ReadonlySet<PermissionLevel>;
  readonly environment: Readonly<Record<string, string>>;
  readonly logger: ToolLogger;

  constructor(options: ToolContextOptions) {
    // Normalize to forward slashes for cross-platform consistency.
    this.projectRoot = nodePath.normalize(options.projectRoot).replace(/\\/g, "/");
    this.cwd = nodePath.normalize(options.cwd ?? options.projectRoot).replace(/\\/g, "/");
    this.permissions = new Set(options.permissions ?? ["read"]);
    this.environment = Object.freeze({ ...(options.environment ?? {}) });
    this.logger = options.logger ?? silentLogger;
  }

  /** Check if the context has a specific permission. */
  hasPermission(level: PermissionLevel): boolean {
    return this.permissions.has(level);
  }

  /** Resolve a relative path against the project root. Resolves .. safely. */
  resolvePath(relativePath: string): string {
    const resolved = nodePath.resolve(this.cwd, relativePath).replace(/\\/g, "/");
    // Ensure the resolved path stays within the project root.
    if (!resolved.startsWith(this.projectRoot)) {
      throw new Error(
        `Path "${relativePath}" resolves outside project root. ` +
        `Resolved: ${resolved}, Root: ${this.projectRoot}`,
      );
    }
    return resolved;
  }
}
