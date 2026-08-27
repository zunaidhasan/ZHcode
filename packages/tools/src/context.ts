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

/**
 * Sensitive path patterns blocked by default.
 *
 * `.env` files hold secrets and `.git` holds repo internals; agents should not
 * read them unless explicitly allowed. Each pattern is tested against the
 * resolved absolute path.
 */
export const DEFAULT_BLOCKED_PATHS: readonly RegExp[] = [
  /(^|\/)\.env(\..*)?$/i,
  /(^|\/)\.git(\/|$)/,
];

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
  /** Extra blocked path patterns (tested against absolute paths). */
  blockedPaths?: RegExp[];
  /** Set true to disable the default sensitive-path blocking. */
  allowSensitivePaths?: boolean;
}

export class ToolContext {
  readonly projectRoot: string;
  readonly cwd: string;
  readonly permissions: ReadonlySet<PermissionLevel>;
  readonly environment: Readonly<Record<string, string>>;
  readonly logger: ToolLogger;
  private readonly blockedPaths: readonly RegExp[];

  constructor(options: ToolContextOptions) {
    // Normalize to forward slashes for cross-platform consistency.
    this.projectRoot = nodePath
      .normalize(options.projectRoot)
      .replace(/\\/g, "/");
    this.cwd = nodePath
      .normalize(options.cwd ?? options.projectRoot)
      .replace(/\\/g, "/");
    this.permissions = new Set(options.permissions ?? ["read"]);
    this.environment = Object.freeze({ ...(options.environment ?? {}) });
    this.logger = options.logger ?? silentLogger;
    this.blockedPaths = [
      ...(options.allowSensitivePaths ? [] : DEFAULT_BLOCKED_PATHS),
      ...(options.blockedPaths ?? []),
    ];
  }

  /** Check if the context has a specific permission. */
  hasPermission(level: PermissionLevel): boolean {
    return this.permissions.has(level);
  }

  /** Whether a resolved absolute path matches any blocked pattern. */
  isBlockedPath(resolvedPath: string): boolean {
    return this.blockedPaths.some((pattern) => pattern.test(resolvedPath));
  }

  /** Resolve a relative path against the project root. Resolves .. safely. */
  resolvePath(relativePath: string): string {
    const resolved = nodePath
      .resolve(this.cwd, relativePath)
      .replace(/\\/g, "/");
    // Ensure the resolved path stays within the project root.
    if (!resolved.startsWith(this.projectRoot)) {
      throw new Error(
        `Path "${relativePath}" resolves outside project root. ` +
          `Resolved: ${resolved}, Root: ${this.projectRoot}`,
      );
    }
    // Block sensitive paths (e.g. .env, .git) unless explicitly allowed.
    if (this.isBlockedPath(resolved)) {
      throw new Error(
        `Path "${relativePath}" is blocked by the permission layer. ` +
          `Sensitive paths (.env, .git) are not readable by default.`,
      );
    }
    return resolved;
  }
}
