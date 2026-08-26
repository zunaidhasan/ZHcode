import { describe, expect, test } from "bun:test";
import { parseInput } from "../src/commands";

describe("parseInput", () => {
  test("parses all four supported commands (case-insensitive)", () => {
    expect(parseInput("/help")).toEqual({ kind: "command", name: "help" });
    expect(parseInput("/HELP")).toEqual({ kind: "command", name: "help" });
    expect(parseInput("/exit")).toEqual({ kind: "command", name: "exit" });
    expect(parseInput("/clear")).toEqual({ kind: "command", name: "clear" });
    expect(parseInput("/version")).toEqual({
      kind: "command",
      name: "version",
    });
  });

  test("trims whitespace before parsing commands", () => {
    expect(parseInput("  /version  ")).toEqual({
      kind: "command",
      name: "version",
    });
  });

  test("flags unknown slash commands", () => {
    expect(parseInput("/frobnicate")).toEqual({
      kind: "unknown-command",
      raw: "/frobnicate",
    });
  });

  test("treats plain text as a message", () => {
    expect(parseInput("hello agent")).toEqual({
      kind: "message",
      text: "hello agent",
    });
  });

  test("empty and whitespace-only input are empty", () => {
    expect(parseInput("")).toEqual({ kind: "empty" });
    expect(parseInput("   \t ")).toEqual({ kind: "empty" });
  });

  test("a bare slash is an unknown command, not a crash", () => {
    expect(parseInput("/")).toEqual({ kind: "unknown-command", raw: "/" });
  });
});
