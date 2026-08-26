/**
 * ToolRegistry — manages available tools.
 *
 * Handles registration, lookup, and execution of tools.
 * The agent runtime uses this as its sole interface to the tool system.
 */

import type { Tool, ToolResult } from "./types";
import { ToolError } from "./types";
import type { ToolContext } from "./context";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  /** Register a tool. Throws if the name is already taken. */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new ToolError(
        tool.name,
        `Tool "${tool.name}" is already registered.`,
        "EXECUTION_ERROR",
      );
    }
    this.tools.set(tool.name, tool);
  }

  /** Unregister a tool by name. Returns true if it was registered. */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /** Get a tool by name, or undefined. */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** Check if a tool is registered. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** List all registered tool names. */
  list(): string[] {
    return [...this.tools.keys()];
  }

  /** List all registered tools with their metadata. */
  listTools(): Array<{ name: string; description: string; permission: string }> {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      permission: t.permission,
    }));
  }

  /** Execute a tool by name. Validates input, checks permissions, runs. */
  async execute(
    name: string,
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        data: null,
        message: `Unknown tool: "${name}". Available: ${this.list().join(", ")}`,
      };
    }

    // Permission check.
    if (!context.hasPermission(tool.permission)) {
      return {
        success: false,
        data: null,
        message: `Permission denied. Tool "${name}" requires "${tool.permission}" permission.`,
      };
    }

    try {
      return await tool.execute(input, context);
    } catch (err: unknown) {
      if (err instanceof ToolError) {
        return {
          success: false,
          data: null,
          message: err.message,
        };
      }
      return {
        success: false,
        data: null,
        message: `Tool "${name}" failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
