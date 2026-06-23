import { describe, it, expect, beforeEach } from "vitest";
import { loadPlugins, globalRegistry } from "../../src/adapters/plugin-loader.js";
import { AdapterRegistry } from "../../src/adapters/registry.js";
import { createGenericCliAdapter } from "../../src/built-in-adapters/generic-cli.js";

describe("Plugin Loader", () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  it("should load built-in adapters", async () => {
    await loadPlugins({ builtIn: true, registry });
    expect(registry.has("generic")).toBe(true);
    expect(registry.has("claude")).toBe(true);
    expect(registry.has("codex")).toBe(true);
    expect(registry.has("kimi")).toBe(true);
  });

  it("should not load built-ins when builtIn is false", async () => {
    await loadPlugins({ builtIn: false, registry });
    expect(registry.list()).toHaveLength(0);
  });

  it("should not override built-in adapters with plugins", async () => {
    await loadPlugins({
      builtIn: true,
      registry,
      plugins: [{ type: "generic", packageName: "some-package" }],
    });
    // Should still have the built-in generic adapter
    expect(registry.has("generic")).toBe(true);
  });

  it("should throw for plugin without packageName or localPath", async () => {
    await expect(
      loadPlugins({
        builtIn: false,
        registry,
        plugins: [{ type: "custom" }],
      })
    ).rejects.toThrow("must have either packageName or localPath");
  });

  it("should handle plugin load failure", async () => {
    await expect(
      loadPlugins({
        builtIn: false,
        registry,
        plugins: [{ type: "custom", packageName: "non-existent-package-12345" }],
      })
    ).rejects.toThrow("Failed to load adapter plugin");
  });
});

describe("Built-in Adapters", () => {
  it("should create generic adapter", () => {
    const adapter = createGenericCliAdapter("generic", { command: "echo" });
    expect(adapter.type).toBe("generic");
    expect(typeof adapter.execute).toBe("function");
    expect(adapter.sessionCodec).toBeDefined();
  });

  it("should test environment for generic adapter", async () => {
    const adapter = createGenericCliAdapter("generic", { command: "node", args: ["--version"] });
    const mockCtx = { config: { command: "node" } } as any;
    const result = await adapter.testEnvironment?.(mockCtx);
    expect(result).toBe(true);
  });
});
