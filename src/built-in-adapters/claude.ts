import { createGenericCliAdapter } from "./generic-cli.js";
import { AdapterExecutionContext, AdapterExecutionResult } from "../types/index.js";

/**
 * Claude Code adapter
 * Wraps the `claude` CLI tool
 */

export function createClaudeAdapter(): ReturnType<typeof createGenericCliAdapter> {
  const base = createGenericCliAdapter("claude", {
    command: "claude",
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
        args.push("--prompt", prompt);
      }

      // Add session args if available
      const sessionId = ctx.runtime.sessionParams?.sessionId as string | undefined;
      if (sessionId) {
        args.push("--session", sessionId);
      }

      // Add skills directory if provided
      const skillsDir = ctx.config.skillsDir as string | undefined;
      if (skillsDir) {
        args.push("--add-dir", skillsDir);
      }

      const cwd = (ctx.config.cwd as string) ?? process.env.HOME ?? "/tmp";

      const config = {
        command: "claude",
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
  };
}
