// Agent Runtime — Phase 4+.
// Agent loop, system prompts, iteration control, and specialized agents.

// Core types
export type {
  AgentState,
  AgentEvent,
  AgentRequest,
  AgentResponse,
  AgentEventHandler,
} from "./types";

// Config
export { createAgentConfig, type AgentConfig } from "./config";

// Context
export { AgentContext, type AgentContextOptions } from "./context";

// Agent loop
export { runAgentLoop, parseToolCalls, type ParsedToolCall } from "./loop";

// Agent class
export { Agent, type AgentOptions } from "./agent";

// Specialized agents
export type {
  SpecializedAgent,
  AgentCapability,
  AgentRunRequest,
  AgentRunResult,
  InvestigationResult,
  RelevantFile,
  Finding,
  Evidence,
} from "./specialized";

// Explorer Agent
export {
  ExplorerAgent,
  type ExplorerAgentOptions,
  type ExplorerConfig,
} from "./explorer";
