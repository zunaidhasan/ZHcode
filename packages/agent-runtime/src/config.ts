/**
 * Agent configuration.
 *
 * Controls iteration limits, timeouts, and permission profiles.
 * All values have sensible defaults — create an AgentConfig only
 * when you need to override.
 */

import type { PermissionLevel } from "@zhcode/tools";

export interface AgentConfig {
  /** Max loop iterations (default: 20). Prevents infinite loops. */
  maxIterations: number;
  /** Max tool calls total (default: 50). */
  maxToolCalls: number;
  /** Max total execution time in ms (default: 5 minutes). */
  maxExecutionTimeMs: number;
  /** Permission levels for tools (default: full). */
  permissions: PermissionLevel[];
  /** System prompt prepended to every conversation. */
  systemPrompt: string;
  /** Model to use (empty = provider default). */
  model: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are ZHcode, a helpful AI coding assistant.

You have access to tools that let you explore and modify the user's project.
Use tools when you need to look at files, search code, or make changes.

Be concise and helpful. When using tools, explain what you're doing.`;

/** Create a config with defaults, overridden by partial values. */
export function createAgentConfig(
  partial?: Partial<AgentConfig>,
): AgentConfig {
  return {
    maxIterations: partial?.maxIterations ?? 20,
    maxToolCalls: partial?.maxToolCalls ?? 50,
    maxExecutionTimeMs: partial?.maxExecutionTimeMs ?? 5 * 60 * 1000,
    permissions: partial?.permissions ?? ["read", "write", "execute", "git"],
    systemPrompt: partial?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    model: partial?.model ?? "",
  };
}
