import { spawn, ChildProcess } from "node:child_process";
import { env as processEnv } from "node:process";
import {
  AdapterExecutionContext,
  AdapterExecutionResult,
  ServerAdapterModule,
  AdapterSessionCodec,
} from "../types/index.js";

/**
 * Generic CLI adapter that can execute any command-line tool.
 * This is the most basic adapter - specific adapters extend this pattern.
 */

const defaultSessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown): Record<string, unknown> | null {
    if (raw && typeof raw === "object") return raw as Record<string, unknown>;
    return null;
  },
  serialize(params: Record<string, unknown> | null): Record<string, unknown> | null {
    return params;
  },
  getDisplayId(params: Record<string, unknown> | null): string | null {
    if (!params) return null;
    return (params.sessionId as string) || (params.displayId as string) || null;
  },
};

export interface GenericCliAdapterConfig {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutSec?: number;
  graceSec?: number;
  env?: Record<string, string>;
  sessionCodec?: AdapterSessionCodec;
}

function buildOrchestratorEnv(ctx: AdapterExecutionContext): Record<string, string> {
  const env: Record<string, string> = {
    ORCHESTRATOR_API_URL: processEnv.ORCHESTRATOR_API_URL || "http://localhost:3000",
    ORCHESTRATOR_API_KEY: ctx.authToken || "",
    ORCHESTRATOR_RUN_ID: ctx.runId,
    ORCHESTRATOR_AGENT_ID: ctx.agent.id,
    ORCHESTRATOR_COMPANY_ID: ctx.agent.companyId,
  };

  const taskId = ctx.context.taskId as string | undefined;
  if (taskId) env.ORCHESTRATOR_TASK_ID = taskId;

  const wakeReason = ctx.context.wakeReason as string | undefined;
  if (wakeReason) env.ORCHESTRATOR_WAKE_REASON = wakeReason;

  const wakeCommentId = ctx.context.wakeCommentId as string | undefined;
  if (wakeCommentId) env.ORCHESTRATOR_WAKE_COMMENT_ID = wakeCommentId;

  const approvalId = ctx.context.approvalId as string | undefined;
  if (approvalId) env.ORCHESTRATOR_APPROVAL_ID = approvalId;

  const approvalStatus = ctx.context.approvalStatus as string | undefined;
  if (approvalStatus) env.ORCHESTRATOR_APPROVAL_STATUS = approvalStatus;

  const linkedIssueIds = ctx.context.linkedIssueIds as string[] | undefined;
  if (linkedIssueIds?.length) env.ORCHESTRATOR_LINKED_ISSUE_IDS = JSON.stringify(linkedIssueIds);

  const workspaces = ctx.context.workspaces as Record<string, unknown> | undefined;
  if (workspaces) env.ORCHESTRATOR_WORKSPACES_JSON = JSON.stringify(workspaces);

  return env;
}

export async function executeGenericCli(
  ctx: AdapterExecutionContext,
  adapterConfig: GenericCliAdapterConfig
): Promise<AdapterExecutionResult> {
  const command = adapterConfig.command;
  const args = adapterConfig.args ?? [];
  const cwd = adapterConfig.cwd ?? processEnv.HOME ?? "/tmp";
  const timeoutSec = adapterConfig.timeoutSec ?? 300;
  const graceSec = adapterConfig.graceSec ?? 5;

  const env: Record<string, string> = {
    ...processEnv,
    ...buildOrchestratorEnv(ctx),
    ...(adapterConfig.env ?? {}),
  };

  // Add session params if available
  if (ctx.runtime.sessionParams) {
    for (const [key, value] of Object.entries(ctx.runtime.sessionParams)) {
      env[`ORCHESTRATOR_SESSION_${key.toUpperCase()}`] = String(value);
    }
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let killed = false;
    let killTimer: NodeJS.Timeout | null = null;

    let proc: ChildProcess;
    try {
      proc = spawn(command, args, { cwd, env });
    } catch (err) {
      resolve({
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `Failed to spawn process: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    const timeout = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
      killTimer = setTimeout(() => {
        proc.kill("SIGKILL");
      }, graceSec * 1000);
    }, timeoutSec * 1000);

    proc.stdout?.on("data", async (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      await ctx.onLog("stdout", text);
    });

    proc.stderr?.on("data", async (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      await ctx.onLog("stderr", text);
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `Process error: ${err.message}`,
      });
    });

    proc.on("exit", (exitCode, signal) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);

      // Try to parse structured result from stdout
      let resultJson: Record<string, unknown> | null = null;
      let sessionParams: Record<string, unknown> | null = null;
      let summary: string | null = null;
      let usage: AdapterExecutionResult["usage"] = undefined;
      let model: string | null = null;
      let costUsd: number | null = null;

      try {
        const lines = stdout.split("\n").filter((l) => l.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "result") {
              resultJson = parsed;
              summary = parsed.summary ?? null;
              usage = parsed.usage ?? undefined;
              model = parsed.model ?? null;
              costUsd = parsed.costUsd ?? null;
            }
            if (parsed.type === "session") {
              sessionParams = parsed.params ?? null;
            }
          } catch {
            // Not JSON, ignore
          }
        }
      } catch {
        // Ignore parse errors
      }

      // If no structured result, use last non-empty line as summary
      if (!summary) {
        const lines = stdout.split("\n").filter((l) => l.trim());
        summary = lines.length > 0 ? lines[lines.length - 1].slice(0, 500) : null;
      }

      resolve({
        exitCode: exitCode ?? null,
        signal: signal ?? null,
        timedOut: killed,
        errorMessage: stderr || null,
        usage,
        sessionParams,
        model,
        costUsd,
        summary,
      });
    });
  });
}

export function createGenericCliAdapter(
  type: string,
  defaultConfig: Omit<GenericCliAdapterConfig, "command"> & { command: string }
): ServerAdapterModule {
  return {
    type,
    execute: (ctx: AdapterExecutionContext) => {
      const config: GenericCliAdapterConfig = {
        command: (ctx.config.command as string) ?? defaultConfig.command,
        args: (ctx.config.args as string[] | undefined) ?? defaultConfig.args,
        cwd: (ctx.config.cwd as string | undefined) ?? defaultConfig.cwd,
        timeoutSec: (ctx.config.timeoutSec as number | undefined) ?? defaultConfig.timeoutSec,
        graceSec: (ctx.config.graceSec as number | undefined) ?? defaultConfig.graceSec,
        env: { ...(defaultConfig.env ?? {}), ...(ctx.config.env as Record<string, string> | undefined) },
      };
      return executeGenericCli(ctx, config);
    },
    testEnvironment: async (ctx: AdapterExecutionContext) => {
      const cmd = (ctx.config.command as string) ?? defaultConfig.command;
      try {
        const testProc = spawn(cmd, ["--version"], { shell: false });
        return new Promise((resolve) => {
          testProc.on("error", () => resolve(false));
          testProc.on("exit", (code) => resolve(code === 0));
        });
      } catch {
        return false;
      }
    },
    sessionCodec: defaultConfig.sessionCodec ?? defaultSessionCodec,
    providers: [
      {
        name: "generic-cli",
        description: "Generic CLI adapter that can execute any command-line tool",
        models: [],
        requiredEnv: [],
        optionalConfig: ["command", "args", "cwd", "timeoutSec", "graceSec", "env"],
      },
    ],
  };
}
