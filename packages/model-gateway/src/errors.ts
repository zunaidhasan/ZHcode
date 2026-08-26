/**
 * Error classes for the Model Gateway.
 *
 * Every error carries enough metadata so the CLI can render a clean
 * user-facing message without leaking raw stack traces.
 */

export class ModelGatewayError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }

  /** Short user-facing description. */
  get userMessage(): string {
    return `Model request failed (provider: ${this.provider}). ${this.message}`;
  }
}

export class AuthenticationError extends ModelGatewayError {
  constructor(provider: string, detail?: string) {
    super(detail ?? "Invalid or missing API key.", provider);
    this.name = "AuthenticationError";
  }

  get userMessage(): string {
    return `⚠ Authentication failed with provider "${this.provider}". Check your API key.`;
  }
}

export class RateLimitError extends ModelGatewayError {
  public readonly retryAfterMs?: number;

  constructor(provider: string, retryAfterMs?: number) {
    super("Rate limit exceeded.", provider);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }

  get userMessage(): string {
    const retry = this.retryAfterMs
      ? ` Retry after ${Math.ceil(this.retryAfterMs / 1000)}s.`
      : "";
    return `⚠ Rate limited by provider "${this.provider}".${retry}`;
  }
}

export class TimeoutError extends ModelGatewayError {
  constructor(provider: string, timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms.`, provider);
    this.name = "TimeoutError";
  }

  get userMessage(): string {
    return `⚠ Request to "${this.provider}" timed out. Try again.`;
  }
}

export class NetworkError extends ModelGatewayError {
  constructor(provider: string, detail?: string) {
    super(detail ?? "Network error.", provider);
    this.name = "NetworkError";
  }

  get userMessage(): string {
    return `⚠ Network error with provider "${this.provider}". Check your connection.`;
  }
}

export class InvalidResponseError extends ModelGatewayError {
  constructor(provider: string, detail?: string) {
    super(detail ?? "Received an invalid response from the model.", provider);
    this.name = "InvalidResponseError";
  }

  get userMessage(): string {
    return `⚠ Invalid response from provider "${this.provider}".`;
  }
}

export class ProviderUnavailableError extends ModelGatewayError {
  constructor(provider: string, detail?: string) {
    super(detail ?? "Provider is currently unavailable.", provider);
    this.name = "ProviderUnavailableError";
  }

  get userMessage(): string {
    return `⚠ Provider "${this.provider}" is unavailable. Try again later.`;
  }
}
