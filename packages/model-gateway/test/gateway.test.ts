import { describe, expect, test } from "bun:test";
import { ModelGateway } from "../src/gateway";

describe("ModelGateway construction", () => {
  test("defaults to mock provider", () => {
    const gw = new ModelGateway();
    expect(gw.activeProvider).toBe("mock");
  });

  test("lists mock as a registered provider", () => {
    const gw = new ModelGateway();
    expect(gw.listProviders()).toContain("mock");
  });

  test("registers openrouter when API key is in env", () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const gw = new ModelGateway();
    expect(gw.listProviders()).toContain("openrouter");
    delete process.env.OPENROUTER_API_KEY;
  });

  test("skips openrouter when no API key", () => {
    delete process.env.OPENROUTER_API_KEY;
    const gw = new ModelGateway();
    expect(gw.listProviders()).not.toContain("openrouter");
  });
});

describe("ModelGateway.setActiveProvider()", () => {
  test("switches to a registered provider", () => {
    const gw = new ModelGateway();
    gw.setActiveProvider("mock");
    expect(gw.activeProvider).toBe("mock");
  });

  test("throws for unknown provider", () => {
    const gw = new ModelGateway();
    expect(() => gw.setActiveProvider("nonexistent")).toThrow(
      /Unknown provider/,
    );
  });
});

describe("ModelGateway.getProviderInfo()", () => {
  test("returns info for the active provider", () => {
    const gw = new ModelGateway();
    const info = gw.getProviderInfo();
    expect(info.name).toBe("mock");
  });

  test("returns info for a named provider", () => {
    const gw = new ModelGateway();
    const info = gw.getProviderInfo("mock");
    expect(info.name).toBe("mock");
  });
});

describe("ModelGateway.generate()", () => {
  test("generates a response via mock provider", async () => {
    const gw = new ModelGateway();
    const res = await gw.generate({
      messages: [{ role: "user", content: "hello" }],
      model: "mock-model",
    });

    expect(res.content).toContain("ZHcode model gateway");
    expect(res.finishReason).toBe("stop");
    expect(res.usage.totalTokens).toBeGreaterThanOrEqual(0);
  });

  test("throws for unknown provider", async () => {
    const gw = new ModelGateway();
    try {
      await gw.generate(
        { messages: [{ role: "user", content: "hi" }], model: "test" },
        "nonexistent",
      );
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
    }
  });
});

describe("ModelGateway.stream()", () => {
  test("streams chunks from mock provider", async () => {
    const gw = new ModelGateway();
    let lastChunk;

    for await (const chunk of gw.stream({
      messages: [{ role: "user", content: "hello" }],
      model: "mock-model",
    })) {
      lastChunk = chunk;
    }

    expect(lastChunk).toBeDefined();
    expect(lastChunk!.done).toBe(true);
  });
});
