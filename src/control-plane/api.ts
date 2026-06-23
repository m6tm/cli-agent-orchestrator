import express = require("express");
import { Request, Response, NextFunction } from "express";
import {
  Run,
  RunLogEntry,
  Task,
  Agent,
  CreateRunRequest,
  CreateRunResponse,
  ApiError,
} from "../types/index.js";
import { HeartbeatService } from "./heartbeat.js";
import { RunStore, RunLogStore, TaskStore, SessionStore } from "./store.js";
import { SecurityService } from "../security/jwt.js";
import { AdapterRegistry } from "../adapters/registry.js";
import { z } from "zod";

/**
 * Express REST API for the Control Plane
 * Provides endpoints for runs, tasks, logs, and agent-facing operations
 */

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateRunSchema = z.object({
  agentId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  context: z.record(z.unknown()).optional(),
});

const CreateTaskSchema = z.object({
  agentId: z.string().uuid(),
  companyId: z.string().uuid(),
  key: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(100).default(50),
});

const CreateAgentSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string().min(1).max(100),
  adapterType: z.string().min(1),
  adapterConfig: z.record(z.unknown()).default({}),
});

// ============================================================================
// In-memory agent store (replace with DB in production)
// ============================================================================

class AgentStore {
  private agents = new Map<string, Agent>();

  async create(agent: Agent): Promise<Agent> {
    this.agents.set(agent.id, agent);
    return agent;
  }

  async get(id: string): Promise<Agent | null> {
    return this.agents.get(id) ?? null;
  }

  async listByCompany(companyId: string): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter((a) => a.companyId === companyId);
  }
}

// ============================================================================
// API Factory
// ============================================================================

export interface ControlPlaneApiConfig {
  heartbeatService: HeartbeatService;
  runStore: RunStore;
  logStore: RunLogStore;
  taskStore: TaskStore;
  sessionStore: SessionStore;
  securityService: SecurityService;
  registry: AdapterRegistry;
  port?: number;
}

