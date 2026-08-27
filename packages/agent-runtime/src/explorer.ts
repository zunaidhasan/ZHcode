/**
 * ExplorerAgent — the first specialized agent.
 *
 * Investigates the codebase and produces structured findings.
 * Read-only: never modifies files. Uses the Agent Runtime loop
 * with a specific system prompt and tool policy.
 */

import type { ModelGateway, ModelMessage } from "@zhcode/model-gateway";
import type { ToolRegistry, PermissionLevel } from "@zhcode/tools";
import { ToolContext } from "@zhcode/tools";
import type { AgentConfig } from "./config";
import { createAgentConfig } from "./config";
import { AgentContext } from "./context";
import { runAgentLoop } from "./loop";
import type {
  SpecializedAgent,
  AgentRunRequest,
  AgentRunResult,
  InvestigationResult,
  AgentCapability,
} from "./specialized";
import type { AgentEventHandler, AgentEvent } from "./types";

// ---------------------------------------------------------------------------
// Explorer configuration
// ---------------------------------------------------------------------------

export interface ExplorerConfig {
  /** Max loop iterations (default: 15). */
  maxIterations: number;
  /** Max tool calls total (default: 30). */
  maxToolCalls: number;
  /** Max files to read (default: 10). */
  maxFiles: number;
  /** Max total execution time in ms (default: 2 minutes). */
  maxExecutionTimeMs: number;
  /** Model to use (empty = provider default). */
  model: string;
}

const DEFAULT_EXPLORER_CONFIG: ExplorerConfig = {
  maxIterations: 15,
  maxToolCalls: 30,
  maxFiles: 10,
  maxExecutionTimeMs: 2 * 60 * 1000,
  model: "",
};

// ---------------------------------------------------------------------------
// Explorer system prompt
// ---------------------------------------------------------------------------

const EXPLORER_SYSTEM_PROMPT = `You are ZHcode Explorer, a read-only investigation agent.

Your role: Investigate the codebase and produce factual findings for another agent.

RULES:
1. DO NOT modify any files. You are read-only.
2. DO NOT execute arbitrary commands.
3. Prefer evidence over assumptions.
4. Cite relevant files and line ranges where possible.
5. Stop when sufficient evidence exists.
6. Return structured findings in the required format.

BEHAVIOR:
1. Understand the task
2. Search broadly for relevant files
3. Identify the most important files
4. Read those files carefully
5. Follow references when useful (imports, function calls)
6. Read more if needed
7. When you have enough evidence, produce your final answer

When you have completed your investigation, output your findings as a JSON block:
\`\`\`json
{
  "summary": "Brief summary of findings",
  "relevantFiles": [{ "path": "...", "reason": "..." }],
  "findings": [{ "description": "...", "evidence": [{ "file": "...", "lines": "..." }] }],
  "dependencies": ["..."],
  "suspectedAreas": ["..."],
  "confidence": 0.85,
  "recommendedNextSteps": ["..."]
}
\`\`\`

Be thorough but efficient. Do not explore files that are clearly irrelevant.`;

// ---------------------------------------------------------------------------
// ExplorerAgent
// ---------------------------------------------------------------------------

export interface ExplorerAgentOptions {
  /** The model gateway. */
  gateway: ModelGateway;
  /** The tool registry (should include search/read tools). */
  toolRegistry: ToolRegistry;
  /** Project root for tool context. */
  projectRoot: string;
  /** Configuration overrides. */
  config?: Partial<ExplorerConfig>;
}

export class ExplorerAgent implements SpecializedAgent {
  readonly id = "explorer";
  readonly name = "Explorer Agent";
  readonly description =
    "Investigates the codebase and produces structured findings. Read-only.";
  readonly systemPrompt = EXPLORER_SYSTEM_PROMPT;
  readonly capabilities: AgentCapability[] = ["search", "read", "analyze"];
  readonly toolPolicy: PermissionLevel[] = ["read"];

  private readonly gateway: ModelGateway;
  private readonly toolRegistry: ToolRegistry;
  private readonly projectRoot: string;
  private readonly config: ExplorerConfig;

  constructor(options: ExplorerAgentOptions) {
    this.gateway = options.gateway;
    this.toolRegistry = options.toolRegistry;
    this.projectRoot = options.projectRoot;
    this.config = { ...DEFAULT_EXPLORER_CONFIG, ...options.config };
  }

  /** Run the explorer agent. */
  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    // Build messages.
    const messages: ModelMessage[] = [
      { role: "system", content: this.systemPrompt },
      ...(request.conversationHistory ?? []),
      { role: "user", content: request.task },
    ];

    // Create tool context with read-only permissions.
    const toolContext = new ToolContext({
      projectRoot: this.projectRoot,
      permissions: ["read"],
    });

    // Create agent config.
    const agentConfig: AgentConfig = createAgentConfig({
      maxIterations: this.config.maxIterations,
      maxToolCalls: this.config.maxToolCalls,
      maxExecutionTimeMs: this.config.maxExecutionTimeMs,
      permissions: ["read"],
      model: this.config.model,
      systemPrompt: this.systemPrompt,
    });

    // Wrap the event handler to add explorer-specific events.
    const wrappedHandler: AgentEventHandler | undefined = request.onEvent
      ? (event: AgentEvent) => {
          // Add explorer prefix to tool events.
          if (event.type === "tool_start") {
            request.onEvent!({
              type: "tool_start",
              toolName: `[Explorer] ${event.toolName}`,
              input: event.input,
            });
          } else if (event.type === "tool_result") {
            request.onEvent!({
              type: "tool_result",
              toolName: `[Explorer] ${event.toolName}`,
              result: event.result,
            });
          } else {
            request.onEvent!(event);
          }
        }
      : undefined;

    // Create agent context and run the loop.
    const ctx = new AgentContext({
      gateway: this.gateway,
      toolRegistry: this.toolRegistry,
      toolContext,
      config: agentConfig,
      messages,
      onEvent: wrappedHandler,
      signal: request.signal,
    });

    const agentResponse = await runAgentLoop(ctx);

    // Parse the investigation result from the response.
    const investigation = this.parseInvestigation(agentResponse.content);

    return {
      success: agentResponse.status === "complete",
      output: investigation ?? agentResponse.content,
      summary: investigation?.summary ?? agentResponse.content,
      iterations: agentResponse.iterations,
      toolCalls: agentResponse.toolCalls,
      error: agentResponse.error,
    };
  }

  /** Parse the structured investigation result from model output. */
  private parseInvestigation(content: string): InvestigationResult | null {
    // Try to find a JSON block in the response.
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch?.[1]) return null;

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        summary: parsed.summary ?? "",
        relevantFiles: parsed.relevantFiles ?? [],
        findings: parsed.findings ?? [],
        dependencies: parsed.dependencies ?? [],
        suspectedAreas: parsed.suspectedAreas ?? [],
        confidence:
          typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
        recommendedNextSteps: parsed.recommendedNextSteps ?? [],
      };
    } catch {
      return null;
    }
  }
}
