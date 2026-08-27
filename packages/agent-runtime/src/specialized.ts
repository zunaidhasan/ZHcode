/**
 * Specialized Agent types — the contract for all specialized agents.
 *
 * ExplorerAgent, PlannerAgent, CoderAgent, etc. all implement this
 * interface. The orchestrator treats them uniformly.
 */

import type { ModelMessage } from "@zhcode/model-gateway";
import type { PermissionLevel } from "@zhcode/tools";
import type { AgentEventHandler } from "./types";

// ---------------------------------------------------------------------------
// Specialized Agent interface
// ---------------------------------------------------------------------------

/** A specialized agent with a focused role. */
export interface SpecializedAgent {
  /** Unique identifier (e.g. "explorer", "planner"). */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** What this agent does. */
  readonly description: string;
  /** System prompt for this agent. */
  readonly systemPrompt: string;
  /** What this agent can do. */
  readonly capabilities: AgentCapability[];
  /** Permission levels this agent requires. */
  readonly toolPolicy: PermissionLevel[];
  /** Run the agent with a task. */
  run(request: AgentRunRequest): Promise<AgentRunResult>;
}

export type AgentCapability =
  | "search"
  | "read"
  | "write"
  | "edit"
  | "execute"
  | "git"
  | "analyze"
  | "plan"
  | "review";

// ---------------------------------------------------------------------------
// Agent run request/result
// ---------------------------------------------------------------------------

export interface AgentRunRequest {
  /** The task description. */
  task: string;
  /** Previous messages for context. */
  conversationHistory?: ModelMessage[];
  /** Event handler. */
  onEvent?: AgentEventHandler;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

export interface AgentRunResult {
  /** Whether the agent completed successfully. */
  success: boolean;
  /** The agent's output (structured or text). */
  output: unknown;
  /** Human-readable summary. */
  summary: string;
  /** Total iterations. */
  iterations: number;
  /** Total tool calls. */
  toolCalls: number;
  /** Error message if failed. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Investigation types (for ExplorerAgent)
// ---------------------------------------------------------------------------

export interface InvestigationResult {
  /** Summary of findings. */
  summary: string;
  /** Relevant files discovered. */
  relevantFiles: RelevantFile[];
  /** Detailed findings with evidence. */
  findings: Finding[];
  /** Dependencies discovered. */
  dependencies: string[];
  /** Areas that may have issues. */
  suspectedAreas: string[];
  /** Confidence in findings (0-1). */
  confidence: number;
  /** Suggested next steps. */
  recommendedNextSteps: string[];
}

export interface RelevantFile {
  /** File path. */
  path: string;
  /** Why this file is relevant. */
  reason: string;
}

export interface Finding {
  /** Description of the finding. */
  description: string;
  /** Evidence supporting this finding. */
  evidence: Evidence[];
}

export interface Evidence {
  /** File path. */
  file: string;
  /** Line range (e.g. "42-67" or "15"). */
  lines: string;
}
