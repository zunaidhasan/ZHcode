/**
 * Pipeline types — the typed contracts between orchestrator, agents,
 * router, and verification. Live in `@zhcode/core` so every package
 * shares a single definition without importing orchestrator or agents.
 */

import type { ModelUsage } from "./models";

// ---------------------------------------------------------------------------
// Model classes & cost
// ---------------------------------------------------------------------------

/** Coarse model classes the router selects from. */
export type ModelClass = "cheap" | "balanced" | "strong" | "reasoning";

/** Task classes used by the model router. */
export type TaskClass =
  | "explore"
  | "plan"
  | "code"
  | "test"
  | "review"
  | "debug"
  | "verify"
  | "general";

export interface ModelPrice {
  /** USD per 1M input tokens. */
  inputPerMillion: number;
  /** USD per 1M output tokens. */
  outputPerMillion: number;
}

/** Conservative public list prices. Unknown models use `DEFAULT_UNKNOWN_PRICE`. */
export const DEFAULT_MODEL_PRICES: Record<string, ModelPrice> = {
  "deepseek-chat": { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  "deepseek-reasoner": { inputPerMillion: 0.55, outputPerMillion: 2.19 },
  "deepseek/deepseek-chat": { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  "anthropic/claude-3-haiku": { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  "mock-model": { inputPerMillion: 0, outputPerMillion: 0 },
};

export const DEFAULT_UNKNOWN_PRICE: ModelPrice = {
  inputPerMillion: 1.0,
  outputPerMillion: 3.0,
};

export function estimateUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = DEFAULT_MODEL_PRICES[model] ?? DEFAULT_UNKNOWN_PRICE;
  return (
    (promptTokens / 1_000_000) * price.inputPerMillion +
    (completionTokens / 1_000_000) * price.outputPerMillion
  );
}

export interface CostByModel {
  tokensIn: number;
  tokensOut: number;
  estimatedUsd: number;
  calls: number;
}

export interface CostLedger {
  tokensIn: number;
  tokensOut: number;
  estimatedUsd: number;
  byModel: Record<string, CostByModel>;
}

export function createCostLedger(): CostLedger {
  return { tokensIn: 0, tokensOut: 0, estimatedUsd: 0, byModel: {} };
}

export function recordUsage(
  ledger: CostLedger,
  model: string,
  usage: ModelUsage,
): void {
  const usd = estimateUsd(model, usage.promptTokens, usage.completionTokens);
  ledger.tokensIn += usage.promptTokens;
  ledger.tokensOut += usage.completionTokens;
  ledger.estimatedUsd += usd;

  const existing = ledger.byModel[model];
  if (existing) {
    existing.tokensIn += usage.promptTokens;
    existing.tokensOut += usage.completionTokens;
    existing.estimatedUsd += usd;
    existing.calls += 1;
  } else {
    ledger.byModel[model] = {
      tokensIn: usage.promptTokens,
      tokensOut: usage.completionTokens,
      estimatedUsd: usd,
      calls: 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Agent identifiers
// ---------------------------------------------------------------------------

export type AgentId =
  | "explorer"
  | "planner"
  | "coder"
  | "tester"
  | "reviewer"
  | "debugger";

export type TaskStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "skipped";

export type RunStatus =
  | "pending"
  | "exploring"
  | "planning"
  | "implementing"
  | "testing"
  | "reviewing"
  | "verifying"
  | "repairing"
  | "complete"
  | "failed"
  | "cancelled";

// ---------------------------------------------------------------------------
// Agent typed I/O
// ---------------------------------------------------------------------------

export interface RelevantFile {
  path: string;
  reason: string;
}

export interface Evidence {
  file: string;
  lines: string;
}

export interface Finding {
  description: string;
  evidence: Evidence[];
}

export interface InvestigationResult {
  summary: string;
  relevantFiles: RelevantFile[];
  findings: Finding[];
  dependencies: string[];
  suspectedAreas: string[];
  confidence: number;
  recommendedNextSteps: string[];
}

export interface TaskNode {
  id: string;
  title: string;
  dependsOn: string[];
  agentHint: AgentId;
  files: string[];
  acceptance: string[];
}

export interface Plan {
  id: string;
  summary: string;
  tasks: TaskNode[];
}

export interface ImplementationTask {
  task: string;
  investigation?: InvestigationResult;
  files: string[];
  acceptance?: string[];
}

export interface ImplementationResult {
  changedFiles: string[];
  summary: string;
  diffStat: string;
}

export interface TestCaseResult {
  name: string;
  passed: boolean;
  output?: string;
}

export interface TestResult {
  passed: number;
  failed: number;
  output: string;
  cases?: TestCaseResult[];
}

export type ReviewSeverity = "info" | "warning" | "error";

export interface ReviewFinding {
  severity: ReviewSeverity;
  file: string;
  message: string;
}

export interface ReviewResult {
  approved: boolean;
  findings: ReviewFinding[];
}

export interface Diagnosis {
  cause: string;
  files: string[];
  repairHint: string;
}

export interface VerificationCheck {
  name: string;
  ok: boolean;
  output: string;
}

export interface VerificationResult {
  ok: boolean;
  checks: VerificationCheck[];
}

// ---------------------------------------------------------------------------
// Run state
// ---------------------------------------------------------------------------

export interface RunArtifacts {
  changedFiles: string[];
  testOutput?: string;
  review?: ReviewResult;
  verification?: VerificationResult;
  diagnosis?: Diagnosis;
}

export interface RunState {
  runId: string;
  task: string;
  status: RunStatus;
  investigation?: InvestigationResult;
  plan?: Plan;
  taskStates: Record<string, TaskStatus>;
  artifacts: RunArtifacts;
  cost: CostLedger;
  error?: string;
  repairAttempts: number;
  startedAt: number;
  finishedAt?: number;
}

function generateRunId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `run-${Date.now().toString(36)}-${rand}`;
}

export function createRunState(task: string, runId?: string): RunState {
  return {
    runId: runId ?? generateRunId(),
    task,
    status: "pending",
    taskStates: {},
    artifacts: { changedFiles: [] },
    cost: createCostLedger(),
    repairAttempts: 0,
    startedAt: Date.now(),
  };
}
