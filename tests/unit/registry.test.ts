import { describe, it, expect, beforeEach } from "vitest";
import { AdapterRegistry } from "../../src/adapters/registry.js";
import { ServerAdapterModule } from "../../src/types/index.js";

describe("AdapterRegistry", () => {
  let registry: AdapterRegistry;

  const mockAdapter: ServerAdapterModule = {
    type: "test",
    execute: async () => ({
      exitCode: 0,
      signal: null,
      timedOut: false,
    }),
  };

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  it("should register an adapter", () => {
    registry.register(mockAdapter);
    expect(registry.has("test")).toBe(true);
  });

  it("should retrieve a registered adapter", () => {
    registry.register(mockAdapter);
    const adapter = registry.get("test");
    expect(adapter).toBeDefined();
    expect(adapter?.type).toBe("test");
  });

  it("should throw when registering duplicate adapter", () => {
    registry.register(mockAdapter);
    expect(() => registry.register(mockAdapter)).toThrow("already registered");
  });

  it("should return undefined for unknown adapter", () => {
    const adapter = registry.get("unknown");
    expect(adapter).toBeUndefined();
  });

  it("should list all registered adapters", () => {
    registry.register(mockAdapter);
    registry.register({ ...mockAdapter, type: "test2" });
    expect(registry.list()).toEqual(["test", "test2"]);
  });

  it("should unregister an adapter", () => {
    registry.register(mockAdapter);
    expect(registry.unregister("test")).toBe(true);
    expect(registry.has("test")).toBe(false);
  });

  it("should return false when unregistering unknown adapter", () => {
    expect(registry.unregister("unknown")).toBe(false);
  });

  it("should clear all adapters", () => {
    registry.register(mockAdapter);
    registry.clear();
    expect(registry.list()).toEqual([]);
  });

  it("should list providers across all adapters", () => {
    registry.register({
      ...mockAdapter,
      providers: [
        { name: "provider-a", models: ["model-1"] },
      ],
    });
    registry.register({
      type: "test2",
      execute: async () => ({ exitCode: 0, signal: null, timedOut: false }),
      providers: [
        { name: "provider-b", models: ["model-2"] },
      ],
    });
    const providers = registry.listProviders();
    expect(providers).toHaveLength(2);
    expect(providers.map((p) => p.name)).toContain("provider-a");
    expect(providers.map((p) => p.name)).toContain("provider-b");
  });

  it("should get providers for a specific adapter", () => {
    registry.register({
      ...mockAdapter,
      providers: [
        { name: "provider-a", models: ["model-1"] },
      ],
    });
    const providers = registry.getProviders("test");
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe("provider-a");
  });

  it("should return empty array for adapter without providers", () => {
    registry.register(mockAdapter);
    expect(registry.getProviders("test")).toEqual([]);
  });

  it("should get a specific provider by name", () => {
    registry.register({
      ...mockAdapter,
      providers: [
        { name: "provider-a", description: "Test provider" },
      ],
    });
    const provider = registry.getProvider("provider-a");
    expect(provider).toBeDefined();
    expect(provider?.name).toBe("provider-a");
    expect(provider?.description).toBe("Test provider");
  });

  it("should return undefined for unknown provider", () => {
    expect(registry.getProvider("unknown")).toBeUndefined();
  });
});
