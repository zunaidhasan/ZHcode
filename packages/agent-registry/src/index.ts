/**
 * Agent Registry — declarative descriptions of specialized agents.
 *
 * Answers "what agents exist and what can they do?" Execution lives in
 * agent-runtime / agents/*. The orchestrator is the only consumer that
 * decides which agent to run.
 */

import type { AgentId, ModelClass, TaskClass } from "@zhcode/core";

export type AgentCapability =
  | "search"
  | "read"
  | "write"
  | "edit"
  | "execute"
  | "git"
  | "analyze"
  | "plan"
  | "review"
  | "debug"
  | "test";

export type ToolPermission = "read" | "write" | "execute" | "network" | "git";

export interface AgentDefinition {
  id: AgentId | string;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  tools: string[];
  toolPolicy: ToolPermission[];
  defaultModelClass: ModelClass;
  defaultTaskClass: TaskClass;
}

export class AgentRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRegistryError";
  }
}

export class AgentRegistry {
  private readonly definitions = new Map<string, AgentDefinition>();

  register(definition: AgentDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new AgentRegistryError(
        `Agent "${definition.id}" is already registered.`,
      );
    }
    this.definitions.set(definition.id, definition);
  }

  get(id: string): AgentDefinition {
    const def = this.definitions.get(id);
    if (!def) {
      throw new AgentRegistryError(
        `Unknown agent: "${id}". Available: ${this.list()
          .map((d) => d.id)
          .join(", ")}`,
      );
    }
    return def;
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  list(): AgentDefinition[] {
    return [...this.definitions.values()];
  }
}

const DEFAULT_DEFINITIONS: AgentDefinition[] = [
  {
    id: "explorer",
    name: "Explorer Agent",
    description:
      "Investigates the codebase and produces structured findings. Read-only.",
    capabilities: ["search", "read", "analyze"],
    tools: ["list_files", "read_file", "search_files"],
    toolPolicy: ["read"],
    defaultModelClass: "cheap",
    defaultTaskClass: "explore",
  },
  {
    id: "planner",
    name: "Planner Agent",
    description: "Turns a task and investigation into an ordered task graph.",
    capabilities: ["plan", "analyze", "read"],
    tools: ["list_files", "read_file", "search_files"],
    toolPolicy: ["read"],
    defaultModelClass: "balanced",
    defaultTaskClass: "plan",
  },
  {
    id: "coder",
    name: "Coder Agent",
    description: "Implements a single task by editing project files.",
    capabilities: ["read", "write", "edit", "git"],
    tools: [
      "list_files",
      "read_file",
      "search_files",
      "write_file",
      "edit_file",
      "git_status",
    ],
    toolPolicy: ["read", "write", "git"],
    defaultModelClass: "balanced",
    defaultTaskClass: "code",
  },
  {
    id: "tester",
    name: "Tester Agent",
    description: "Writes or runs tests for recent changes.",
    capabilities: ["read", "write", "edit", "execute", "test"],
    tools: [
      "read_file",
      "write_file",
      "edit_file",
      "search_files",
      "run_command",
    ],
    toolPolicy: ["read", "write", "execute"],
    defaultModelClass: "cheap",
    defaultTaskClass: "test",
  },
  {
    id: "reviewer",
    name: "Reviewer Agent",
    description: "Reviews quality, security, and architecture of a change.",
    capabilities: ["read", "analyze", "review"],
    tools: ["read_file", "search_files", "git_status"],
    toolPolicy: ["read", "git"],
    defaultModelClass: "strong",
    defaultTaskClass: "review",
  },
  {
    id: "debugger",
    name: "Debugger Agent",
    description: "Diagnoses failing tests or reviews and proposes a repair.",
    capabilities: ["read", "analyze", "debug", "execute"],
    tools: ["read_file", "search_files", "run_command"],
    toolPolicy: ["read", "execute"],
    defaultModelClass: "reasoning",
    defaultTaskClass: "debug",
  },
];

export function createDefaultAgentRegistry(): AgentRegistry {
  const registry = new AgentRegistry();
  for (const def of DEFAULT_DEFINITIONS) {
    registry.register(def);
  }
  return registry;
}
