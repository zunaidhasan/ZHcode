/**
 * Build a production Orchestrator from a project root.
 *
 * Wires existing packages: gateway, router, registry, runtime agents,
 * context engine, tools, verification. Agents never call providers.
 */

import * as process from "node:process";
import { ModelGateway } from "@zhcode/model-gateway";
import { ModelRouter } from "@zhcode/model-router";
import { createDefaultAgentRegistry } from "@zhcode/agent-registry";
import {
  CoderAgent,
  DebuggerAgent,
  ExplorerAgent,
  PlannerAgent,
  ReviewerAgent,
  TesterAgent,
  type AgentEventHandler,
} from "@zhcode/agent-runtime";
import { ContextEngine, formatContext } from "@zhcode/context";
import { createDefaultRegistry } from "@zhcode/tools";
import { VerificationEngine } from "@zhcode/verification";
import { Orchestrator } from "./orchestrator";

export interface CreateOrchestratorOptions {
  projectRoot?: string;
  onEvent?: AgentEventHandler;
  persist?: boolean;
  maxRepairAttempts?: number;
}

export async function createDefaultOrchestrator(
  options?: CreateOrchestratorOptions,
): Promise<{ orchestrator: Orchestrator; router: ModelRouter }> {
  const projectRoot = options?.projectRoot ?? process.cwd();
  const gateway = new ModelGateway();
  const router = new ModelRouter(gateway);
  const tools = createDefaultRegistry();

  let contextText = "";
  try {
    const engine = new ContextEngine({ root: projectRoot });
    await engine.init();
    const intent = engine.detectIntent(projectRoot);
    const ctx = await engine.buildContext({
      query: projectRoot,
      intent,
    });
    contextText = formatContext(ctx);
  } catch {
    contextText = "";
  }

  const shared = {
    gateway,
    toolRegistry: tools,
    projectRoot,
    contextText,
    model: router.select("general").model,
  };

  const orchestrator = new Orchestrator({
    projectRoot,
    registry: createDefaultAgentRegistry(),
    agents: {
      explorer: new ExplorerAgent({
        gateway,
        toolRegistry: tools,
        projectRoot,
        config: { model: router.select("explore").model },
      }),
      planner: new PlannerAgent({ ...shared, model: router.select("plan").model }),
      coder: new CoderAgent({ ...shared, model: router.select("code").model }),
      tester: new TesterAgent({ ...shared, model: router.select("test").model }),
      reviewer: new ReviewerAgent({
        ...shared,
        model: router.select("review").model,
      }),
      debugger: new DebuggerAgent({
        ...shared,
        model: router.select("debug").model,
      }),
    },
    verification: new VerificationEngine(),
    maxRepairAttempts: options?.maxRepairAttempts,
    persist: options?.persist,
    contextText,
    onEvent: options?.onEvent,
  });

  return { orchestrator, router };
}
