import { AdapterRegistry, globalRegistry } from "./registry.js";
import { ServerAdapterModule } from "../types/index.js";
import { createBuiltInAdapter, isBuiltInAdapter } from "../built-in-adapters/index.js";

/**
 * Plugin Loader
 * Dynamically loads external adapter plugins and registers built-in adapters
 */

export interface PluginConfig {
  type: string;
  packageName?: string;
  localPath?: string;
}

export interface PluginLoaderOptions {
  builtIn?: boolean;
  plugins?: PluginConfig[];
  registry?: AdapterRegistry;
}

export async function loadPlugins(options: PluginLoaderOptions = {}): Promise<AdapterRegistry> {
  const registry = options.registry ?? globalRegistry;

  // Load built-in adapters first
  if (options.builtIn !== false) {
    const builtInTypes = ["generic", "claude", "codex", "kimi"];
    for (const type of builtInTypes) {
      if (!registry.has(type)) {
        const adapter = createBuiltInAdapter(type);
        if (adapter) {
          registry.register(adapter);
        }
      }
    }
  }

  // Load external plugins
  if (options.plugins) {
    for (const plugin of options.plugins) {
      // Skip if it's a built-in type (built-ins cannot be overridden)
      if (isBuiltInAdapter(plugin.type)) {
        console.warn(`Cannot override built-in adapter type '${plugin.type}'`);
        continue;
      }

      try {
        let modulePath: string;
        if (plugin.localPath) {
          modulePath = plugin.localPath;
        } else if (plugin.packageName) {
          modulePath = plugin.packageName;
        } else {
          throw new Error(`Plugin '${plugin.type}' must have either packageName or localPath`);
        }

        // Dynamic import
        const mod = await import(modulePath);
        const adapterModule: ServerAdapterModule = mod.createServerAdapter?.() ?? mod.default?.();

        if (!adapterModule || typeof adapterModule.execute !== "function") {
          throw new Error(`Plugin '${plugin.type}' does not export a valid adapter`);
        }

        // Ensure the type matches
        if (adapterModule.type !== plugin.type) {
          console.warn(
            `Plugin type mismatch: expected '${plugin.type}', got '${adapterModule.type}'`
          );
        }

        registry.register(adapterModule);
      } catch (err) {
        console.error(`Failed to load plugin '${plugin.type}':`, err);
        throw new Error(
          `Failed to load adapter plugin '${plugin.type}': ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return registry;
}

export { globalRegistry };
