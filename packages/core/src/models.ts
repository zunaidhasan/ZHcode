/**
 * Model provider types — the canonical contract between ZHcode and any LLM.
 *
 * These live in `@zhcode/core` so every package (model-gateway, agent-runtime,
 * tools, CLI) shares a single definition. Adding a new provider backend must
 * never require changes here.
 */

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * A single message in a conversation.
 *
 * `ChatMessage` is the canonical name; `ModelMessage` is kept as an alias for
 * backwards compatibility with code written against `@zhcode/model-gateway`.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** @deprecated Use `ChatMessage`. */
export type ModelMessage = ChatMessage;

// ---------------------------------------------------------------------------
// Request / Response
// ---------------------------------------------------------------------------

/** A request sent to a model provider. */
export interface ModelRequest {
  /** The conversation so far. */
  messages: ChatMessage[];
  /** Model identifier (provider-specific, e.g. "deepseek-chat"). */
  model: string;
  /** Max tokens to generate (optional — provider default applies). */
  maxTokens?: number;
  /** Sampling temperature (0–2). */
  temperature?: number;
  /** If true, the response should stream. */
  stream?: boolean;
  /** JSON-schema tool definitions for native tool calling. */
  tools?: ModelToolDefinition[];
}

/** A tool definition advertised to a provider that supports native tool calling. */
export interface ModelToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
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
  /** Native provider tool calls, when the model requested tools. */
  toolCalls?: ModelToolCall[];
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

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * ModelProvider — the interface every LLM adapter must implement.
 *
 * The gateway orchestrates providers through this contract, so adding a new
 * backend (DeepSeek, Gemini, Kimi, NVIDIA, etc.) is just a new file that
 * implements `ModelProvider`.
 */
export interface ModelProvider {
  /** Human-readable provider name (e.g. "openrouter", "mock", "deepseek"). */
  readonly name: string;

  /** What this provider supports. */
  info(): ProviderInfo;

  /**
   * Generate a complete (non-streaming) response.
   * Throw a `ModelGatewayError` subclass on failure.
   */
  generate(request: ModelRequest): Promise<ModelResponse>;

  /**
   * Generate a streaming response.
   * Yields `ModelStreamChunk` values; the last chunk has `done: true`.
   * Throw a `ModelGatewayError` subclass on failure.
   */
  stream(request: ModelRequest): AsyncIterable<ModelStreamChunk>;
}
