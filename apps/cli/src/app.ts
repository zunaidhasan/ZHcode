/**
 * Application layer for the ZHcode CLI.
 *
 * Sits between the terminal UI (repl) and the agent runtime:
 *
 *   CLI (rendering/IO)
 *     ↓
 *   Application Layer   ← this file
 *     ↓
 *   Agent Runtime       → @zhcode/agent-runtime (Phase 4)
 *     ↓
 *   Model Gateway       → @zhcode/model-gateway (Phase 2)
 *     ↓
 *   Tool Registry       → @zhcode/tools (Phase 3)
 *     ↓
 *   Model Provider      (mock, openrouter, etc.)
 *
 * Returns plain data (lines + an action) — it never writes to the terminal,
 * which keeps rendering testable and swappable.
 */

import { COMMAND_TABLE, parseInput } from "./commands";
import { Session } from "./session";
import { VERSION } from "./version";
import { initializeProject, formatProjectInfo } from "./init";
import type { ProjectInfo } from "./init";
import { ModelGateway } from "@zhcode/model-gateway";
import type { ModelMessage } from "@zhcode/model-gateway";
import { Agent } from "@zhcode/agent-runtime";
import type { AgentEventHandler } from "@zhcode/agent-runtime";
import { createDefaultRegistry } from "@zhcode/tools";
import { ToolContext } from "@zhcode/tools";
import * as process from "node:process";

export type AppAction = "continue" | "clear" | "exit" | "agent" | "init";

export interface AppResponse {
  /** Lines to render in the terminal (empty when action is "agent" or "init"). */
  lines: string[];
  /** What the REPL should do next. */
  action: AppAction;
  /** The user message to send to the agent (when action is "agent"). */
  message?: string;
}

const HELP_LINES: string[] = [
  "ZHcode Commands",
  ...COMMAND_TABLE.map(([name, desc]) => `  /${name.padEnd(10)} ${desc}`),
];

export class ZHcodeApp {
  readonly session: Session = new Session();
  readonly gateway: ModelGateway;
  /** Whether agent responses stream tokens to the UI. */
  readonly streamEnabled = true;
  private readonly agent: Agent;
  private readonly toolContext: ToolContext;
  private abortController: AbortController | null = null;

  constructor(_onEvent?: AgentEventHandler) {
    this.gateway = new ModelGateway();
    const toolRegistry = createDefaultRegistry();
    this.toolContext = new ToolContext({
      projectRoot: process.cwd(),
      permissions: ["read", "write", "execute", "git"],
    });

    this.agent = new Agent({
      gateway: this.gateway,
      toolRegistry,
      toolContext: this.toolContext,
      config: { stream: true },
    });
  }

  get messageCount(): number {
    return this.session.messageCount;
  }

  /** Build the message array for the model from session history. */
  buildMessages(): ModelMessage[] {
    return this.session.history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  }

  /** Record the assistant's response in the session. */
  addAssistantReply(content: string): void {
    this.session.addAssistantMessage(content);
  }

  /** Cancel the current agent run. */
  cancel(): void {
    this.abortController?.abort();
  }

  /** Initialize project metadata (the /init command). */
  async initProject(): Promise<{ lines: string[]; info: ProjectInfo }> {
    const { info } = await initializeProject(process.cwd());
    return { lines: formatProjectInfo(info), info };
  }

  /** Run the agent with a user message. */
  async runAgent(
    message: string,
    _onEvent?: AgentEventHandler,
  ): Promise<{ content: string; status: string; streamed: boolean }> {
    this.abortController = new AbortController();

    const response = await this.agent.run(
      {
        message,
        signal: this.abortController.signal,
      },
      this.buildMessages(),
    );

    // Add the assistant's response to the session.
    if (response.content) {
      this.addAssistantReply(response.content);
    }

    return {
      content: response.content,
      status: response.status,
      streamed: this.streamEnabled,
    };
  }

  /** Handle one raw line of user input. */
  handle(raw: string): AppResponse {
    const parsed = parseInput(raw);

    switch (parsed.kind) {
      case "empty":
        return { lines: [], action: "continue" };

      case "command":
        return this.handleCommand(parsed.name);

      case "unknown-command":
        return {
          lines: [
            `Unknown command: ${parsed.raw}`,
            "Type /help to see available commands.",
          ],
          action: "continue",
        };

      case "message":
        return this.handleMessage(parsed.text);
    }
  }

  private handleCommand(
    name: "help" | "clear" | "version" | "exit" | "init",
  ): AppResponse {
    switch (name) {
      case "help":
        return { lines: HELP_LINES, action: "continue" };

      case "clear":
        this.session.reset();
        return { lines: ["Conversation cleared."], action: "clear" };

      case "version":
        return { lines: [`ZHcode v${VERSION}`], action: "continue" };

      case "init":
        // Initialization is async; the REPL awaits initProject().
        return { lines: [], action: "init" };

      case "exit":
        return { lines: ["Goodbye! 👋"], action: "exit" };
    }
  }

  private handleMessage(text: string): AppResponse {
    this.session.addUserMessage(text);
    // Signal to the REPL that this message should go through the agent.
    return { lines: [], action: "agent", message: text };
  }
}
