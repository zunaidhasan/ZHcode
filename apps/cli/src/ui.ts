/** Terminal UI helpers for the ZHcode CLI. */

import { VERSION } from "./version";

export function banner(): string {
  return [
    "╭──────────────────────────────╮",
    "│           ZHcode             │",
    "│     AI Coding Agent CLI      │",
    "╰──────────────────────────────╯",
  ].join("\n");
}

export function greeting(): string {
  return `Type /help for available commands.`;
}

export const PROMPT = "› ";

/** ANSI clear-screen + cursor-home sequence. */
export const CLEAR_SCREEN = "\x1b[2J\x1b[H";

export function versionLine(): string {
  return `ZHcode v${VERSION}`;
}
