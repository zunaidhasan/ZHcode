/**
 * ModelProvider — the interface every LLM adapter must implement.
 *
 * The canonical interface lives in `@zhcode/core`. This module re-exports it
 * so that existing `import { type ModelProvider } from "@zhcode/model-gateway"`
 * calls keep working.
 */

export type { ModelProvider } from "@zhcode/core";
