import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type {
  AgentId,
  ImplementationResult,
  InvestigationResult,
  Plan,
  ReviewResult,
  TestResult,
  Diagnosis,
} from "@zhcode/core";
import type {
  SpecializedAgent,
  AgentRunRequest,
  AgentRunResult,
  AgentCapability,
} from "@zhcode/agent-runtime";
import type { PermissionLevel } from "@zhcode/tools";
import { createDefaultAgentRegistry } from "@zhcode/agent-registry";
import { Orchestrator } from "../src/index";
import { loadRunState } from "../src/persist";

class StubAgent implements SpecializedAgent {
  readonly name: string;
  readonly description = "stub";
  readonly systemPrompt = "";
  readonly capabilities: AgentCapability[] = [];
  readonly toolPolicy: PermissionLevel[] = ["read"];
  readonly calls: string[] = [];

  constructor(
    readonly id: AgentId,
    private readonly output: unknown,
    private readonly summary = "ok",
  ) {
    this.name = id;
  }

  async run(request: AgentRunRequest): Promise<AgentRunResult> {
    this.calls.push(request.task);
    return {
      success: true,
      output: this.output,
      summary: this.summary,
      iterations: 1,
      toolCalls: 0,
    };
  }
}

const investigation: InvestigationResult = {
  summary: "auth lives in src/auth.ts",
  relevantFiles: [{ path: "src/auth.ts", reason: "login" }],
  findings: [],
  dependencies: [],
  suspectedAreas: [],
  confidence: 0.9,
  recommendedNextSteps: ["implement login"],
};

const plan: Plan = {
  id: "plan-1",
  summary: "add login",
  tasks: [
    {
      id: "t1",
      title: "Add login function",
      dependsOn: [],
      agentHint: "coder",
      files: ["src/auth.ts"],
      acceptance: ["login exported"],
    },
  ],
};

const implementation: ImplementationResult = {
  changedFiles: ["src/auth.ts"],
  summary: "added login",
  diffStat: "+4",
};

const tests: TestResult = { passed: 1, failed: 0, output: "1 pass" };
const review: ReviewResult = { approved: true, findings: [] };

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "zhcode-orch-"));
  await fs.writeFile(path.join(tmp, "package.json"), '{"name":"fixture"}');
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

function createOrch(overrides?: {
  tester?: StubAgent;
  reviewer?: StubAgent;
  debugger?: StubAgent;
  verifyOk?: boolean;
  maxRepairAttempts?: number;
}): {
  orch: Orchestrator;
  explorer: StubAgent;
  planner: StubAgent;
  coder: StubAgent;
} {
  const explorer = new StubAgent("explorer", investigation, investigation.summary);
  const planner = new StubAgent("planner", plan, plan.summary);
  const coder = new StubAgent("coder", implementation, implementation.summary);
  const tester = overrides?.tester ?? new StubAgent("tester", tests, "tests pass");
  const reviewer =
    overrides?.reviewer ?? new StubAgent("reviewer", review, "approved");
  const debuggerAgent =
    overrides?.debugger ??
    new StubAgent("debugger", {
      cause: "missing export",
      files: ["src/auth.ts"],
      repairHint: "export login",
    } satisfies Diagnosis);

  const orch = new Orchestrator({
    projectRoot: tmp,
    registry: createDefaultAgentRegistry(),
    agents: {
      explorer,
      planner,
      coder,
      tester,
      reviewer,
      debugger: debuggerAgent,
    },
    verification: {
      run: async () => ({
        ok: overrides?.verifyOk ?? true,
        checks: [{ name: "test", ok: overrides?.verifyOk ?? true, output: "" }],
      }),
    },
    maxRepairAttempts: overrides?.maxRepairAttempts ?? 3,
    persist: true,
  });

  return { orch, explorer, planner, coder };
}

