/** Terminal UI helpers for the ZHcode CLI. */

import { VERSION } from "./version";

// Minimal ANSI color helpers (terminal-agnostic).
const RESET = "\x1b[0m";
const CYAN = "\x1b[36;1m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

/** ASCII art banner shown on startup. */
export function banner(): string {
  return [
    `${CYAN}╭─ ZHcode ─╮${RESET}`,
    `${CYAN}╰──────────╯${RESET}`,
    `${DIM}   AI Coding Agent CLI · v${VERSION}${RESET}`,
  ].join("\n");
}

export function greeting(): string {
  return `${BOLD}Type /help for available commands.${RESET}`;
}

export const PROMPT = `${CYAN}› ${RESET}`;

/** ANSI clear-screen + cursor-home sequence. */
export const CLEAR_SCREEN = "\x1b[2J\x1b[H";

export function versionLine(): string {
  return `ZHcode v${VERSION}`;
}
