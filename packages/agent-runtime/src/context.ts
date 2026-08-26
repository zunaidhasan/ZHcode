/**
 * AgentContext — the controlled environment for a single agent run.
 *
 * Bundles the model gateway, tool registry, tool context, and
 * conversation state. Designed so future multi-agent systems can
 * give each agent its own isolated context.
 */

import type { ModelGateway } from "@zhcode/model-gateway";
import type { ModelMessage } from "@zhcode/model-gateway";
import type { ToolRegistry, ToolContext } from "@zhcode/tools";
import type { AgentConfig } from "./config";
import type { AgentEvent, AgentEventHandler } from "./types";

export interface AgentContextOptions {
  /** The model gateway to use. */
  gateway: ModelGateway;
  /** The tool registry to use. */
  toolRegistry: ToolRegistry;
  /** The tool context for path/permission resolution. */
  toolContext: ToolContext;
  /** Agent configuration. */
  config: AgentConfig;
  /** Conversation history (starts with system prompt). */
  messages: ModelMessage[];
  /** Event handler for agent lifecycle events. */
  onEvent?: AgentEventHandler;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

export class AgentContext {
  readonly gateway: ModelGateway;
  readonly toolRegistry: ToolRegistry;
  readonly toolContext: ToolContext;
  readonly config: AgentConfig;
  readonly messages: ModelMessage[];
  readonly onEvent?: AgentEventHandler;
  readonly signal?: AbortSignal;

  /** Runtime counters (mutated during the loop). */
  iterations = 0;
  toolCallCount = 0;
  startTime = Date.now();

  constructor(options: AgentContextOptions) {
    this.gateway = options.gateway;
    this.toolRegistry = options.toolRegistry;
    this.toolContext = options.toolContext;
    this.config = options.config;
    this.messages = options.messages;
    this.onEvent = options.onEvent;
    this.signal = options.signal;
  }

  /** Emit an event to the handler. */
  emit(event: AgentEvent): void {
    this.onEvent?.(event);
  }

  /** Check if the agent should stop (cancelled or limits exceeded). */
  shouldStop(): { stop: boolean; reason?: string } {
    // Cancellation.
    if (this.signal?.aborted) {
      return { stop: true, reason: "cancelled" };
    }

    // Iteration limit.
    if (this.iterations >= this.config.maxIterations) {
      return {
        stop: true,
        reason: `Maximum iteration limit reached (${this.config.maxIterations}).`,
      };
    }

    // Tool call limit.
    if (this.toolCallCount >= this.config.maxToolCalls) {
      return {
        stop: true,
        reason: `Maximum tool call limit reached (${this.config.maxToolCalls}).`,
      };
    }

    // Time limit.
    const elapsed = Date.now() - this.startTime;
    if (elapsed >= this.config.maxExecutionTimeMs) {
      return {
        stop: true,
        reason: `Execution time limit reached (${Math.round(elapsed / 1000)}s).`,
      };
    }

    return { stop: false };
  }

  /** Append a message to the conversation. */
  addMessage(role: "system" | "user" | "assistant", content: string): void {
    this.messages.push({ role, content });
  }
}