describe("Orchestrator.run", () => {
  test("walks explore → plan → code → test → review → verify", async () => {
    const { orch, explorer, planner, coder } = createOrch();
    const state = await orch.run("Add login");

    expect(explorer.calls).toHaveLength(1);
    expect(planner.calls).toHaveLength(1);
    expect(coder.calls).toHaveLength(1);
    expect(state.status).toBe("complete");
    expect(state.investigation?.summary).toContain("auth");
    expect(state.plan?.tasks).toHaveLength(1);
    expect(state.taskStates.t1).toBe("done");
    expect(state.artifacts.changedFiles).toContain("src/auth.ts");
    expect(state.artifacts.review?.approved).toBe(true);
    expect(state.artifacts.verification?.ok).toBe(true);
  });

  test("persists RunState under .zhcode/runs/", async () => {
    const { orch } = createOrch();
    const state = await orch.run("Add login");
    const loaded = await loadRunState(tmp, state.runId);
    expect(loaded?.status).toBe("complete");
    expect(loaded?.task).toBe("Add login");
  });

  test("runs a bounded repair loop when verification fails", async () => {
    let verifyCalls = 0;
    const explorer = new StubAgent("explorer", investigation);
    const planner = new StubAgent("planner", plan);
    const coder = new StubAgent("coder", implementation);
    const tester = new StubAgent("tester", tests);
    const reviewer = new StubAgent("reviewer", review);
    const debuggerAgent = new StubAgent("debugger", {
      cause: "test fail",
      files: ["src/auth.ts"],
      repairHint: "fix it",
    } satisfies Diagnosis);

    const orch = new Orchestrator({
      projectRoot: tmp,
      registry: createDefaultAgentRegistry(),
      agents: {
        explorer,
        planner,
        coder,
        tester,
        reviewer,
        debugger: debuggerAgent,
      },
      verification: {
        run: async () => {
          verifyCalls++;
          return {
            ok: verifyCalls >= 2,
            checks: [
              {
                name: "test",
                ok: verifyCalls >= 2,
                output: verifyCalls >= 2 ? "ok" : "fail",
              },
            ],
          };
        },
      },
      maxRepairAttempts: 3,
      persist: false,
    });

    const state = await orch.run("Add login");
    expect(state.status).toBe("complete");
    expect(debuggerAgent.calls.length).toBeGreaterThanOrEqual(1);
    expect(coder.calls.length).toBeGreaterThanOrEqual(2);
    expect(state.repairAttempts).toBeGreaterThanOrEqual(1);
  });

  test("honors task graph dependsOn order", async () => {
    const ordered: string[] = [];
    const twoTaskPlan: Plan = {
      id: "p",
      summary: "two",
      tasks: [
        {
          id: "a",
          title: "first",
          dependsOn: [],
          agentHint: "coder",
          files: [],
          acceptance: [],
        },
        {
          id: "b",
          title: "second",
          dependsOn: ["a"],
          agentHint: "coder",
          files: [],
          acceptance: [],
        },
      ],
    };

    class OrderCoder extends StubAgent {
      override async run(request: AgentRunRequest): Promise<AgentRunResult> {
        ordered.push(request.task);
        return super.run(request);
      }
    }

    const coder = new OrderCoder("coder", implementation);
    const orch = new Orchestrator({
      projectRoot: tmp,
      registry: createDefaultAgentRegistry(),
      agents: {
        explorer: new StubAgent("explorer", investigation),
        planner: new StubAgent("planner", twoTaskPlan),
        coder,
        tester: new StubAgent("tester", tests),
        reviewer: new StubAgent("reviewer", review),
        debugger: new StubAgent("debugger", {
          cause: "x",
          files: [],
          repairHint: "y",
        }),
      },
      verification: {
        run: async () => ({ ok: true, checks: [] }),
      },
      persist: false,
    });

    await orch.run("two tasks");
    expect(ordered[0]).toContain("first");
    expect(ordered[1]).toContain("second");
  });
});
