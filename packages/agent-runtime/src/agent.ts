/**
 * Agent — the high-level entry point for the agent runtime.
 *
 * Creates an AgentContext from configuration, runs the loop, and
 * returns the result. This is what the CLI calls.
 */

import type { ModelGateway, ModelMessage } from "@zhcode/model-gateway";
import type { ToolRegistry, ToolContext } from "@zhcode/tools";
import type { AgentConfig } from "./config";
import { createAgentConfig } from "./config";
import { AgentContext } from "./context";
import { runAgentLoop } from "./loop";
import type { AgentRequest, AgentResponse, AgentEventHandler } from "./types";

export interface AgentOptions {
  /** The model gateway. */
  gateway: ModelGateway;
  /** The tool registry. */
  toolRegistry: ToolRegistry;
  /** The tool context for path/permission resolution. */
  toolContext: ToolContext;
  /** Configuration overrides. */
  config?: Partial<AgentConfig>;
  /** Event handler for lifecycle events. */
  onEvent?: AgentEventHandler;
}

export class Agent {
  private readonly gateway: ModelGateway;
  private readonly toolRegistry: ToolRegistry;
  private readonly toolContext: ToolContext;
  private readonly defaultConfig: AgentConfig;
  private readonly onEvent?: AgentEventHandler;

  constructor(options: AgentOptions) {
    this.gateway = options.gateway;
    this.toolRegistry = options.toolRegistry;
    this.toolContext = options.toolContext;
    this.defaultConfig = createAgentConfig(options.config);
    this.onEvent = options.onEvent;
  }

  /**
   * Run the agent with a user request.
   *
   * Creates a fresh conversation, runs the agent loop, and returns
   * the response.
   */
  async run(
    request: AgentRequest,
    conversationHistory?: ModelMessage[],
  ): Promise<AgentResponse> {
    // Build the messages array: always start with system prompt.
    const messages: ModelMessage[] = [
      { role: "system", content: this.defaultConfig.systemPrompt },
      ...(conversationHistory ?? []),
    ];

    // Add the user's message if it's not already the last message.
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== request.message) {
      messages.push({ role: "user", content: request.message });
    }

    // Create the agent context.
    const config = request.systemPrompt
      ? { ...this.defaultConfig, systemPrompt: request.systemPrompt }
      : this.defaultConfig;

    // Merge event handlers: instance handler + request-specific handler.
    const mergedHandler: AgentEventHandler | undefined = this.onEvent || request.signal
      ? (event) => {
          this.onEvent?.(event);
          // If cancelled, abort the signal.
          if (event.type === "cancelled" && request.signal) {
            request.signal.throwIfAborted();
          }
        }
      : undefined;

    const ctx = new AgentContext({
      gateway: this.gateway,
      toolRegistry: this.toolRegistry,
      toolContext: this.toolContext,
      config,
      messages,
      onEvent: mergedHandler,
      signal: request.signal,
    });

    return runAgentLoop(ctx);
  }
}
