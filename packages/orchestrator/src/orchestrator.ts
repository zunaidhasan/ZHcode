/**
 * Orchestrator — explore → plan → implement → test → review → verify.
 *
 * Owns the engineering lifecycle and the bounded repair loop.
 * Agents never import this package.
 */

import type {
  Diagnosis,
  ImplementationResult,
  InvestigationResult,
  Plan,
  ReviewResult,
  RunState,
  TaskNode,
  TestResult,
  VerificationResult,
} from "@zhcode/core";
import { createRunState } from "@zhcode/core";
import type { SpecializedAgent } from "@zhcode/agent-runtime";
import {
  isDiagnosis,
  isImplementationResult,
  isInvestigationResult,
  isPlan,
  isReviewResult,
  isTestResult,
} from "@zhcode/agent-runtime";
import type { AgentRegistry } from "@zhcode/agent-registry";
import type { AgentEventHandler } from "@zhcode/agent-runtime";
import { saveRunState } from "./persist";

export interface VerificationRunner {
  run(request: { cwd: string }): Promise<VerificationResult>;
}

export interface OrchestratorAgents {
  explorer: SpecializedAgent;
  planner: SpecializedAgent;
  coder: SpecializedAgent;
  tester: SpecializedAgent;
  reviewer: SpecializedAgent;
  debugger: SpecializedAgent;
}

export interface OrchestratorOptions {
  projectRoot: string;
  registry: AgentRegistry;
  agents: OrchestratorAgents;
  verification: VerificationRunner;
  maxRepairAttempts?: number;
  persist?: boolean;
  contextText?: string;
  onEvent?: AgentEventHandler;
}

export class Orchestrator {
  private readonly projectRoot: string;
  private readonly agents: OrchestratorAgents;
  private readonly verification: VerificationRunner;
  private readonly maxRepairAttempts: number;
  private readonly persistEnabled: boolean;
  private readonly contextText?: string;
  private readonly onEvent?: AgentEventHandler;

  constructor(options: OrchestratorOptions) {
    this.projectRoot = options.projectRoot;
    this.agents = options.agents;
    this.verification = options.verification;
    this.maxRepairAttempts = options.maxRepairAttempts ?? 3;
    this.persistEnabled = options.persist !== false;
    this.contextText = options.contextText;
    this.onEvent = options.onEvent;
  }

  async run(task: string): Promise<RunState> {
    const state = createRunState(task);
    try {
      await this.persist(state);

      state.status = "exploring";
      const investigation = await this.explore(task);
      state.investigation = investigation;
      await this.persist(state);

      state.status = "planning";
      const plan = await this.plan(task, investigation);
      state.plan = plan;
      for (const node of plan.tasks) {
        state.taskStates[node.id] = "pending";
      }
      await this.persist(state);

      const ordered = topologicalSort(plan.tasks);
      state.status = "implementing";
      for (const node of ordered) {
        state.taskStates[node.id] = "running";
        await this.persist(state);
        const impl = await this.implement(node, investigation);
        mergeChangedFiles(state, impl.changedFiles);
        state.taskStates[node.id] = "done";
        await this.persist(state);
      }

      await this.testReviewVerify(state, task);
      return state;
    } catch (err) {
      state.status = "failed";
      state.error = err instanceof Error ? err.message : String(err);
      state.finishedAt = Date.now();
      await this.persist(state);
      return state;
    }
  }

  private async explore(task: string): Promise<InvestigationResult> {
    const result = await this.agents.explorer.run({
      task: this.withContext(task),
      onEvent: this.onEvent,
    });
    if (isInvestigationResult(result.output)) return result.output;
    return {
      summary: result.summary || "No structured investigation.",
      relevantFiles: [],
      findings: [],
      dependencies: [],
      suspectedAreas: [],
      confidence: 0.3,
      recommendedNextSteps: [],
    };
  }

  private async plan(
    task: string,
    investigation: InvestigationResult,
  ): Promise<Plan> {
    const result = await this.agents.planner.run({
      task: this.withContext(
        `${task}\n\nInvestigation:\n${JSON.stringify(investigation, null, 2)}`,
      ),
      onEvent: this.onEvent,
    });
    if (isPlan(result.output) && result.output.tasks.length > 0) {
      return result.output;
    }
    return {
      id: "plan-fallback",
      summary: result.summary || task,
      tasks: [
        {
          id: "t1",
          title: task,
          dependsOn: [],
          agentHint: "coder",
          files: investigation.relevantFiles.map((f) => f.path),
          acceptance: [],
        },
      ],
    };
  }

  private async implement(
    node: TaskNode,
    investigation: InvestigationResult,
  ): Promise<ImplementationResult> {
    const result = await this.agents.coder.run({
      task: this.withContext(
        `Task: ${node.title}\nFiles: ${node.files.join(", ")}\nAcceptance: ${node.acceptance.join("; ")}\nInvestigation: ${investigation.summary}`,
      ),
      onEvent: this.onEvent,
    });
    if (isImplementationResult(result.output)) return result.output;
    return {
      changedFiles: node.files,
      summary: result.summary,
      diffStat: "",
    };
  }

