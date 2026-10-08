import { describe, expect, test } from "bun:test";
import {
  AuthenticationError,
  ModelGateway,
  ProviderUnavailableError,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type ModelStreamChunk,
  type ProviderInfo,
} from "@zhcode/model-gateway";
import { ModelRouter } from "../src/index";

class FlakyProvider implements ModelProvider {
  readonly name = "flaky";
  attempts = 0;
  constructor(private readonly failTimes: number) {}

  info(): ProviderInfo {
    return {
      name: "flaky",
      models: ["flaky-a", "flaky-b"],
      capabilities: {
        streaming: false,
        toolCalling: false,
        maxContextTokens: 1024,
      },
    };
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    this.attempts++;
    if (this.attempts <= this.failTimes) {
      throw new ProviderUnavailableError("flaky", "down");
    }
    return {
      content: `ok:${request.model}`,
      model: request.model || "flaky-b",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      finishReason: "stop",
    };
  }

  async *stream(): AsyncGenerator<ModelStreamChunk> {
    yield { delta: "", done: true };
  }
}

class AuthFailProvider implements ModelProvider {
  readonly name = "authfail";
  info(): ProviderInfo {
    return {
      name: "authfail",
      models: ["authfail"],
      capabilities: {
        streaming: false,
        toolCalling: false,
        maxContextTokens: 1024,
      },
    };
  }
  async generate(): Promise<ModelResponse> {
    throw new AuthenticationError("authfail");
  }
  async *stream(): AsyncGenerator<ModelStreamChunk> {
    yield { delta: "", done: true };
  }
}

describe("ModelRouter.select", () => {
  test("maps explore to the cheap class", () => {
    const router = new ModelRouter(new ModelGateway());
    const choice = router.select("explore");
    expect(choice.modelClass).toBe("cheap");
    expect(choice.model).toBe("mock-model");
  });

  test("maps review to the strong class", () => {
    const router = new ModelRouter(new ModelGateway(), {
      models: { strong: "deepseek-reasoner", cheap: "mock-model" },
    });
    const choice = router.select("review");
    expect(choice.modelClass).toBe("strong");
    // Active provider is mock, so the resolved model stays mock-model.
    expect(choice.model).toBe("mock-model");
  });

  test("uses mock-model when the active provider is mock", () => {
    const router = new ModelRouter(new ModelGateway(), {
      models: { cheap: "deepseek-chat" },
    });
    expect(router.select("explore").model).toBe("mock-model");
  });
});

describe("ModelRouter.generate", () => {
  test("records token usage on the cost ledger", async () => {
    const router = new ModelRouter(new ModelGateway());
    await router.generate(
      {
        messages: [{ role: "user", content: "hi" }],
        model: "",
      },
      "general",
    );
    expect(router.cost.tokensIn).toBeGreaterThan(0);
    expect(router.cost.byModel["mock-model"]?.calls).toBe(1);
  });

  test("falls back to the next model on retryable errors", async () => {
    const gateway = new ModelGateway();
    const flaky = new FlakyProvider(1);
    gateway.registerProvider("flaky", flaky);
    gateway.setActiveProvider("flaky");
    const router = new ModelRouter(gateway, {
      models: { cheap: "flaky-a" },
      fallbacks: ["flaky-b"],
    });
    const response = await router.generate(
      { messages: [{ role: "user", content: "go" }], model: "flaky-a" },
      "explore",
    );
    expect(response.content).toBe("ok:flaky-b");
    expect(flaky.attempts).toBe(2);
  });

  test("does not fall back on authentication errors", async () => {
    const gateway = new ModelGateway();
    gateway.registerProvider("authfail", new AuthFailProvider());
    gateway.setActiveProvider("authfail");
    const router = new ModelRouter(gateway, { fallbacks: ["mock-model"] });
    await expect(
      router.generate(
        { messages: [{ role: "user", content: "x" }], model: "authfail" },
        "general",
      ),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});

describe("ModelRouter.bind", () => {
  test("returns a ModelClient that generates with the bound task class", async () => {
    const router = new ModelRouter(new ModelGateway());
    const client = router.bind("explore");
    const response = await client.generate({
      messages: [{ role: "user", content: "ping" }],
      model: "",
    });
    expect(response.content).toContain("ping");
    expect(router.cost.byModel["mock-model"]?.calls).toBe(1);
  });
});
