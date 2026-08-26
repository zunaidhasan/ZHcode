/**
 * ModelGateway — the central orchestrator.
 *
 * Holds a registry of providers and routes requests to the active one.
 * This is the only class the CLI / agent runtime interacts with.
 */

import type { ModelProvider } from "./provider";
import type {
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ProviderInfo,
} from "./types";
import { MockProvider } from "./mock";
import { OpenRouterProvider } from "./openrouter";
import type { OpenRouterConfig } from "./openrouter";
import { ModelGatewayError } from "./errors";

// ---------------------------------------------------------------------------
// Gateway configuration
// ---------------------------------------------------------------------------

export interface GatewayConfig {
  /** Which provider to use by default (default: "mock"). */
  defaultProvider?: string;
  /** OpenRouter config — only needed if using the openrouter provider. */
  openrouter?: Partial<OpenRouterConfig>;
  /** Model override (applied to every request if set). */
  model?: string;
}

// ---------------------------------------------------------------------------
// ModelGateway
// ---------------------------------------------------------------------------

export class ModelGateway {
  private readonly providers = new Map<string, ModelProvider>();
  private activeProviderName: string;

  constructor(config?: GatewayConfig) {
    this.activeProviderName = config?.defaultProvider ?? "mock";

    // Always register the mock provider.
    this.providers.set("mock", new MockProvider());

    // Register OpenRouter if config or env vars are available.
    this.tryRegisterOpenRouter(config?.openrouter);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Set the active provider by name. */
  setActiveProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new ModelGatewayError(
        `Unknown provider: "${name}". Available: ${this.listProviders().join(", ")}`,
        name,
      );
    }
    this.activeProviderName = name;
  }

  /** Get the currently active provider name. */
  get activeProvider(): string {
    return this.activeProviderName;
  }

  /** List all registered provider names. */
  listProviders(): string[] {
    return [...this.providers.keys()];
  }

  /** Get info about a specific provider. */
  getProviderInfo(name?: string): ProviderInfo {
    const provider = this.getProvider(name ?? this.activeProviderName);
    return provider.info();
  }

  /** Send a non-streaming request. */
  async generate(
    request: ModelRequest,
    providerName?: string,
  ): Promise<ModelResponse> {
    const provider = this.getProvider(
      providerName ?? this.activeProviderName,
    );
    const model = request.model || this.resolveModel();
    return provider.generate({ ...request, model });
  }

  /** Send a streaming request. */
  async *stream(
    request: ModelRequest,
    providerName?: string,
  ): AsyncGenerator<ModelStreamChunk> {
    const provider = this.getProvider(
      providerName ?? this.activeProviderName,
    );
    const model = request.model || this.resolveModel();
    yield* provider.stream({ ...request, model });
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private getProvider(name: string): ModelProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new ModelGatewayError(
        `Provider "${name}" not registered. Available: ${this.listProviders().join(", ")}`,
        name,
      );
    }
    return provider;
  }

  private resolveModel(): string {
    // Allow env override, then config, then let provider decide.
    return process.env.ZHCODE_MODEL ?? "";
  }

  private tryRegisterOpenRouter(
    partialConfig?: Partial<OpenRouterConfig>,
  ): void {
    try {
      // We try to read the key synchronously from process.env first.
      // If it's not there, we skip registration — the user can set it
      // later and the gateway will pick it up on next construction.
      const apiKey =
        partialConfig?.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
      if (!apiKey) return;

      const config: OpenRouterConfig = {
        apiKey,
        ...partialConfig,
      };
      this.providers.set("openrouter", new OpenRouterProvider(config));
    } catch {
      // If env reading fails, silently skip — mock is always available.
    }
  }
}
