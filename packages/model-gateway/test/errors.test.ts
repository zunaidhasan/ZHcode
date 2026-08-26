import { describe, expect, test } from "bun:test";
import {
  ModelGatewayError,
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  NetworkError,
  InvalidResponseError,
  ProviderUnavailableError,
} from "../src/errors";

describe("ModelGatewayError", () => {
  test("has name, message, and provider", () => {
    const err = new ModelGatewayError("something broke", "test-provider");
    expect(err.name).toBe("ModelGatewayError");
    expect(err.message).toBe("something broke");
    expect(err.provider).toBe("test-provider");
  });

  test("includes cause when provided", () => {
    const cause = new Error("root cause");
    const err = new ModelGatewayError("failed", "p", cause);
    expect(err.cause).toBe(cause);
  });

  test("userMessage includes provider name", () => {
    const err = new ModelGatewayError("bad", "my-provider");
    expect(err.userMessage).toContain("my-provider");
  });
});

describe("AuthenticationError", () => {
  test("default message about API key", () => {
    const err = new AuthenticationError("openrouter");
    expect(err.message).toContain("API key");
    expect(err.userMessage).toContain("Authentication failed");
    expect(err.userMessage).toContain("openrouter");
  });

  test("custom detail message", () => {
    const err = new AuthenticationError("openrouter", "key expired");
    expect(err.message).toBe("key expired");
  });
});

describe("RateLimitError", () => {
  test("without retry-after", () => {
    const err = new RateLimitError("openrouter");
    expect(err.userMessage).toContain("Rate limited");
    expect(err.retryAfterMs).toBeUndefined();
  });

  test("with retry-after", () => {
    const err = new RateLimitError("openrouter", 5000);
    expect(err.retryAfterMs).toBe(5000);
    expect(err.userMessage).toContain("5s");
  });
});

describe("TimeoutError", () => {
  test("includes timeout in message", () => {
    const err = new TimeoutError("openrouter", 30000);
    expect(err.message).toContain("30000");
    expect(err.userMessage).toContain("timed out");
  });
});

describe("NetworkError", () => {
  test("default network error message", () => {
    const err = new NetworkError("openrouter");
    expect(err.userMessage).toContain("Network error");
    expect(err.userMessage).toContain("openrouter");
  });

  test("custom detail", () => {
    const err = new NetworkError("openrouter", "connection refused");
    expect(err.message).toBe("connection refused");
  });
});

describe("InvalidResponseError", () => {
  test("default message", () => {
    const err = new InvalidResponseError("openrouter");
    expect(err.userMessage).toContain("Invalid response");
  });

  test("custom detail", () => {
    const err = new InvalidResponseError("openrouter", "empty body");
    expect(err.message).toBe("empty body");
  });
});

describe("ProviderUnavailableError", () => {
  test("default message", () => {
    const err = new ProviderUnavailableError("openrouter");
    expect(err.userMessage).toContain("unavailable");
  });

  test("custom detail", () => {
    const err = new ProviderUnavailableError("openrouter", "maintenance");
    expect(err.message).toBe("maintenance");
  });
});
