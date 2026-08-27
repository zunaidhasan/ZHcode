/**
 * Interactive REPL for the ZHcode CLI.
 *
 * Owns all terminal I/O. All logic lives in the application layer (app.ts),
 * so this file stays thin: read a line → app.handle() → render response.
 */

import * as readline from "node:readline";
import type { Readable, Writable } from "node:stream";
import { ZHcodeApp } from "./app";
import { banner, CLEAR_SCREEN, greeting, PROMPT } from "./ui";
import type { AgentEvent } from "@zhcode/agent-runtime";

/** Render agent events to the terminal. */
function createEventRenderer(output: Writable): (event: AgentEvent) => void {
  let streaming = false;

  return (event: AgentEvent) => {
    switch (event.type) {
      case "thinking":
        output.write(`\n⏳ ${event.message ?? "Thinking..."}\n`);
        break;
      case "model_delta":
        // Streamed tokens — print inline for a responsive feel.
        if (!streaming) {
          output.write("\n");
          streaming = true;
        }
        output.write(event.delta);
        break;
      case "tool_start":
        if (streaming) {
          output.write("\n");
          streaming = false;
        }
        output.write(
          `\n🔍 ${event.toolName}(${formatToolInput(event.input)})\n`,
        );
        break;
      case "tool_result":
        if (event.result.success) {
          const dataStr =
            typeof event.result.data === "string"
              ? truncate(event.result.data, 200)
              : JSON.stringify(event.result.data, null, 2);
          output.write(`   ✓ ${truncate(dataStr, 200)}\n`);
        } else {
          output.write(`   ✗ ${event.result.message ?? "Failed"}\n`);
        }
        break;
      case "iteration":
        if (event.current > 1) {
          output.write(`   (iteration ${event.current}/${event.max})\n`);
        }
        break;
      case "error":
        if (streaming) {
          output.write("\n");
          streaming = false;
        }
        output.write(`\n⚠ ${event.message}\n`);
        break;
      case "complete":
        if (streaming) {
          output.write("\n");
          streaming = false;
        }
        output.write(
          `\n✅ Done (${event.iterations} iterations, ${event.toolCalls} tool calls)\n`,
        );
        break;
      default:
        break;
    }
  };
}

function formatToolInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return "";
  return entries
    .map(
      ([k, v]) =>
        `${k}=${typeof v === "string" ? truncate(v, 50) : JSON.stringify(v)}`,
    )
    .join(", ");
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

export function startRepl(
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): void {
  const app = new ZHcodeApp();
  const rl = readline.createInterface({ input, output, prompt: PROMPT });
  const renderEvent = createEventRenderer(output);

  let sigintStreak = 0;

  const shutdown = (): void => {
    rl.close();
    process.exit(0);
  };

  output.write(`${banner()}\n\n${greeting()}\n\n`);
  rl.prompt();

  rl.on("line", async (line: string) => {
    sigintStreak = 0;

    const response = app.handle(line);

    if (response.action === "agent" && response.message) {
      // Run the agent with event rendering.
      try {
        const result = await app.runAgent(response.message, renderEvent);
        // With streaming, tokens were already printed via model_delta events.
        if (result.content && !result.streamed) {
          output.write(`\n${result.content}\n`);
        }
      } catch (err: unknown) {
        const msg =
          err && typeof err === "object" && "userMessage" in err
            ? (err as { userMessage: string }).userMessage
            : `⚠ Error: ${err instanceof Error ? err.message : "Unknown error"}`;
        output.write(`\n${msg}\n`);
      }
      output.write("\n");
    } else if (response.action === "init") {
      // Initialize project metadata.
      try {
        const { lines } = await app.initProject();
        for (const text of lines) {
          output.write(`${text}\n`);
        }
      } catch (err: unknown) {
        output.write(
          `⚠ Init failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
      output.write("\n");
    } else {
      // Non-agent response (commands, errors, etc.)
      for (const text of response.lines) {
        output.write(`${text}\n`);
      }
    }

    if (response.action === "exit") {
      shutdown();
      return;
    }
    if (response.action === "clear") {
      output.write(CLEAR_SCREEN + "\n");
    }
    rl.prompt();
  });

  rl.on("SIGINT", () => {
    sigintStreak += 1;
    if (sigintStreak >= 2 || rl.line.trim() === "") {
      // Ctrl+C on an empty line (or pressed twice) exits cleanly.
      output.write("\nGoodbye! 👋\n");
      shutdown();
      return;
    }
    // First Ctrl+C: cancel the current agent run.
    app.cancel();
    output.write("\n⚠ Cancelled. Press Ctrl+C again or type /exit to quit.\n");
    rl.prompt(true);
  });

  rl.on("close", () => {
    // stdin ended (EOF / Ctrl+D).
    output.write("\nGoodbye! 👋\n");
    process.exit(0);
  });
}
