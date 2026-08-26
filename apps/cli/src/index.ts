#!/usr/bin/env bun
/**
 * ZHcode CLI entry point.
 *
 * Layering rule (keep UI separate from agent logic):
 *
 *   CLI (this file / repl.ts / ui.ts)
 *     ↓
 *   Application Layer (app.ts)
 *     ↓
 *   Agent Runtime   → @zhcode/agent-runtime (Phase 4+)
 *     ↓
 *   Model Gateway   → @zhcode/model-gateway (Phase 2)
 */

import { startRepl } from "./repl";

startRepl();
