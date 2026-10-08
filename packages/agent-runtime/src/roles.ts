/**
 * Specialized role agents — thin wrappers over the agent loop.
 *
 * Each role owns a prompt, tool policy, and typed JSON output.
 * They never import the orchestrator, router, or a concrete provider.
 */

import type {
  Diagnosis,
  ImplementationResult,
  InvestigationResult,
  Plan,
  ReviewResult,
  TestResult,
} from "@zhcode/core";
import type { ModelGateway, ModelMessage } from "@zhcode/model-gateway";
import type { PermissionLevel, ToolRegistry } from "@zhcode/tools";
import { ToolContext } from "@zhcode/tools";
import { createAgentConfig } from "./config";
import { AgentContext } from "./context";
import { extractJsonBlock } from "./json";
import { runAgentLoop } from "./loop";
import type {
  AgentCapability,
  AgentRunRequest,
  AgentRunResult,
  SpecializedAgent,
} from "./specialized";
import type { AgentEventHandler } from "./types";

export interface RoleAgentOptions {
  gateway: ModelGateway;
  toolRegistry: ToolRegistry;
  projectRoot: string;
  model?: string;
  contextText?: string;
}

const PLANNER_PROMPT = `You are ZHcode Planner. Produce an ordered task graph.

RULES:
1. Do not modify files.
2. Prefer small, independently verifiable tasks.
3. Set dependsOn to task ids that must finish first.
4. agentHint must be one of: explorer, planner, coder, tester, reviewer, debugger.

When done, output:
\`\`\`json
{
  "id": "plan-1",
  "summary": "...",
  "tasks": [
    {
      "id": "t1",
      "title": "...",
      "dependsOn": [],
      "agentHint": "coder",
      "files": [],
      "acceptance": ["..."]
    }
  ]
}
\`\`\``;

const CODER_PROMPT = `You are ZHcode Coder. Implement ONE task.

RULES:
1. Prefer edit_file over rewriting whole files.
2. Stay inside the listed files when possible.
3. Do not commit or push.
4. After edits, summarize changed files.

When done, output:
\`\`\`json
{
  "changedFiles": ["src/a.ts"],
  "summary": "...",
  "diffStat": "+n -m"
}
\`\`\``;

const TESTER_PROMPT = `You are ZHcode Tester. Run or write tests for the recent change.

When done, output:
\`\`\`json
{
  "passed": 0,
  "failed": 0,
  "output": "..."
}
\`\`\``;

const REVIEWER_PROMPT = `You are ZHcode Reviewer. Review quality, security, and architecture.

Approve only if there are no error-severity findings.

When done, output:
\`\`\`json
{
  "approved": true,
  "findings": [{ "severity": "warning", "file": "src/a.ts", "message": "..." }]
}
\`\`\``;

const DEBUGGER_PROMPT = `You are ZHcode Debugger. Diagnose a failure and propose a repair.

Do not implement the fix. Return a diagnosis.

When done, output:
\`\`\`json
{
  "cause": "...",
  "files": ["src/a.ts"],
  "repairHint": "..."
}
\`\`\``;

abstract class RoleAgent implements SpecializedAgent {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly systemPrompt: string;
  abstract readonly capabilities: AgentCapability[];
  abstract readonly toolPolicy: PermissionLevel[];

  protected readonly gateway: ModelGateway;
  protected readonly toolRegistry: ToolRegistry;
  protected readonly projectRoot: string;
  protected readonly model: string;
  protected readonly contextText?: string;

  constructor(options: RoleAgentOptions) {
    this.gateway = options.gateway;
    this.toolRegistry = options.toolRegistry;
    this.projectRoot = options.projectRoot;
    this.model = options.model ?? "";
    this.contextText = options.contextText;
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    const task = this.contextText
      ? `${request.task}\n\n## Project context\n${this.contextText}`
      : request.task;

    const messages: ModelMessage[] = [
      { role: "system", content: this.systemPrompt },
      ...(request.conversationHistory ?? []),
      { role: "user", content: task },
    ];

    const toolContext = new ToolContext({
      projectRoot: this.projectRoot,
      permissions: this.toolPolicy,
    });

    const config = createAgentConfig({
      permissions: this.toolPolicy,
      model: this.model,
      systemPrompt: this.systemPrompt,
    });

    const onEvent: AgentEventHandler | undefined = request.onEvent;

    const ctx = new AgentContext({
      gateway: this.gateway,
      toolRegistry: this.toolRegistry,
      toolContext,
      config,
      messages,
      onEvent,
      signal: request.signal,
    });

    const response = await runAgentLoop(ctx);
    const parsed = this.parse(response.content);

    return {
      success: response.status === "complete",
      output: parsed ?? response.content,
      summary: this.summarize(parsed, response.content),
      iterations: response.iterations,
      toolCalls: response.toolCalls,
      error: response.error,
    };
  }

