/**
 * DeepSeek provider — a real, low-cost LLM backend.
 *
 * DeepSeek is OpenAI-API-compatible (https://api-docs.deepseek.com). It is one
 * of the cheapest production models available, which fits ZHcode's
 * "cost-aware, near-zero infrastructure cost" goal.
 *
 * Auth: set DEEPSEEK_API_KEY in .env or process.env.
 * Model: set ZHCODE_MODEL or pass model in the request (default: "deepseek-chat").
 */

import type { ModelProvider } from "@zhcode/core";
import type {
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ProviderInfo,
} from "@zhcode/core";
import {
  AuthenticationError,
  InvalidResponseError,
  NetworkError,
  ProviderUnavailableError,
  RateLimitError,
  TimeoutError,
} from "./errors";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// DeepSeekProvider
// ---------------------------------------------------------------------------

export class DeepSeekProvider implements ModelProvider {
  readonly name = "deepseek";
  private readonly config: Required<DeepSeekConfig>;

  constructor(config: DeepSeekConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      model: config.model ?? DEFAULT_MODEL,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  info(): ProviderInfo {
    return {
      name: "deepseek",
      models: [this.config.model, "deepseek-chat", "deepseek-reasoner"],
      capabilities: {
        streaming: true,
        toolCalling: false,
        maxContextTokens: 128_000,
      },
    };
  }

  // -------------------------------------------------------------------------
  // generate (non-streaming)
  // -------------------------------------------------------------------------

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const body = this.buildBody(request, false);
    const json = await this.request("/chat/completions", body);
    return this.parseResponse(json, request.model);
  }

  // -------------------------------------------------------------------------
  // stream
  // -------------------------------------------------------------------------

  async *stream(request: ModelRequest): AsyncGenerator<ModelStreamChunk> {
    const body = this.buildBody(request, true);
    const response = await this.fetch("/chat/completions", body);

    if (!response.ok) {
      await this.handleHttpError(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new InvalidResponseError(
        "deepseek",
        "Response body is not readable.",
      );
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let finishReason: ModelResponse["finishReason"] = "stop";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            yield {
              delta: "",
              done: true,
              usage: {
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
              },
              finishReason,
            };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];

            if (choice?.delta?.content) {
              yield { delta: choice.delta.content, done: false };
            }

            if (choice?.finish_reason) {
              finishReason = choice.finish_reason;
            }

            if (parsed.usage) {
              promptTokens = parsed.usage.prompt_tokens ?? promptTokens;
              completionTokens =
                parsed.usage.completion_tokens ?? completionTokens;
            }
          } catch {
            // Skip malformed SSE lines.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield {
      delta: "",
      done: true,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      finishReason,
    };
  }

  // -------------------------------------------------------------------------
  // Private — HTTP helpers
  // -------------------------------------------------------------------------

  private buildBody(
    request: ModelRequest,
    stream: boolean,
  ): Record<string, unknown> {
    return {
      model: request.model || this.config.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream,
    };
  }

  private async fetch(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      return await fetch(`${this.config.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new TimeoutError("deepseek", this.config.timeoutMs);
      }
      throw new NetworkError("deepseek", String(err));
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetch(path, body);

    if (!response.ok) {
      await this.handleHttpError(response);
    }

    const json = (await response.json()) as Record<string, unknown>;
    return json;
  }

  private async handleHttpError(response: Response): Promise<never> {
    const status = response.status;
    let detail: string;
    try {
      const body = (await response.json()) as Record<string, unknown>;
      detail =
        ((body.error as Record<string, unknown>)?.message as string) ??
        JSON.stringify(body);
    } catch {
      detail = response.statusText;
    }

    if (status === 401 || status === 403) {
      throw new AuthenticationError("deepseek", detail);
    }
    if (status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new RateLimitError(
        "deepseek",
        retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined,
      );
    }
    if (status >= 500) {
      throw new ProviderUnavailableError("deepseek", detail);
    }
    throw new InvalidResponseError("deepseek", detail);
  }

  // -------------------------------------------------------------------------
  // Private — response parsing
  // -------------------------------------------------------------------------

  private parseResponse(
    json: Record<string, unknown>,
    requestedModel: string,
  ): ModelResponse {
    const choices = json.choices as Array<Record<string, unknown>> | undefined;
    const choice = choices?.[0];
    if (!choice) {
      throw new InvalidResponseError(
        "deepseek",
        "Response contained no choices.",
      );
    }

    const message = choice.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content !== "string") {
      throw new InvalidResponseError(
        "deepseek",
        "Response message has no content.",
      );
    }

    const usage = json.usage as Record<string, number> | undefined;

    return {
      content,
      model: (json.model as string) || requestedModel,
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      finishReason: this.mapFinishReason(
        choice.finish_reason as string | undefined,
      ),
    };
  }

  private mapFinishReason(
    reason: string | undefined,
  ): ModelResponse["finishReason"] {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "tool_calls":
        return "tool_calls";
      case "content_filter":
        return "content_filter";
      default:
        return "stop";
    }
  }
}