export function createControlPlaneApi(config: ControlPlaneApiConfig): express.Express {
  const app = express();
  const agentStore = new AgentStore();

  app.use(express.json());

  // ============================================================================
  // Middleware
  // ============================================================================

  // Agent authentication middleware
  const authenticateAgent = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ code: "UNAUTHORIZED", message: "Missing or invalid authorization header" });
    }

    const token = authHeader.slice(7);
    try {
      const payload = config.securityService.verifyAgentToken(token);
      (req as any).agentPayload = payload;
      next();
    } catch (err) {
      return res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid token" });
    }
  };

  // Simple admin auth (for demo purposes - use proper auth in production)
  const authenticateAdmin = (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== process.env.ORCHESTRATOR_ADMIN_API_KEY) {
      return res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid admin API key" });
    }
    next();
  };

  // Error handler
  const handleError = (res: Response, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ code: "BAD_REQUEST", message });
  };

  // ============================================================================
  // Agent-facing routes (require agent JWT)
  // ============================================================================

  // Get current run context
  app.get("/api/v1/agent/run", authenticateAgent, async (req, res) => {
    try {
      const payload = (req as any).agentPayload;
      const run = await config.runStore.get(payload.runId);
      if (!run) {
        return res.status(404).json({ code: "NOT_FOUND", message: "Run not found" });
      }
      res.json({ run });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Update run status from agent
  app.post("/api/v1/agent/run/complete", authenticateAgent, async (req, res) => {
    try {
      const payload = (req as any).agentPayload;
      const { summary, resultJson } = req.body;

      await config.runStore.update(payload.runId, {
        status: "completed",
        completedAt: new Date(),
        summary: summary ?? null,
        resultJson: resultJson ?? null,
      });

      res.json({ success: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Get next task for agent
  app.get("/api/v1/agent/task/next", authenticateAgent, async (req, res) => {
    try {
      const payload = (req as any).agentPayload;
      const task = await config.taskStore.nextPending(payload.agentId);
      if (!task) {
        return res.status(204).send();
      }
      res.json({ task });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Update task status
  app.post("/api/v1/agent/task/:taskId/status", authenticateAgent, async (req, res) => {
    try {
      const { taskId } = req.params;
      const { status } = req.body;
      const task = await config.taskStore.update(taskId, { status });
      res.json({ task });
    } catch (err) {
      handleError(res, err);
    }
  });

  // ============================================================================
  // Admin routes (require admin API key)
  // ============================================================================

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // List adapters
  app.get("/api/v1/adapters", authenticateAdmin, (_req, res) => {
    res.json({ adapters: config.registry.list() });
  });

  // List providers
  app.get("/api/v1/providers", authenticateAdmin, (_req, res) => {
    res.json({ providers: config.registry.listProviders() });
  });

  // Get providers for a specific adapter
  app.get("/api/v1/adapters/:adapterType/providers", authenticateAdmin, (req, res) => {
    const providers = config.registry.getProviders(req.params.adapterType);
    res.json({ providers });
  });

  // Get a specific provider by name
  app.get("/api/v1/providers/:providerName", authenticateAdmin, (req, res) => {
    const provider = config.registry.getProvider(req.params.providerName);
    if (!provider) {
      return res.status(404).json({ code: "NOT_FOUND", message: "Provider not found" });
    }
    res.json({ provider });
  });

  // Create agent
  app.post("/api/v1/agents", authenticateAdmin, async (req, res) => {
    try {
      const data = CreateAgentSchema.parse(req.body);
      const agent: Agent = {
        id: data.id,
        companyId: data.companyId,
        name: data.name,
        adapterType: data.adapterType,
        adapterConfig: data.adapterConfig,
      };
      const created = await agentStore.create(agent);
      res.status(201).json({ agent: created });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Get agent
  app.get("/api/v1/agents/:agentId", authenticateAdmin, async (req, res) => {
    try {
      const agent = await agentStore.get(req.params.agentId);
      if (!agent) {
        return res.status(404).json({ code: "NOT_FOUND", message: "Agent not found" });
      }
      res.json({ agent });
    } catch (err) {
      handleError(res, err);
    }
  });

  // List agents by company
  app.get("/api/v1/companies/:companyId/agents", authenticateAdmin, async (req, res) => {
    try {
      const agents = await agentStore.listByCompany(req.params.companyId);
      res.json({ agents });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Create run
  app.post("/api/v1/runs", authenticateAdmin, async (req, res) => {
    try {
      const data = CreateRunSchema.parse(req.body);
      const agent = await agentStore.get(data.agentId);
      if (!agent) {
        return res.status(404).json({ code: "NOT_FOUND", message: "Agent not found" });
      }

      const run = await config.heartbeatService.createRun(agent, {
        taskId: data.taskId,
        context: data.context,
      });

      const authToken = config.securityService.generateAgentToken(agent, run.id);
      res.status(201).json({ run, authToken } as CreateRunResponse);
    } catch (err) {
      handleError(res, err);
    }
  });

  // Get run
  app.get("/api/v1/runs/:runId", authenticateAdmin, async (req, res) => {
    try {
      const run = await config.runStore.get(req.params.runId);
      if (!run) {
        return res.status(404).json({ code: "NOT_FOUND", message: "Run not found" });
      }
      res.json({ run });
    } catch (err) {
      handleError(res, err);
    }
  });

  // List runs by agent
  app.get("/api/v1/agents/:agentId/runs", authenticateAdmin, async (req, res) => {
    try {
      const runs = await config.runStore.listByAgent(req.params.agentId);
      res.json({ runs });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Cancel run
  app.post("/api/v1/runs/:runId/cancel", authenticateAdmin, async (req, res) => {
    try {
      const success = await config.heartbeatService.cancelRun(req.params.runId);
      if (!success) {
        return res.status(400).json({ code: "BAD_REQUEST", message: "Run is not active" });
      }
      res.json({ success: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Get run logs
  app.get("/api/v1/runs/:runId/logs", authenticateAdmin, async (req, res) => {
    try {
      const logs = await config.heartbeatService.getRunLogs(req.params.runId);
      res.json({ logs });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Create task
  app.post("/api/v1/tasks", authenticateAdmin, async (req, res) => {
    try {
      const data = CreateTaskSchema.parse(req.body);
      const taskData: Omit<Task, "id" | "createdAt" | "updatedAt"> = {
        agentId: data.agentId,
        companyId: data.companyId,
        key: data.key,
        title: data.title,
        description: data.description ?? "",
        status: "pending",
        priority: data.priority,
      };
      const task = await config.taskStore.create(taskData);
      res.status(201).json({ task });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Get task
  app.get("/api/v1/tasks/:taskId", authenticateAdmin, async (req, res) => {
    try {
      const task = await config.taskStore.get(req.params.taskId);
      if (!task) {
        return res.status(404).json({ code: "NOT_FOUND", message: "Task not found" });
      }
      res.json({ task });
    } catch (err) {
      handleError(res, err);
    }
  });

  // List tasks by agent
  app.get("/api/v1/agents/:agentId/tasks", authenticateAdmin, async (req, res) => {
    try {
      const tasks = await config.taskStore.listByAgent(req.params.agentId);
      res.json({ tasks });
    } catch (err) {
      handleError(res, err);
    }
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ code: "INTERNAL_ERROR", message: err.message });
  });

  return app;
}

export function startControlPlaneServer(
  config: ControlPlaneApiConfig & { port?: number }
): { app: express.Express; server: ReturnType<express.Express["listen"]> } {
  const app = createControlPlaneApi(config);
  const port = config.port ?? 3000;

  const server = app.listen(port, () => {
    console.log(`Control plane API listening on port ${port}`);
  });

  return { app, server };
}
