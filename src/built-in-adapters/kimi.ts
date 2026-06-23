import { createGenericCliAdapter } from "./generic-cli.js";
import { AdapterExecutionContext, AdapterExecutionResult } from "../types/index.js";

/**
 * Kimi Code adapter
 * Wraps the `kimi` CLI tool
 */

export function createKimiAdapter(): ReturnType<typeof createGenericCliAdapter> {
  const base = createGenericCliAdapter("kimi", {
    command: "kimi",
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

      // Add output format
      const outputFormat = (ctx.config.outputFormat as string | undefined) ?? "stream-json";
      args.push("--output-format", outputFormat);

      // Add session ID for continuation
      const sessionId = ctx.runtime.sessionParams?.sessionId as string | undefined;
      if (sessionId) {
        args.push("-r", sessionId);
      }

      const cwd = (ctx.config.cwd as string) ?? process.env.HOME ?? "/tmp";

      const config = {
        command: "kimi",
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
            sessionId: obj.sessionId,
            cwd: obj.cwd,
          };
        }
        return null;
      },
      serialize(params: Record<string, unknown> | null): Record<string, unknown> | null {
        if (!params) return null;
        return {
          sessionId: params.sessionId,
          cwd: params.cwd,
        };
      },
      getDisplayId(params: Record<string, unknown> | null): string | null {
        return (params?.sessionId as string) || null;
      },
    },
    providers: [
      {
        name: "kimi",
        description: "Moonshot Kimi API via Kimi Code CLI",
        models: ["kimi-k1", "kimi-k2", "kimi-k2.5"],
        requiredEnv: ["KIMI_API_KEY"],
        optionalConfig: ["prompt", "cwd", "outputFormat", "timeoutSec", "model"],
      },
    ],
  };
}
