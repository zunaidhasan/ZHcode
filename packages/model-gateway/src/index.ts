// Model Gateway — Phase 2.
// Provider adapters, streaming and tool-call interfaces.

// Core types
export type {
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ModelToolCall,
  ModelUsage,
  ModelCapabilities,
  ProviderInfo,
} from "./types";

// Errors
export {
  ModelGatewayError,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  NetworkError,
  InvalidResponseError,
  ProviderUnavailableError,
} from "./errors";

// Provider interface
export type { ModelProvider } from "./provider";

// Gateway orchestrator
export { ModelGateway, type GatewayConfig } from "./gateway";

// Providers
export { MockProvider, type MockProviderOptions } from "./mock";
export {
  OpenRouterProvider,
  type OpenRouterConfig,
} from "./openrouter";
