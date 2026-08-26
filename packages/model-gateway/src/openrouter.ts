/**
 * OpenRouter provider — the first real LLM backend.
 *
 * Uses the OpenRouter API (https://openrouter.ai/docs) which provides
 * access to DeepSeek, Claude, GPT, Gemini, and many other models.
 *
 * Auth: set OPENROUTER_API_KEY in .env or process.env.
 * Model: set ZHCODE_MODEL (default: "deepseek/deepseek-chat").
 */

import type { ModelProvider } from "./provider";
import type {
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ProviderInfo,
} from "./types";
import {
  AuthenticationError,
  NetworkError,
  RateLimitError,
  TimeoutError,
  InvalidResponseError,
  ProviderUnavailableError,
} from "./errors";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "deepseek/deepseek-chat";
const DEFAULT_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// OpenRouterProvider
// ---------------------------------------------------------------------------

export class OpenRouterProvider implements ModelProvider {
  readonly name = "openrouter";
  private readonly config: Required<OpenRouterConfig>;

  constructor(config: OpenRouterConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      model: config.model ?? DEFAULT_MODEL,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  info(): ProviderInfo {
    return {
      name: "openrouter",
      models: [this.config.model],
      capabilities: {
        streaming: true,
        toolCalling: true,
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
        "openrouter",
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

    // If we reach here without [DONE], yield a final chunk.
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
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs,
    );

    try {
      return await fetch(`${this.config.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://zhcode.dev",
          "X-Title": "ZHcode",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new TimeoutError("openrouter", this.config.timeoutMs);
      }
      if (err instanceof TypeError) {
        throw new NetworkError("openrouter", String(err));
      }
      throw new NetworkError("openrouter", String(err));
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
        (body.error as Record<string, unknown>)?.message as string ??
        JSON.stringify(body);
    } catch {
      detail = response.statusText;
    }

    if (status === 401 || status === 403) {
      throw new AuthenticationError("openrouter", detail);
    }
    if (status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new RateLimitError(
        "openrouter",
        retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined,
      );
    }
    if (status >= 500) {
      throw new ProviderUnavailableError("openrouter", detail);
    }
    throw new InvalidResponseError("openrouter", detail);
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
        "openrouter",
        "Response contained no choices.",
      );
    }

    const message = choice.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content !== "string") {
      throw new InvalidResponseError(
        "openrouter",
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
