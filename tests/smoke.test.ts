import { describe, expect, test } from "bun:test";
import { VERSION } from "../apps/cli/src/version";

describe("smoke", () => {
  test("workspace resolves and version is a semver-ish string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
