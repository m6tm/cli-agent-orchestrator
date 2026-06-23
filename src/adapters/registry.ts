import { ServerAdapterModule, ProviderInfo } from "../types/index.js";

/**
 * Adapter Registry
 * Manages built-in and dynamically loaded adapters
 */

export class AdapterRegistry {
  private adapters = new Map<string, ServerAdapterModule>();

  register(adapter: ServerAdapterModule): void {
    if (this.adapters.has(adapter.type)) {
      throw new Error(`Adapter type '${adapter.type}' is already registered`);
    }
    this.adapters.set(adapter.type, adapter);
  }

  get(type: string): ServerAdapterModule | undefined {
    return this.adapters.get(type);
  }

  has(type: string): boolean {
    return this.adapters.has(type);
  }

  unregister(type: string): boolean {
    return this.adapters.delete(type);
  }

  list(): string[] {
    return Array.from(this.adapters.keys());
  }

  clear(): void {
    this.adapters.clear();
  }

  /**
   * List all providers across all registered adapters
   */
  listProviders(): ProviderInfo[] {
    const providers: ProviderInfo[] = [];
    this.adapters.forEach((adapter) => {
      if (adapter.providers) {
        providers.push(...adapter.providers);
      }
    });
    return providers;
  }

  getProviders(adapterType: string): ProviderInfo[] {
    const adapter = this.adapters.get(adapterType);
    return adapter?.providers ?? [];
  }

  getProvider(providerName: string): ProviderInfo | undefined {
    let found: ProviderInfo | undefined;
    this.adapters.forEach((adapter) => {
      if (!found && adapter.providers) {
        const match = adapter.providers.find((p) => p.name === providerName);
        if (match) found = match;
      }
    });
    return found;
  }
}

// Global singleton instance
export const globalRegistry = new AdapterRegistry();
