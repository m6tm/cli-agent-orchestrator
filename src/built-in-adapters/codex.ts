import { createGenericCliAdapter } from "./generic-cli.js";
import { AdapterExecutionContext, AdapterExecutionResult } from "../types/index.js";

/**
 * Codex CLI adapter
 * Wraps the `codex` CLI tool
 */

export function createCodexAdapter(): ReturnType<typeof createGenericCliAdapter> {
  const base = createGenericCliAdapter("codex", {
    command: "codex",
    args: ["--print"],
    timeoutSec: 600,
    graceSec: 10,
  });

  return {
    ...base,
    execute: async (ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> => {
      const args: string[] = ["--print"];

      // Add prompt
      const prompt = ctx.config.prompt as string | undefined;
      if (prompt) {
        args.push("-p", prompt);
      }

      // Add previous response ID for session continuation
      const previousResponseId = ctx.runtime.sessionParams?.previousResponseId as string | undefined;
      if (previousResponseId) {
        args.push("--previous-response-id", previousResponseId);
      }

      const threadId = ctx.runtime.sessionParams?.threadId as string | undefined;
      if (threadId) {
        args.push("--thread-id", threadId);
      }

      const cwd = (ctx.config.cwd as string) ?? process.env.HOME ?? "/tmp";

      const config = {
        command: "codex",
        args,
        cwd,
        timeoutSec: (ctx.config.timeoutSec as number | undefined) ?? 600,
        graceSec: (ctx.config.graceSec as number | undefined) ?? 10,
      };

      return base.execute(ctx);
    },
    sessionCodec: {
      deserialize(raw: unknown): Record<string, unknown> | null {
        if (raw && typeof raw === "object") {
          const obj = raw as Record<string, unknown>;
          return {
            previousResponseId: obj.previousResponseId,
            threadId: obj.threadId,
            cwd: obj.cwd,
          };
        }
        return null;
      },
      serialize(params: Record<string, unknown> | null): Record<string, unknown> | null {
        if (!params) return null;
        return {
          previousResponseId: params.previousResponseId,
          threadId: params.threadId,
          cwd: params.cwd,
        };
      },
      getDisplayId(params: Record<string, unknown> | null): string | null {
        return (params?.threadId as string) || (params?.previousResponseId as string) || null;
      },
    },
    providers: [
      {
        name: "openai",
        description: "OpenAI API via Codex CLI",
        models: ["gpt-4o", "gpt-4o-mini", "o1-preview", "o1-mini"],
        requiredEnv: ["OPENAI_API_KEY"],
        optionalConfig: ["prompt", "cwd", "timeoutSec", "model"],
      },
    ],
  };
}
