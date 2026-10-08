/**
 * Git integration — status, diffs, and worktree isolation.
 *
 * Cross-platform: uses `execFile` (no shell) so Windows paths and
 * quoting do not leak into commands. The existing `git_status` tool
 * in `@zhcode/tools` is unchanged; this package is the shared primitive.
 */

import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 15_000;

export class GitError extends Error {
  constructor(
    message: string,
    public readonly cwd: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GitError";
  }
}

export interface GitStatus {
  branch: string;
  clean: boolean;
  modified: string[];
  untracked: string[];
  staged: string[];
}

export interface GitDiff {
  raw: string;
  stat: string;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
}

async function runGit(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { stdout: stdout ?? "", stderr: stderr ?? "" };
  } catch (err: unknown) {
    const execErr = err as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const detail = (execErr.stderr || execErr.message || String(err)).trim();
    throw new GitError(`git ${args.join(" ")} failed: ${detail}`, cwd, err);
  }
}

function normalizePath(p: string): string {
  return path.resolve(p).replace(/\\/g, "/");
}

export async function getStatus(cwd: string): Promise<GitStatus> {
  let branch = "main";
  try {
    const { stdout } = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    branch = stdout.trim() || "main";
  } catch (err) {
    if (err instanceof GitError) {
      try {
        const { stdout } = await runGit(
          ["symbolic-ref", "--short", "HEAD"],
          cwd,
        );
        branch = stdout.trim() || "main";
      } catch {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const { stdout: statusOut } = await runGit(["status", "--porcelain"], cwd);

  const modified: string[] = [];
  const untracked: string[] = [];
  const staged: string[] = [];

  for (const line of statusOut.split("\n").filter(Boolean)) {
    const indexStatus = line[0];
    const worktreeStatus = line[1];
    const filePath = line.slice(3).trim();

    if (indexStatus === "?") {
      untracked.push(filePath);
    } else {
      if (indexStatus !== " " && indexStatus !== "?") {
        staged.push(filePath);
      }
      if (worktreeStatus !== " " && worktreeStatus !== "?") {
        modified.push(filePath);
      }
    }
  }

  return {
    branch,
    clean:
      modified.length === 0 && untracked.length === 0 && staged.length === 0,
    modified,
    untracked,
    staged,
  };
}

export async function getDiff(cwd: string): Promise<GitDiff> {
  const [raw, stat] = await Promise.all([
    runGit(["diff"], cwd),
    runGit(["diff", "--stat"], cwd),
  ]);
  return {
    raw: raw.stdout.trimEnd(),
    stat: stat.stdout.trim(),
  };
}

export async function createWorktree(
  repoRoot: string,
  worktreePath: string,
  branch: string,
): Promise<WorktreeInfo> {
  const abs = normalizePath(worktreePath);
  await runGit(["worktree", "add", "-b", branch, abs], repoRoot);
  return { path: abs, branch };
}

export async function removeWorktree(
  repoRoot: string,
  worktreePath: string,
): Promise<void> {
  const abs = normalizePath(worktreePath);
  await runGit(["worktree", "remove", "--force", abs], repoRoot);
}
