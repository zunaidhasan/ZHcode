import { describe, expect, test } from "bun:test";
import { collectToolCalls, parseToolCalls } from "../src/loop";
import { extractJsonBlock } from "../src/json";
import type { ModelResponse } from "@zhcode/model-gateway";

describe("parseToolCalls markdown fallback", () => {
  test("parses ```tool name= blocks", () => {
    const calls = parseToolCalls(
      '```tool name=read_file\n{ "path": "src/a.ts" }\n```',
    );
    expect(calls).toEqual([{ name: "read_file", arguments: { path: "src/a.ts" } }]);
  });
});

describe("collectToolCalls", () => {
  test("prefers native toolCalls on the model response", () => {
    const response: ModelResponse = {
      content: "I will read the file.",
      model: "test",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: "call_1",
          name: "read_file",
          arguments: '{"path":"package.json"}',
        },
      ],
    };
    const calls = collectToolCalls(response);
    expect(calls).toEqual([
      { name: "read_file", arguments: { path: "package.json" } },
    ]);
  });

  test("falls back to markdown tool blocks when toolCalls is empty", () => {
    const response: ModelResponse = {
      content: '```tool name=list_files\n{ "path": "." }\n```',
      model: "test",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    };
    const calls = collectToolCalls(response);
    expect(calls[0]!.name).toBe("list_files");
  });
});

describe("extractJsonBlock", () => {
  test("extracts a fenced json block", () => {
    const parsed = extractJsonBlock<{ summary: string }>(
      'Here you go:\n```json\n{"summary":"found auth"}\n```\n',
    );
    expect(parsed).toEqual({ summary: "found auth" });
  });

  test("returns null when no json is present", () => {
    expect(extractJsonBlock("no structured data")).toBeNull();
  });
});
