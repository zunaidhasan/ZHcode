#!/usr/bin/env bun
/**
 * ZHcode CLI — Phase 0 stub.
 * The full interactive TUI arrives in Phase 1.
 */

import { VERSION } from "./version";

function banner(): string {
  return [
    "╭──────────────────────────────╮",
    "│           ZHcode             │",
    "│     AI Coding Agent CLI      │",
    "╰──────────────────────────────╯",
  ].join("\n");
}

console.log(banner());
console.log(`\n  v${VERSION} (foundation)\n`);
console.log("  Interactive agent arrives in Phase 1. Exiting cleanly. 👋");
process.exit(0);
