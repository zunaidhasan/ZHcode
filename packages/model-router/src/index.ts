/**
 * Model Router — which model to call, at what cost, with which fallback.
 *
 * Agents never import this package. The orchestrator selects a model (or a
 * bound client) and injects it into the agent runtime.
 */

import type {
  CostLedger,
  ModelClass,
  TaskClass,
} from "@zhcode/core";
import { createCostLedger, recordUsage } from "@zhcode/core";
import type {
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
} from "@zhcode/model-gateway";
import {
  AuthenticationError,
  ModelGateway,
  ModelGatewayError,
} from "@zhcode/model-gateway";

export interface ModelChoice {
  model: string;
  modelClass: ModelClass;
  taskClass: TaskClass;
}

export interface ModelClient {
  generate(request: ModelRequest): Promise<ModelResponse>;
  stream(request: ModelRequest): AsyncIterable<ModelStreamChunk>;
}

export interface RouterModelMap {
  cheap?: string;
  balanced?: string;
  strong?: string;
  reasoning?: string;
}

export interface ModelRouterOptions {
  /** Per-class model ids. */
  models?: RouterModelMap;
  /** Extra models to try after the primary selection. */
  fallbacks?: string[];
  /** Override the task-class → model-class table. */
  classByTask?: Partial<Record<TaskClass, ModelClass>>;
}

const TASK_CLASS_MAP: Record<TaskClass, ModelClass> = {
  explore: "cheap",
  plan: "balanced",
  code: "balanced",
  test: "cheap",
  review: "strong",
  debug: "reasoning",
  verify: "cheap",
  general: "cheap",
};

const DEFAULT_MODELS: Required<RouterModelMap> = {
  cheap: "deepseek-chat",
  balanced: "deepseek-chat",
  strong: "deepseek-reasoner",
  reasoning: "deepseek-reasoner",
};

function isRetryable(err: unknown): boolean {
  if (err instanceof AuthenticationError) return false;
  if (err instanceof ModelGatewayError) return true;
  return false;
}

export class ModelRouter {
  readonly cost: CostLedger = createCostLedger();
  private readonly gateway: ModelGateway;
  private readonly models: Required<RouterModelMap>;
  private readonly fallbacks: string[];
  private readonly classByTask: Record<TaskClass, ModelClass>;

  constructor(gateway: ModelGateway, options?: ModelRouterOptions) {
    this.gateway = gateway;
    this.models = { ...DEFAULT_MODELS, ...options?.models };
    this.fallbacks = options?.fallbacks ?? [];
    this.classByTask = { ...TASK_CLASS_MAP, ...options?.classByTask };
  }

  /** Choose a model for a task class. Mock provider always stays on mock-model. */
  select(taskClass: TaskClass): ModelChoice {
    const modelClass = this.classByTask[taskClass];
    let model = this.models[modelClass];
    if (this.gateway.activeProvider === "mock") {
      model = "mock-model";
    }
    const envModel = process.env.ZHCODE_MODEL;
    if (envModel && this.gateway.activeProvider !== "mock") {
      model = envModel;
    }
    return { model, modelClass, taskClass };
  }

  /** A ModelClient bound to one task class (for injection into a single agent). */
  bind(taskClass: TaskClass): ModelClient {
    return {
      generate: (request) => this.generate(request, taskClass),
      stream: (request) => this.stream(request, taskClass),
    };
  }

  async generate(
    request: ModelRequest,
    taskClass: TaskClass = "general",
  ): Promise<ModelResponse> {
    const primary = request.model || this.select(taskClass).model;
    const chain = [primary, ...this.fallbacks.filter((m) => m !== primary)];
    let lastError: unknown;

    for (let i = 0; i < chain.length; i++) {
      const model = chain[i]!;
      try {
        const response = await this.gateway.generate({ ...request, model });
        recordUsage(
          this.cost,
          response.model || model,
          response.usage ?? {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        );
        return response;
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || i === chain.length - 1) throw err;
      }
    }

    throw lastError;
  }

  async *stream(
    request: ModelRequest,
    taskClass: TaskClass = "general",
  ): AsyncGenerator<ModelStreamChunk> {
    const model = request.model || this.select(taskClass).model;
    let promptTokens = 0;
    let completionTokens = 0;
    let recorded = false;

    try {
      for await (const chunk of this.gateway.stream({ ...request, model })) {
        if (chunk.done && chunk.usage) {
          promptTokens = chunk.usage.promptTokens;
          completionTokens = chunk.usage.completionTokens;
          recordUsage(this.cost, model, chunk.usage);
          recorded = true;
        }
        yield chunk;
      }
    } finally {
      if (!recorded && (promptTokens > 0 || completionTokens > 0)) {
        recordUsage(this.cost, model, {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        });
      }
    }
  }
}

export type { TaskClass, ModelClass, CostLedger };
