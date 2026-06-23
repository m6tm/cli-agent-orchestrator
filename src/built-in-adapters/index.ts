import { ServerAdapterModule } from "../types/index.js";
import { createClaudeAdapter } from "./claude.js";
import { createCodexAdapter } from "./codex.js";
import { createKimiAdapter } from "./kimi.js";
import { createGenericCliAdapter } from "./generic-cli.js";

/**
 * Built-in adapter registry
 * Maps adapter type names to factory functions
 */

export type BuiltInAdapterType = "generic" | "claude" | "codex" | "kimi";

const builtInFactories: Record<BuiltInAdapterType, () => ServerAdapterModule> = {
  generic: () =>
    createGenericCliAdapter("generic", {
      command: "echo",
      args: ["Generic CLI adapter - configure command in adapterConfig"],
      timeoutSec: 300,
    }),
  claude: createClaudeAdapter,
  codex: createCodexAdapter,
  kimi: createKimiAdapter,
};

export function getBuiltInAdapterTypes(): string[] {
  return Object.keys(builtInFactories);
}

export function createBuiltInAdapter(type: string): ServerAdapterModule | null {
  const factory = builtInFactories[type as BuiltInAdapterType];
  if (!factory) return null;
  return factory();
}

export function isBuiltInAdapter(type: string): boolean {
  return type in builtInFactories;
}

export { createClaudeAdapter, createCodexAdapter, createKimiAdapter, createGenericCliAdapter };
