import { ServerAdapterModule } from "../types/index.js";

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
}

// Global singleton instance
export const globalRegistry = new AdapterRegistry();
