/**
 * ModelProvider — the interface every LLM adapter must implement.
 *
 * The gateway orchestrates providers through this contract, so adding
 * a new backend (Gemini, Kimi, NVIDIA, etc.) is just a new file that
 * implements ModelProvider.
 */

import type {
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ProviderInfo,
} from "./types";

export interface ModelProvider {
  /** Human-readable provider name (e.g. "openrouter", "mock"). */
  readonly name: string;

  /** What this provider supports. */
  info(): ProviderInfo;

  /**
   * Generate a complete (non-streaming) response.
   * Throw a ModelGatewayError subclass on failure.
   */
  generate(request: ModelRequest): Promise<ModelResponse>;

  /**
   * Generate a streaming response.
   * Yields ModelStreamChunk values; the last chunk has `done: true`.
   * Throw a ModelGatewayError subclass on failure.
   */
  stream(
    request: ModelRequest,
  ): AsyncIterable<ModelStreamChunk>;
}
