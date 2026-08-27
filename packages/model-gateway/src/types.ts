/**
 * Provider-independent types for the ZHcode Model Gateway.
 *
 * The canonical definitions live in `@zhcode/core` (see `packages/core/src/models.ts`).
 * This file re-exports them so existing imports from `@zhcode/model-gateway`
 * keep working unchanged.
 */

export type {
  ChatMessage,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ModelToolCall,
  ModelUsage,
  ModelCapabilities,
  ProviderInfo,
} from "@zhcode/core";
