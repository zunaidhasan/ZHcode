/**
 * Agent Loop — the heart of ZHcode.
 *
 * Runs the model → tool → model cycle until the model produces a final
 * text response (no tool calls), or a limit/cancellation is hit.
 *
 * This is a pure-logic module. It receives an AgentContext and returns
 * an AgentResponse. No console.log, no terminal I/O.
 */

import type { ToolResult } from "@zhcode/tools";
import type { AgentContext } from "./context";
import type { AgentResponse } from "./types";
import type { ModelResponse } from "@zhcode/model-gateway";

/** The system message prefix for tool results. */
const TOOL_RESULT_PREFIX = "[Tool Result";

export async function runAgentLoop(ctx: AgentContext): Promise<AgentResponse> {
  ctx.emit({ type: "thinking", message: "Starting..." });

  while (true) {
    // Check limits / cancellation.
    const { stop, reason } = ctx.shouldStop();
    if (stop) {
      const status =
        reason === "cancelled"
          ? "cancelled"
          : reason?.includes("iteration")
            ? "max_iterations"
            : reason?.includes("tool call")
              ? "max_tool_calls"
              : "error";

      ctx.emit({ type: "error", message: reason ?? "Stopped" });

      return {
        content: "",
        status,
        iterations: ctx.iterations,
        toolCalls: ctx.toolCallCount,
        error: reason,
        messages: ctx.messages,
      };
    }

    ctx.iterations++;
    ctx.emit({
      type: "iteration",
      current: ctx.iterations,
      max: ctx.config.maxIterations,
    });

    // --- Step 1: Call the model ---
    ctx.emit({ type: "model_start", model: ctx.config.model || "default" });

    let modelResponse: ModelResponse;
    try {
      modelResponse = await requestModel(ctx);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      ctx.emit({ type: "error", message: `Model error: ${errorMsg}` });
      return {
        content: "",
        status: "error",
        iterations: ctx.iterations,
        toolCalls: ctx.toolCallCount,
        error: `Model error: ${errorMsg}`,
        messages: ctx.messages,
      };
    }

    ctx.emit({ type: "model_end", response: modelResponse });

    // --- Step 2: Check for tool calls (native first, markdown fallback) ---
    const toolCalls = collectToolCalls(modelResponse);

    if (toolCalls.length === 0) {
      // No tool calls — this is the final response.
      ctx.emit({
        type: "complete",
        response: modelResponse.content,
        iterations: ctx.iterations,
        toolCalls: ctx.toolCallCount,
      });

      return {
        content: modelResponse.content,
        status: "complete",
        iterations: ctx.iterations,
        toolCalls: ctx.toolCallCount,
        messages: ctx.messages,
      };
    }

    // --- Step 3: Execute tool calls ---
    ctx.addMessage("assistant", modelResponse.content);

    for (const toolCall of toolCalls) {
      ctx.toolCallCount++;

      ctx.emit({
        type: "tool_start",
        toolName: toolCall.name,
        input: toolCall.arguments,
      });

      // Check limits again after each tool call.
      const stopCheck = ctx.shouldStop();
      if (stopCheck.stop) {
        return {
          content: "",
          status: "error",
          iterations: ctx.iterations,
          toolCalls: ctx.toolCallCount,
          error: stopCheck.reason,
          messages: ctx.messages,
        };
      }

      // Execute the tool.
      let result: ToolResult;
      try {
        result = await ctx.toolRegistry.execute(
          toolCall.name,
          toolCall.arguments,
          ctx.toolContext,
        );
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        result = {
          success: false,
          data: null,
          message: errorMsg,
        };
      }

      ctx.emit({ type: "tool_result", toolName: toolCall.name, result });

      // Format the tool result for the model conversation.
      const resultMessage = formatToolResult(toolCall.name, result);
      ctx.addMessage("assistant", resultMessage);
    }

    // Loop continues — model will be called again with the tool results.
  }
}

// ---------------------------------------------------------------------------
// Model request (generate or stream)
// ---------------------------------------------------------------------------

/**
 * Request a response from the model, either non-streaming or streaming.
 *
 * When streaming, each text delta is emitted as a `model_delta` event so the
 * UI can render tokens as they arrive. The accumulated content is returned
 * as a regular `ModelResponse`.
 */
async function requestModel(ctx: AgentContext): Promise<ModelResponse> {
  const request = {
    messages: ctx.messages,
    model: ctx.config.model,
  };

  if (!ctx.config.stream) {
    return ctx.gateway.generate(request);
  }

  let content = "";
  let finishReason: ModelResponse["finishReason"] = "stop";
  let usage: ModelResponse["usage"] = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  for await (const chunk of ctx.gateway.stream(request)) {
    if (chunk.delta) {
      content += chunk.delta;
      ctx.emit({ type: "model_delta", delta: chunk.delta });
    }
    if (chunk.done) {
      finishReason = chunk.finishReason ?? finishReason;
      usage = chunk.usage ?? usage;
    }
  }

  return {
    content,
    model: ctx.config.model || "default",
    usage,
    finishReason,
  };
}

// ---------------------------------------------------------------------------
// Tool call parsing
// ---------------------------------------------------------------------------

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Parse tool calls from model content.
 *
 * Expects the model to output tool calls in a structured format:
 * ```tool
 * tool_name
 * { "arg": "value" }
 * ```
 *
 * Or:
 * ```tool name=search_files
 * { "query": "auth" }
 * ```
 */
/**
 * Collect tool calls from a model response.
 * Native `toolCalls` win; otherwise parse markdown ```tool blocks.
 */
export function collectToolCalls(response: ModelResponse): ParsedToolCall[] {
  if (response.toolCalls && response.toolCalls.length > 0) {
    return response.toolCalls.map((call) => {
      let args: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(call.arguments || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        } else {
          args = { raw: call.arguments };
        }
      } catch {
        args = { raw: call.arguments };
      }
      return { name: call.name, arguments: args };
    });
  }
  return parseToolCalls(response.content);
}

export function parseToolCalls(content: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];

  // Match ```tool blocks
  const toolBlockRegex = /```tool\s*(?:name=(\S+))?\s*\n([\s\S]*?)```/g;
  let match;

  while ((match = toolBlockRegex.exec(content)) !== null) {
    const explicitName = match[1];
    const block = match[2]?.trim() ?? "";

    let name: string;
    let argsStr: string;

    if (explicitName) {
      name = explicitName;
      argsStr = block;
    } else {
      // First line is the tool name, rest is JSON args
      const lines = block.split("\n");
      name = lines[0]?.trim() ?? "";
      argsStr = lines.slice(1).join("\n").trim();
    }

    if (!name) continue;

    let args: Record<string, unknown> = {};
    if (argsStr) {
      try {
        args = JSON.parse(argsStr);
      } catch {
        // If JSON parsing fails, try to handle simple key=value
        args = { raw: argsStr };
      }
    }

    calls.push({ name, arguments: args });
  }

  return calls;
}

// ---------------------------------------------------------------------------
// Tool result formatting
// ---------------------------------------------------------------------------

function formatToolResult(toolName: string, result: ToolResult): string {
  const status = result.success ? "success" : "error";
  const dataStr = result.data
    ? typeof result.data === "string"
      ? result.data
      : JSON.stringify(result.data, null, 2)
    : "null";

  return `${TOOL_RESULT_PREFIX}: ${toolName}]\nStatus: ${status}\n${result.message ? `Message: ${result.message}\n` : ""}Data:\n${dataStr}`;
}
