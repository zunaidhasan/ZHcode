/**
 * Verification engine — run project checks without knowing about agents.
 *
 * Detects scripts from package.json (test, typecheck, lint, build) and
 * executes them via execFile so the shell is never involved.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import type { VerificationCheck, VerificationResult } from "@zhcode/core";

const execFileAsync = promisify(execFile);

export type CheckName = "test" | "typecheck" | "lint" | "build";

export interface VerificationRequest {
  cwd: string;
  checks?: CheckName[];
  timeoutMs?: number;
}

const DEFAULT_CHECKS: CheckName[] = ["test", "typecheck", "lint"];
const DEFAULT_TIMEOUT_MS = 120_000;

interface PackageJson {
  scripts?: Record<string, string>;
}

async function readScripts(cwd: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(path.join(cwd, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as PackageJson;
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

function bunBin(): string {
  return process.execPath.endsWith("bun") || process.execPath.endsWith("bun.exe")
    ? process.execPath
    : "bun";
}

export class VerificationEngine {
  async run(request: VerificationRequest): Promise<VerificationResult> {
    const checks = request.checks ?? DEFAULT_CHECKS;
    const timeout = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const scripts = await readScripts(request.cwd);
    const results: VerificationCheck[] = [];

    for (const name of checks) {
      if (!scripts[name]) {
        results.push({
          name,
          ok: true,
          output: `skipped: no "${name}" script in package.json`,
        });
        continue;
      }

      try {
        const { stdout, stderr } = await execFileAsync(
          bunBin(),
          ["run", name],
          {
            cwd: request.cwd,
            timeout,
            maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env, CI: "1" },
          },
        );
        results.push({
          name,
          ok: true,
          output: `${stdout}${stderr}`.trim(),
        });
      } catch (err: unknown) {
        const execErr = err as {
          stdout?: string;
          stderr?: string;
          message?: string;
        };
        results.push({
          name,
          ok: false,
          output: (
            execErr.stderr ||
            execErr.stdout ||
            execErr.message ||
            String(err)
          ).trim(),
        });
      }
    }

    return { ok: results.every((c) => c.ok), checks: results };
  }
}

export type { VerificationResult, VerificationCheck };
