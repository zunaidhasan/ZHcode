import { describe, expect, test } from "bun:test";
import { getEnv } from "../src/env";

describe("env", () => {
  test("reads from process environment", async () => {
    process.env.ZHCODE_TEST_VAR = "hello";
    expect(await getEnv("ZHCODE_TEST_VAR")).toBe("hello");
    delete process.env.ZHCODE_TEST_VAR;
  });

  test("returns undefined for unknown keys", async () => {
    expect(await getEnv("ZHCODE_DEFINITELY_NOT_SET_12345")).toBeUndefined();
  });
});
