import {
  Run,
  RunStatus,
  Agent,
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "../types/index.js";
import { AdapterRegistry } from "../adapters/registry.js";
import { RunStore, RunLogStore, TaskStore, SessionStore } from "./store.js";
import { SecurityService } from "../security/jwt.js";
import { globalRegistry } from "../adapters/plugin-loader.js";

/**
 * Heartbeat Service
 * Orchestrates agent runs: schedules, executes, and persists results
 */

export interface HeartbeatServiceConfig {
  registry?: AdapterRegistry;
  runStore: RunStore;
  logStore: RunLogStore;
  taskStore: TaskStore;
  sessionStore: SessionStore;
  securityService: SecurityService;
  defaultTimeoutSec?: number;
}

export class HeartbeatService {
  private registry: AdapterRegistry;
  private runStore: RunStore;
  private logStore: RunLogStore;
  private taskStore: TaskStore;
  private sessionStore: SessionStore;
  private securityService: SecurityService;
  private defaultTimeoutSec: number;
  private activeRuns = new Map<string, AbortController>();

  constructor(config: HeartbeatServiceConfig) {
    this.registry = config.registry ?? globalRegistry;
    this.runStore = config.runStore;
    this.logStore = config.logStore;
    this.taskStore = config.taskStore;
    this.sessionStore = config.sessionStore;
    this.securityService = config.securityService;
    this.defaultTimeoutSec = config.defaultTimeoutSec ?? 300;
  }

  /**
   * Create and start a new run for an agent
   */
  async createRun(
    agent: Agent,
    options: {
      taskId?: string;
      context?: Record<string, unknown>;
      timeoutSec?: number;
    } = {}
  ): Promise<Run> {
    const runId = crypto.randomUUID();

    // Create run record
    const run = await this.runStore.create({
      id: runId,
      agentId: agent.id,
      companyId: agent.companyId,
      status: "queued",
      startedAt: null,
      completedAt: null,
      exitCode: null,
      signal: null,
      timedOut: false,
      errorMessage: null,
      summary: null,
      usage: null,
      costUsd: null,
      model: null,
      sessionParams: null,
      clearSession: false,
      resultJson: null,
    });

    // Start execution in background
    this.executeRun(agent, run, options).catch((err) => {
      console.error(`Run ${runId} execution error:`, err);
    });

    return run;
  }

  /**
   * Execute a run
   */
  private async executeRun(
    agent: Agent,
    run: Run,
    options: {
      taskId?: string;
      context?: Record<string, unknown>;
      timeoutSec?: number;
    }
  ): Promise<void> {
    const abortController = new AbortController();
    this.activeRuns.set(run.id, abortController);

    try {
      // Update status to running
      await this.runStore.update(run.id, { status: "running", startedAt: new Date() });

      // Get adapter
      const adapter = this.registry.get(agent.adapterType);
      if (!adapter) {
        throw new Error(`Unknown adapter type: ${agent.adapterType}`);
      }

      // Get session
      let session = await this.sessionStore.getByAgent(agent.id);
      let sessionParams = session?.params ?? null;

      // Check session CWD mismatch
      const currentCwd = (agent.adapterConfig.cwd as string) ?? process.env.HOME ?? "/tmp";
      if (sessionParams?.cwd && sessionParams.cwd !== currentCwd) {
        // CWD mismatch - start fresh session
        sessionParams = null;
        if (session) {
          await this.sessionStore.delete(session.id);
          session = null;
        }
      }

      // Generate auth token
      const authToken = this.securityService.generateAgentToken(agent, run.id);

      // Build execution context
      const ctx: AdapterExecutionContext = {
        runId: run.id,
        agent,
        runtime: {
          sessionId: session?.id ?? null,
          sessionParams,
          sessionDisplayId: adapter.sessionCodec?.getDisplayId?.(sessionParams) ?? null,
          taskKey: options.taskId ?? null,
        },
        config: agent.adapterConfig,
        context: {
          taskId: options.taskId,
          wakeReason: "manual",
          ...options.context,
        },
        onLog: async (stream, chunk) => {
          await this.logStore.append({ runId: run.id, stream, chunk });
        },
        authToken,
      };

      // Execute
      const result = await adapter.execute(ctx);

      // Handle session
      if (result.clearSession && session) {
        await this.sessionStore.delete(session.id);
        session = null;
      } else if (result.sessionParams) {
        if (session) {
          await this.sessionStore.update(session.id, {
            params: result.sessionParams,
            adapterType: agent.adapterType,
          });
        } else {
          await this.sessionStore.create({
            agentId: agent.id,
            taskId: options.taskId,
            adapterType: agent.adapterType,
            params: result.sessionParams,
            displayId: adapter.sessionCodec?.getDisplayId?.(result.sessionParams) ?? undefined,
          });
        }
      }

      // Determine final status
      let status: RunStatus = "completed";
      if (result.timedOut) {
        status = "timed_out";
      } else if (result.exitCode !== 0 && result.exitCode !== null) {
        status = "failed";
      } else if (result.errorMessage) {
        status = "failed";
      }

      // Update run
      await this.runStore.update(run.id, {
        status,
        completedAt: new Date(),
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut,
        errorMessage: result.errorMessage,
        summary: result.summary,
        usage: result.usage ?? null,
        costUsd: result.costUsd ?? null,
        model: result.model ?? null,
        sessionParams: result.sessionParams ?? null,
        clearSession: result.clearSession ?? false,
        resultJson: result.resultJson ?? null,
      });

      // Update task if applicable
      if (options.taskId) {
        await this.taskStore.update(options.taskId, {
          status: status === "completed" ? "completed" : "failed",
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.runStore.update(run.id, {
        status: "failed",
        completedAt: new Date(),
        errorMessage,
      });

      if (options.taskId) {
        await this.taskStore.update(options.taskId, { status: "failed" });
      }
    } finally {
      this.activeRuns.delete(run.id);
    }
  }

  /**
   * Cancel a running run
   */
  async cancelRun(runId: string): Promise<boolean> {
    const controller = this.activeRuns.get(runId);
    if (!controller) return false;

    controller.abort();
    await this.runStore.update(runId, {
      status: "cancelled",
      completedAt: new Date(),
    });
    this.activeRuns.delete(runId);
    return true;
  }

  /**
   * Check if a run is active
   */
  isRunActive(runId: string): boolean {
    return this.activeRuns.has(runId);
  }

  /**
   * Get run logs
   */
  async getRunLogs(runId: string): Promise<{ stream: string; chunk: string; timestamp: Date }[]> {
    const logs = await this.logStore.getByRun(runId);
    return logs.map((l) => ({ stream: l.stream, chunk: l.chunk, timestamp: l.timestamp }));
  }
}
