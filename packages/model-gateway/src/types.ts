/**
 * Provider-independent types for the ZHcode Model Gateway.
 *
 * These types form the contract between the CLI / agent runtime and
 * any concrete model provider. Adding a new provider should never
 * require changes here.
 */

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** A single message in a conversation. */
export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Request / Response
// ---------------------------------------------------------------------------

/** A request sent to a model provider. */
export interface ModelRequest {
  /** The conversation so far. */
  messages: ModelMessage[];
  /** Model identifier (provider-specific, e.g. "deepseek/deepseek-chat"). */
  model: string;
  /** Max tokens to generate (optional — provider default applies). */
  maxTokens?: number;
  /** Sampling temperature (0–2). */
  temperature?: number;
  /** If true, the response should stream. */
  stream?: boolean;
}

/** A complete (non-streaming) response from a model. */
export interface ModelResponse {
  /** The generated content. */
  content: string;
  /** Which model actually served the request. */
  model: string;
  /** Token usage breakdown. */
  usage: ModelUsage;
  /** Why the model stopped generating. */
  finishReason: "stop" | "length" | "tool_calls" | "content_filter" | "error";
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

/** A single chunk in a streaming response. */
export interface ModelStreamChunk {
  /** The text delta for this chunk (empty on tool-call-only chunks). */
  delta: string;
  /** Whether this is the final chunk. */
  done: boolean;
  /** Token usage — only populated on the final chunk. */
  usage?: ModelUsage;
  /** Finish reason — only populated on the final chunk. */
  finishReason?: ModelResponse["finishReason"];
}

// ---------------------------------------------------------------------------
// Tool Calling (future — defined now for forward compatibility)
// ---------------------------------------------------------------------------

/** A tool call requested by the model. */
export interface ModelToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

// ---------------------------------------------------------------------------
// Usage & Capabilities
// ---------------------------------------------------------------------------

/** Token usage information. */
export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** What a provider / model supports. */
export interface ModelCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  maxContextTokens: number;
}

// ---------------------------------------------------------------------------
// Provider metadata
// ---------------------------------------------------------------------------

export interface ProviderInfo {
  name: string;
  models: string[];
  capabilities: ModelCapabilities;
}
