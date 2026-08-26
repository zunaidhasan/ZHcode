/**
 * Input parsing for the ZHcode CLI.
 *
 * Pure logic — no terminal I/O — so it can be unit tested easily.
 * Slash commands are parsed here; plain text becomes an agent message.
 */

export type CommandName = "help" | "clear" | "version" | "exit";

export type ParsedInput =
  | { kind: "command"; name: CommandName }
  | { kind: "unknown-command"; raw: string }
  | { kind: "message"; text: string }
  | { kind: "empty" };

const COMMANDS = new Set<CommandName>(["help", "clear", "version", "exit"]);

export function isCommandName(value: string): value is CommandName {
  return COMMANDS.has(value as CommandName);
}

export function parseInput(raw: string): ParsedInput {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) {
    if (trimmed === "") return { kind: "empty" };
    return { kind: "message", text: trimmed };
  }

  const name = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase() ?? "";
  if (isCommandName(name)) {
    return { kind: "command", name };
  }
  return { kind: "unknown-command", raw: trimmed };
}

/** All supported commands with their descriptions (used by /help and docs). */
export const COMMAND_TABLE: ReadonlyArray<[CommandName, string]> = [
  ["help", "Show available commands"],
  ["clear", "Clear conversation"],
  ["version", "Show version"],
  ["exit", "Exit ZHcode"],
];
