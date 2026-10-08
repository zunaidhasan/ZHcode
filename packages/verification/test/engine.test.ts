import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { VerificationEngine } from "../src/index";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "zhcode-verify-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function writePkg(scripts: Record<string, string>): Promise<void> {
  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "fixture", scripts }, null, 2),
  );
}

describe("VerificationEngine", () => {
  test("reports ok when configured checks pass", async () => {
    await writePkg({
      test: 'node -e "process.exit(0)"',
      typecheck: 'node -e "process.exit(0)"',
    });
    const engine = new VerificationEngine();
    const result = await engine.run({
      cwd: tmp,
      checks: ["test", "typecheck"],
    });
    expect(result.ok).toBe(true);
    expect(result.checks).toHaveLength(2);
    expect(result.checks.every((c) => c.ok)).toBe(true);
  });

  test("reports not ok when a check fails", async () => {
    await writePkg({
      test: 'node -e "process.exit(1)"',
    });
    const engine = new VerificationEngine();
    const result = await engine.run({ cwd: tmp, checks: ["test"] });
    expect(result.ok).toBe(false);
    expect(result.checks[0]!.ok).toBe(false);
    expect(result.checks[0]!.output.length).toBeGreaterThan(0);
  });

  test("skips checks whose scripts are missing", async () => {
    await writePkg({});
    const engine = new VerificationEngine();
    const result = await engine.run({
      cwd: tmp,
      checks: ["lint"],
    });
    expect(result.ok).toBe(true);
    expect(result.checks[0]!.name).toBe("lint");
    expect(result.checks[0]!.ok).toBe(true);
    expect(result.checks[0]!.output).toMatch(/skipped/i);
  });
});
