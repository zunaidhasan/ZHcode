/**
 * Core types for the ZHcode Agent Runtime.
 *
 * These types define the agent's lifecycle, events, and communication
 * contracts. The agent runtime emits events; the CLI renders them.
 */

import type { ModelMessage, ModelResponse } from "@zhcode/model-gateway";
import type { ToolResult } from "@zhcode/tools";

// ---------------------------------------------------------------------------
// Agent state
// ---------------------------------------------------------------------------

export type AgentState =
  | "idle"
  | "thinking"
  | "tool_calling"
  | "responding"
  | "complete"
  | "error"
  | "cancelled";

// ---------------------------------------------------------------------------
// Agent events (for CLI rendering and future GUI/web)
// ---------------------------------------------------------------------------

export type AgentEvent =
  | { type: "thinking"; message?: string }
  | { type: "model_start"; model: string }
  | { type: "model_delta"; delta: string }
  | { type: "model_end"; response: ModelResponse }
  | { type: "tool_start"; toolName: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolName: string; result: ToolResult }
  | { type: "tool_error"; toolName: string; error: string }
  | { type: "iteration"; current: number; max: number }
  | { type: "error"; message: string; code?: string }
  | { type: "cancelled"; reason?: string }
  | {
      type: "complete";
      response: string;
      iterations: number;
      toolCalls: number;
    };

// ---------------------------------------------------------------------------
// Agent request / response
// ---------------------------------------------------------------------------

/** What the user sends to the agent. */
export interface AgentRequest {
  /** The user's message. */
  message: string;
  /** Optional system prompt override. */
  systemPrompt?: string;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

/** What the agent returns after completing. */
export interface AgentResponse {
  /** The final text response. */
  content: string;
  /** How the agent finished. */
  status:
    "complete" | "error" | "cancelled" | "max_iterations" | "max_tool_calls";
  /** Total iterations of the model loop. */
  iterations: number;
  /** Total tool calls executed. */
  toolCalls: number;
  /** Error message if status is error. */
  error?: string;
  /** All messages in the conversation. */
  messages: ModelMessage[];
}

// ---------------------------------------------------------------------------
// Agent event handler
// ---------------------------------------------------------------------------

/** Callback for agent events. */
export type AgentEventHandler = (event: AgentEvent) => void;
