/**
 * Persist RunState under `.zhcode/runs/<runId>.json`.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { RunState } from "@zhcode/core";

export function runsDir(projectRoot: string): string {
  return path.join(projectRoot, ".zhcode", "runs");
}

export function runPath(projectRoot: string, runId: string): string {
  return path.join(runsDir(projectRoot), `${runId}.json`);
}

export async function saveRunState(
  projectRoot: string,
  state: RunState,
): Promise<string> {
  const file = runPath(projectRoot, state.runId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2) + "\n", "utf-8");
  return file;
}

export async function loadRunState(
  projectRoot: string,
  runId: string,
): Promise<RunState | null> {
  try {
    const raw = await fs.readFile(runPath(projectRoot, runId), "utf-8");
    return JSON.parse(raw) as RunState;
  } catch {
    return null;
  }
}
