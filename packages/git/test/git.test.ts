import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createWorktree,
  getDiff,
  getStatus,
  GitError,
  removeWorktree,
} from "../src/index";

const execFileAsync = promisify(execFile);

let repo: string;
const worktrees: string[] = [];

async function git(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, { cwd, timeout: 10_000 });
}

beforeEach(async () => {
  repo = await fs.mkdtemp(path.join(os.tmpdir(), "zhcode-git-"));
  await git(["init", "-b", "main"], repo);
  await git(["config", "user.email", "test@zhcode.dev"], repo);
  await git(["config", "user.name", "ZHcode Test"], repo);
  await fs.writeFile(path.join(repo, "README.md"), "# test\n");
  await git(["add", "README.md"], repo);
  await git(["commit", "-m", "init"], repo);
});

afterEach(async () => {
  for (const wt of worktrees.splice(0)) {
    try {
      await removeWorktree(repo, wt);
    } catch {
      // ignore cleanup failures
    }
  }
});

describe("getStatus", () => {
  test("reports a clean tree on a fresh commit", async () => {
    const status = await getStatus(repo);
    expect(status.branch).toBe("main");
    expect(status.clean).toBe(true);
    expect(status.modified).toEqual([]);
    expect(status.untracked).toEqual([]);
    expect(status.staged).toEqual([]);
  });

  test("lists untracked and modified files", async () => {
    await fs.writeFile(path.join(repo, "new.txt"), "hi\n");
    await fs.writeFile(path.join(repo, "README.md"), "# changed\n");
    const status = await getStatus(repo);
    expect(status.clean).toBe(false);
    expect(status.untracked).toContain("new.txt");
    expect(status.modified).toContain("README.md");
  });

  test("throws GitError outside a repository", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "zhcode-notgit-"));
    await expect(getStatus(tmp)).rejects.toBeInstanceOf(GitError);
  });
});

describe("getDiff", () => {
  test("returns empty diff on a clean tree", async () => {
    const diff = await getDiff(repo);
    expect(diff.raw).toBe("");
    expect(diff.stat).toBe("");
  });

  test("includes unstaged changes", async () => {
    await fs.writeFile(path.join(repo, "README.md"), "# changed\n");
    const diff = await getDiff(repo);
    expect(diff.raw).toContain("README.md");
    expect(diff.raw).toContain("changed");
  });
});

describe("worktrees", () => {
  test("creates an isolated worktree on a new branch", async () => {
    const wt = path.join(os.tmpdir(), `zhcode-wt-${Date.now()}`);
    worktrees.push(wt);
    const info = await createWorktree(repo, wt, "feat/isolated");
    expect(info.path).toBe(path.resolve(wt).replace(/\\/g, "/"));
    expect(info.branch).toBe("feat/isolated");
    const head = await git(["rev-parse", "--abbrev-ref", "HEAD"], wt);
    expect(head.stdout.trim()).toBe("feat/isolated");
  });

  test("removeWorktree deletes the worktree directory", async () => {
    const wt = path.join(os.tmpdir(), `zhcode-wt-rm-${Date.now()}`);
    await createWorktree(repo, wt, "feat/remove-me");
    await removeWorktree(repo, wt);
    await expect(fs.access(wt)).rejects.toThrow();
  });
});