  protected abstract parse(content: string): unknown | null;

  protected summarize(parsed: unknown, fallback: string): string {
    if (parsed && typeof parsed === "object" && "summary" in parsed) {
      const summary = (parsed as { summary?: unknown }).summary;
      if (typeof summary === "string" && summary.length > 0) return summary;
    }
    return fallback.slice(0, 500);
  }
}

export class PlannerAgent extends RoleAgent {
  readonly id = "planner";
  readonly name = "Planner Agent";
  readonly description = "Turns a task and investigation into an ordered task graph.";
  readonly systemPrompt = PLANNER_PROMPT;
  readonly capabilities: AgentCapability[] = ["plan", "analyze", "read"];
  readonly toolPolicy: PermissionLevel[] = ["read"];

  protected parse(content: string): Plan | null {
    return extractJsonBlock<Plan>(content);
  }
}

export class CoderAgent extends RoleAgent {
  readonly id = "coder";
  readonly name = "Coder Agent";
  readonly description = "Implements a single task by editing project files.";
  readonly systemPrompt = CODER_PROMPT;
  readonly capabilities: AgentCapability[] = ["read", "write", "edit", "git"];
  readonly toolPolicy: PermissionLevel[] = ["read", "write", "git"];

  protected parse(content: string): ImplementationResult | null {
    return extractJsonBlock<ImplementationResult>(content);
  }
}

export class TesterAgent extends RoleAgent {
  readonly id = "tester";
  readonly name = "Tester Agent";
  readonly description = "Writes or runs tests for recent changes.";
  readonly systemPrompt = TESTER_PROMPT;
  readonly capabilities: AgentCapability[] = ["read", "write", "edit", "execute"];
  readonly toolPolicy: PermissionLevel[] = ["read", "write", "execute"];

  protected parse(content: string): TestResult | null {
    return extractJsonBlock<TestResult>(content);
  }

  protected override summarize(parsed: unknown, fallback: string): string {
    if (parsed && typeof parsed === "object" && "output" in parsed) {
      const output = (parsed as TestResult).output;
      if (typeof output === "string" && output.length > 0) return output;
    }
    return super.summarize(parsed, fallback);
  }
}

export class ReviewerAgent extends RoleAgent {
  readonly id = "reviewer";
  readonly name = "Reviewer Agent";
  readonly description = "Reviews quality, security, and architecture of a change.";
  readonly systemPrompt = REVIEWER_PROMPT;
  readonly capabilities: AgentCapability[] = ["read", "analyze", "review"];
  readonly toolPolicy: PermissionLevel[] = ["read", "git"];

  protected parse(content: string): ReviewResult | null {
    return extractJsonBlock<ReviewResult>(content);
  }

  protected override summarize(parsed: unknown, fallback: string): string {
    if (parsed && typeof parsed === "object" && "approved" in parsed) {
      const review = parsed as ReviewResult;
      return review.approved
        ? "approved"
        : `rejected: ${review.findings.map((f) => f.message).join("; ")}`;
    }
    return super.summarize(parsed, fallback);
  }
}

export class DebuggerAgent extends RoleAgent {
  readonly id = "debugger";
  readonly name = "Debugger Agent";
  readonly description = "Diagnoses failing tests or reviews and proposes a repair.";
  readonly systemPrompt = DEBUGGER_PROMPT;
  readonly capabilities: AgentCapability[] = ["read", "analyze", "execute"];
  readonly toolPolicy: PermissionLevel[] = ["read", "execute"];

  protected parse(content: string): Diagnosis | null {
    return extractJsonBlock<Diagnosis>(content);
  }

  protected override summarize(parsed: unknown, fallback: string): string {
    if (parsed && typeof parsed === "object" && "cause" in parsed) {
      return (parsed as Diagnosis).cause;
    }
    return super.summarize(parsed, fallback);
  }
}

export function isInvestigationResult(value: unknown): value is InvestigationResult {
  return (
    !!value &&
    typeof value === "object" &&
    "summary" in value &&
    "relevantFiles" in value
  );
}

export function isPlan(value: unknown): value is Plan {
  return !!value && typeof value === "object" && "tasks" in value && Array.isArray((value as Plan).tasks);
}

export function isImplementationResult(value: unknown): value is ImplementationResult {
  return (
    !!value &&
    typeof value === "object" &&
    "changedFiles" in value &&
    Array.isArray((value as ImplementationResult).changedFiles)
  );
}

export function isTestResult(value: unknown): value is TestResult {
  return !!value && typeof value === "object" && "passed" in value && "failed" in value;
}

export function isReviewResult(value: unknown): value is ReviewResult {
  return !!value && typeof value === "object" && "approved" in value && "findings" in value;
}

export function isDiagnosis(value: unknown): value is Diagnosis {
  return !!value && typeof value === "object" && "cause" in value && "repairHint" in value;
}
