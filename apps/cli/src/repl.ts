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

export function startRepl(
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): void {
  const app = new ZHcodeApp();
  const rl = readline.createInterface({ input, output, prompt: PROMPT });

  let sigintStreak = 0;

  const shutdown = (): void => {
    rl.close();
    process.exit(0);
  };

  output.write(`${banner()}\n\n${greeting()}\n\n`);
  rl.prompt();

  rl.on("line", (line: string) => {
    sigintStreak = 0;

    const response = app.handle(line);
    for (const text of response.lines) {
      output.write(`${text}\n`);
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
    // First Ctrl+C with a draft in progress: cancel the draft, stay alive.
    output.write("\n(press Ctrl+C again or type /exit to quit)\n");
    rl.prompt(true);
  });

  rl.on("close", () => {
    // stdin ended (EOF / Ctrl+D).
    output.write("\nGoodbye! 👋\n");
    process.exit(0);
  });
}
