import { AdapterRegistry } from "./adapters/registry.js";
import { loadPlugins } from "./adapters/plugin-loader.js";
import {
  HeartbeatService,
  HeartbeatServiceConfig,
} from "./control-plane/heartbeat.js";
import {
  createControlPlaneApi,
  startControlPlaneServer,
  ControlPlaneApiConfig,
} from "./control-plane/api.js";
import {
  InMemoryRunStore,
  InMemoryRunLogStore,
  InMemoryTaskStore,
  InMemorySessionStore,
} from "./control-plane/store.js";
import { SecurityService, createSecurityServiceFromEnv } from "./security/jwt.js";
import { Agent, Run, Task } from "./types/index.js";

/**
 * Main entry point and factory for the CLI Agent Orchestrator
 */

export interface OrchestratorConfig {
  port?: number;
  jwtSecret?: string;
  jwtExpiresIn?: string;
  plugins?: { type: string; packageName?: string; localPath?: string }[];
  defaultTimeoutSec?: number;
}

export class Orchestrator {
  public registry: AdapterRegistry;
  public heartbeatService: HeartbeatService;
  public securityService: SecurityService;
  public runStore: InMemoryRunStore;
  public logStore: InMemoryRunLogStore;
  public taskStore: InMemoryTaskStore;
  public sessionStore: InMemorySessionStore;

  private server?: ReturnType<typeof startControlPlaneServer>;

  constructor(config: OrchestratorConfig = {}) {
    // Initialize stores
    this.runStore = new InMemoryRunStore();
    this.logStore = new InMemoryRunLogStore();
    this.taskStore = new InMemoryTaskStore();
    this.sessionStore = new InMemorySessionStore();

    // Initialize security
    if (config.jwtSecret) {
      this.securityService = new SecurityService({
        secret: config.jwtSecret,
        expiresIn: config.jwtExpiresIn ?? "1h",
      });
    } else {
      this.securityService = createSecurityServiceFromEnv();
    }

    // Initialize registry (will be populated by loadPlugins)
    this.registry = new AdapterRegistry();

    // Initialize heartbeat service
    this.heartbeatService = new HeartbeatService({
      registry: this.registry,
      runStore: this.runStore,
      logStore: this.logStore,
      taskStore: this.taskStore,
      sessionStore: this.sessionStore,
      securityService: this.securityService,
      defaultTimeoutSec: config.defaultTimeoutSec,
    });
  }

  /**
   * Initialize adapters and plugins
   */
  async initialize(config: OrchestratorConfig = {}): Promise<void> {
    await loadPlugins({
      builtIn: true,
      plugins: config.plugins,
      registry: this.registry,
    });
  }

  /**
   * Start the HTTP API server
   */
  start(port?: number): { app: any; server: any } {
    const apiConfig: ControlPlaneApiConfig = {
      heartbeatService: this.heartbeatService,
      runStore: this.runStore,
      logStore: this.logStore,
      taskStore: this.taskStore,
      sessionStore: this.sessionStore,
      securityService: this.securityService,
      registry: this.registry,
      port: port ?? 3000,
    };

    this.server = startControlPlaneServer(apiConfig);
    console.log(`[Orchestrator] Server started on port ${apiConfig.port}`);
    return this.server;
  }

  /**
   * Stop the server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server?.server) {
        this.server.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Convenience: Create an agent and register it
   */
  async createAgent(agent: Agent): Promise<Agent> {
    // In a real implementation, this would persist to a database
    // For now, we just validate the adapter type exists
    if (!this.registry.has(agent.adapterType)) {
      throw new Error(`Unknown adapter type: ${agent.adapterType}`);
    }
    return agent;
  }

  /**
   * Convenience: Create a task
   */
  async createTask(task: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task> {
    return this.taskStore.create(task);
  }

  /**
   * Convenience: Trigger a run
   */
  async triggerRun(
    agent: Agent,
    options?: { taskId?: string; context?: Record<string, unknown> }
  ): Promise<Run> {
    return this.heartbeatService.createRun(agent, options);
  }
}

// Factory function
export async function createOrchestrator(config: OrchestratorConfig = {}): Promise<Orchestrator> {
  const orchestrator = new Orchestrator(config);
  await orchestrator.initialize(config);
  return orchestrator;
}

// Re-exports
export * from "./types/index.js";
export * from "./adapters/registry.js";
export * from "./adapters/plugin-loader.js";
export * from "./built-in-adapters/index.js";
export * from "./control-plane/heartbeat.js";
export * from "./control-plane/api.js";
export * from "./control-plane/store.js";
export * from "./security/jwt.js";