  private async testReviewVerify(state: RunState, task: string): Promise<void> {
    while (true) {
      state.status = "testing";
      const testResult = await this.runTester(task, state);
      state.artifacts.testOutput = testResult.output;

      state.status = "reviewing";
      const review = await this.runReviewer(task, state);
      state.artifacts.review = review;

      state.status = "verifying";
      const verification = await this.verification.run({
        cwd: this.projectRoot,
      });
      state.artifacts.verification = verification;

      const failed =
        testResult.failed > 0 || !review.approved || !verification.ok;
      if (!failed) {
        state.status = "complete";
        state.finishedAt = Date.now();
        await this.persist(state);
        return;
      }

      if (state.repairAttempts >= this.maxRepairAttempts) {
        state.status = "failed";
        state.error = formatFailure(testResult, review, verification);
        state.finishedAt = Date.now();
        await this.persist(state);
        return;
      }

      state.status = "repairing";
      state.repairAttempts += 1;
      await this.persist(state);

      const diagnosis = await this.runDebugger(task, state, testResult, review, verification);
      state.artifacts.diagnosis = diagnosis;

      const repairImpl = await this.agents.coder.run({
        task: this.withContext(
          `Repair attempt ${state.repairAttempts}. Cause: ${diagnosis.cause}. Hint: ${diagnosis.repairHint}. Files: ${diagnosis.files.join(", ")}`,
        ),
        onEvent: this.onEvent,
      });
      if (isImplementationResult(repairImpl.output)) {
        mergeChangedFiles(state, repairImpl.output.changedFiles);
      }
      await this.persist(state);
    }
  }

  private async runTester(task: string, state: RunState): Promise<TestResult> {
    const result = await this.agents.tester.run({
      task: this.withContext(
        `Test changes for: ${task}\nChanged files: ${state.artifacts.changedFiles.join(", ")}`,
      ),
      onEvent: this.onEvent,
    });
    if (isTestResult(result.output)) return result.output;
    return { passed: 0, failed: 0, output: result.summary };
  }

  private async runReviewer(task: string, state: RunState): Promise<ReviewResult> {
    const result = await this.agents.reviewer.run({
      task: this.withContext(
        `Review: ${task}\nChanged files: ${state.artifacts.changedFiles.join(", ")}`,
      ),
      onEvent: this.onEvent,
    });
    if (isReviewResult(result.output)) return result.output;
    return { approved: true, findings: [] };
  }

  private async runDebugger(
    task: string,
    state: RunState,
    testResult: TestResult,
    review: ReviewResult,
    verification: VerificationResult,
  ): Promise<Diagnosis> {
    const result = await this.agents.debugger.run({
      task: this.withContext(
        `Diagnose failure for: ${task}\nTests: ${testResult.output}\nReview: ${JSON.stringify(review)}\nVerification: ${JSON.stringify(verification)}`,
      ),
      onEvent: this.onEvent,
    });
    if (isDiagnosis(result.output)) return result.output;
    return {
      cause: result.summary || "unknown failure",
      files: state.artifacts.changedFiles,
      repairHint: "Inspect failing tests and review findings.",
    };
  }

  private withContext(task: string): string {
    if (!this.contextText) return task;
    return `${task}\n\n## Project context\n${this.contextText}`;
  }

  private async persist(state: RunState): Promise<void> {
    if (!this.persistEnabled) return;
    await saveRunState(this.projectRoot, state);
  }
}

function mergeChangedFiles(state: RunState, files: string[]): void {
  const set = new Set(state.artifacts.changedFiles);
  for (const file of files) set.add(file);
  state.artifacts.changedFiles = [...set];
}

function formatFailure(
  testResult: TestResult,
  review: ReviewResult,
  verification: VerificationResult,
): string {
  const parts: string[] = [];
  if (testResult.failed > 0) parts.push(`tests failed: ${testResult.failed}`);
  if (!review.approved) {
    parts.push(
      `review rejected: ${review.findings.map((f) => f.message).join("; ")}`,
    );
  }
  if (!verification.ok) {
    parts.push(
      `verification failed: ${verification.checks
        .filter((c) => !c.ok)
        .map((c) => c.name)
        .join(", ")}`,
    );
  }
  return parts.join(" | ") || "run failed";
}

export function topologicalSort(tasks: TaskNode[]): TaskNode[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: TaskNode[] = [];

  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Cycle in task graph at "${id}"`);
    }
    visiting.add(id);
    const node = byId.get(id);
    if (!node) throw new Error(`Unknown task id "${id}"`);
    for (const dep of node.dependsOn) visit(dep);
    visiting.delete(id);
    visited.add(id);
    ordered.push(node);
  };

  for (const task of tasks) visit(task.id);
  return ordered;
}
