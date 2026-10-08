import { describe, expect, test } from "bun:test";
import {
  createCostLedger,
  createRunState,
  recordUsage,
  estimateUsd,
  DEFAULT_MODEL_PRICES,
} from "../src/pipeline";
import type {
  Plan,
  TaskNode,
  ImplementationResult,
  ReviewResult,
  VerificationResult,
  CostLedger,
} from "../src/pipeline";

describe("createRunState", () => {
  test("starts a run in pending with empty artifacts and zero cost", () => {
    const state = createRunState("add login", "run-1");
    expect(state.runId).toBe("run-1");
    expect(state.task).toBe("add login");
    expect(state.status).toBe("pending");
    expect(state.taskStates).toEqual({});
    expect(state.artifacts.changedFiles).toEqual([]);
    expect(state.cost.tokensIn).toBe(0);
    expect(state.cost.tokensOut).toBe(0);
    expect(state.cost.estimatedUsd).toBe(0);
    expect(state.repairAttempts).toBe(0);
  });

  test("generates a runId when none is provided", () => {
    const a = createRunState("task");
    const b = createRunState("task");
    expect(a.runId.length).toBeGreaterThan(8);
    expect(a.runId).not.toBe(b.runId);
  });
});

describe("cost ledger", () => {
  test("recordUsage accumulates tokens and estimated USD by model", () => {
    const ledger: CostLedger = createCostLedger();
    recordUsage(ledger, "deepseek-chat", {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    });
    recordUsage(ledger, "deepseek-chat", {
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
    });

    expect(ledger.tokensIn).toBe(1200);
    expect(ledger.tokensOut).toBe(600);
    expect(ledger.byModel["deepseek-chat"]?.calls).toBe(2);
    expect(ledger.estimatedUsd).toBeGreaterThan(0);
  });

  test("estimateUsd uses known prices and a conservative default otherwise", () => {
    const known = estimateUsd("deepseek-chat", 1_000_000, 1_000_000);
    const unknown = estimateUsd("mystery-model", 1_000_000, 1_000_000);
    expect(known).toBe(
      DEFAULT_MODEL_PRICES["deepseek-chat"]!.inputPerMillion +
        DEFAULT_MODEL_PRICES["deepseek-chat"]!.outputPerMillion,
    );
    expect(unknown).toBeGreaterThan(0);
  });
});

describe("pipeline types compile as structured data", () => {
  test("a plan with dependency order is well-formed", () => {
    const tasks: TaskNode[] = [
      {
        id: "t1",
        title: "Explore auth",
        dependsOn: [],
        agentHint: "explorer",
        files: ["src/auth.ts"],
        acceptance: ["auth module located"],
      },
      {
        id: "t2",
        title: "Implement login",
        dependsOn: ["t1"],
        agentHint: "coder",
        files: ["src/auth.ts"],
        acceptance: ["login function exists"],
      },
    ];
    const plan: Plan = {
      id: "plan-1",
      summary: "Add login",
      tasks,
    };
    expect(plan.tasks[1]!.dependsOn).toEqual(["t1"]);
  });

  test("implementation, review, and verification results are typed", () => {
    const impl: ImplementationResult = {
      changedFiles: ["src/auth.ts"],
      summary: "Added login",
      diffStat: "+12 -0",
    };
    const review: ReviewResult = {
      approved: false,
      findings: [
        {
          severity: "error",
          file: "src/auth.ts",
          message: "Missing tests",
        },
      ],
    };
    const verification: VerificationResult = {
      ok: false,
      checks: [{ name: "test", ok: false, output: "1 failed" }],
    };
    expect(impl.changedFiles).toHaveLength(1);
    expect(review.approved).toBe(false);
    expect(verification.ok).toBe(false);
  });
});
