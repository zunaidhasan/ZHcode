/**
 * PermissionManager — controls which tools an agent can use.
 *
 * Provides a clean API for granting/revoking permission levels
 * and checking if a specific tool is allowed.
 */

import type { PermissionLevel } from "./types";
import { ToolContext } from "./context";
import type { ToolRegistry } from "./registry";

/** Preset permission profiles. */
export const PermissionProfiles = {
  /** Read-only: list, read, search. No writes, no commands, no git. */
  readOnly: ["read"] as PermissionLevel[],

  /** Safe: read + limited commands (test, build, git status). */
  safe: ["read", "execute", "git"] as PermissionLevel[],

  /** Full: all permissions. */
  full: ["read", "write", "execute", "network", "git"] as PermissionLevel[],
} as const;

export interface PermissionManagerOptions {
  /** Permission levels to start with (default: readOnly). */
  initialPermissions?: PermissionLevel[];
  /** Project root for context creation. */
  projectRoot: string;
  /** Current working directory. */
  cwd?: string;
}

export class PermissionManager {
  private permissions: Set<PermissionLevel>;

  constructor(options: PermissionManagerOptions) {
    this.permissions = new Set(
      options.initialPermissions ?? [...PermissionProfiles.readOnly],
    );
  }

  /** Grant a permission level. */
  grant(level: PermissionLevel): void {
    this.permissions.add(level);
  }

  /** Revoke a permission level. */
  revoke(level: PermissionLevel): void {
    this.permissions.delete(level);
  }

  /** Check if a permission level is granted. */
  has(level: PermissionLevel): boolean {
    return this.permissions.has(level);
  }

  /** Get all granted permissions. */
  list(): PermissionLevel[] {
    return [...this.permissions];
  }

  /** Create a ToolContext with the current permissions. */
  createContext(options: { projectRoot: string; cwd?: string }): ToolContext {
    return new ToolContext({
      ...options,
      permissions: [...this.permissions],
    });
  }

  /** Check if a specific tool (from registry) can be executed. */
  canExecute(toolName: string, registry: ToolRegistry): boolean {
    const tool = registry.get(toolName);
    if (!tool) return false;
    return this.permissions.has(tool.permission);
  }
}
