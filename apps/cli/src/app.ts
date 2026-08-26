/**
 * Application layer for the ZHcode CLI.
 *
 * Sits between the terminal UI (repl) and the future agent runtime:
 *
 *   CLI (rendering/IO)
 *     ↓
 *   Application Layer   ← this file
 *     ↓
 *   Agent Runtime       (Phase 4+, currently a stub response)
 *     ↓
 *   Model Gateway       (Phase 2)
 *
 * Returns plain data (lines + an action) — it never writes to the terminal,
 * which keeps rendering testable and swappable.
 */

import { COMMAND_TABLE, parseInput } from "./commands";
import { Session } from "./session";
import { VERSION } from "./version";

export type AppAction = "continue" | "clear" | "exit";

export interface AppResponse {
  /** Lines to render in the terminal. */
  lines: string[];
  /** What the REPL should do next. */
  action: AppAction;
}

const HELP_LINES: string[] = [
  "ZHcode Commands",
  ...COMMAND_TABLE.map(([name, desc]) => `  /${name.padEnd(10)} ${desc}`),
];

export class ZHcodeApp {
  private readonly session: Session = new Session();

  get messageCount(): number {
    return this.session.messageCount;
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
    name: "help" | "clear" | "version" | "exit",
  ): AppResponse {
    switch (name) {
      case "help":
        return { lines: HELP_LINES, action: "continue" };

      case "clear":
        this.session.reset();
        return { lines: ["Conversation cleared."], action: "clear" };

      case "version":
        return { lines: [`ZHcode v${VERSION}`], action: "continue" };

      case "exit":
        return { lines: ["Goodbye! 👋"], action: "exit" };
    }
  }

  private handleMessage(text: string): AppResponse {
    this.session.addUserMessage(text);

    // Phase 4 wires the real agent runtime here. For now, acknowledge and
    // keep the session so context plumbing can be tested end-to-end later.
    const reply =
      "Agent runtime is not connected yet (planned for Phase 2–4). " +
      "Your message was saved to this session.";
    this.session.addAssistantMessage(reply);

    return { lines: [reply], action: "continue" };
  }
}
