import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createControlPlaneApi, ControlPlaneApiConfig } from "../../src/control-plane/api.js";
import {
  InMemoryRunStore,
  InMemoryRunLogStore,
  InMemoryTaskStore,
  InMemorySessionStore,
} from "../../src/control-plane/store.js";
import { HeartbeatService } from "../../src/control-plane/heartbeat.js";
import { SecurityService } from "../../src/security/jwt.js";
import { AdapterRegistry } from "../../src/adapters/registry.js";
import { createGenericCliAdapter } from "../../src/built-in-adapters/generic-cli.js";
import { Agent } from "../../src/types/index.js";

describe("Control Plane API E2E", () => {
  let app: ReturnType<typeof createControlPlaneApi>;
  let runStore: InMemoryRunStore;
  let logStore: InMemoryRunLogStore;
  let taskStore: InMemoryTaskStore;
  let sessionStore: InMemorySessionStore;
  let securityService: SecurityService;
  let heartbeatService: HeartbeatService;
  let registry: AdapterRegistry;
  let adminApiKey: string;

  const mockAgent: Agent = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    companyId: "550e8400-e29b-41d4-a716-446655440001",
    name: "Test Agent",
    adapterType: "generic",
    adapterConfig: { command: "echo", args: ["hello"] },
  };

  beforeEach(() => {
    adminApiKey = "test-admin-key-123";
    process.env.ORCHESTRATOR_ADMIN_API_KEY = adminApiKey;

    runStore = new InMemoryRunStore();
    logStore = new InMemoryRunLogStore();
    taskStore = new InMemoryTaskStore();
    sessionStore = new InMemorySessionStore();
    securityService = new SecurityService({ secret: "a".repeat(32) });
    registry = new AdapterRegistry();
    registry.register(createGenericCliAdapter("generic", { command: "echo", args: ["hello"] }));

    heartbeatService = new HeartbeatService({
      registry,
      runStore,
      logStore,
      taskStore,
      sessionStore,
      securityService,
    });

    const apiConfig: ControlPlaneApiConfig = {
      heartbeatService,
      runStore,
      logStore,
      taskStore,
      sessionStore,
      securityService,
      registry,
    };

    app = createControlPlaneApi(apiConfig);
  });

  afterEach(() => {
    delete process.env.ORCHESTRATOR_ADMIN_API_KEY;
  });

  describe("Health Check", () => {
    it("should return ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });
  });

  describe("Authentication", () => {
    it("should reject requests without admin API key", async () => {
      const res = await request(app).get("/api/v1/adapters");
      expect(res.status).toBe(401);
    });

    it("should accept requests with valid admin API key", async () => {
      const res = await request(app).get("/api/v1/adapters").set("x-api-key", adminApiKey);
      expect(res.status).toBe(200);
    });
  });

  describe("Providers", () => {
    it("should list all providers", async () => {
      const res = await request(app).get("/api/v1/providers").set("x-api-key", adminApiKey);
      expect(res.status).toBe(200);
      expect(res.body.providers).toBeDefined();
      expect(Array.isArray(res.body.providers)).toBe(true);
    });

    it("should get providers for a specific adapter", async () => {
      const res = await request(app).get("/api/v1/adapters/generic/providers").set("x-api-key", adminApiKey);
      expect(res.status).toBe(200);
      expect(res.body.providers).toBeDefined();
    });

    it("should get a specific provider by name", async () => {
      const res = await request(app).get("/api/v1/providers/generic-cli").set("x-api-key", adminApiKey);
      expect(res.status).toBe(200);
      expect(res.body.provider).toBeDefined();
      expect(res.body.provider.name).toBe("generic-cli");
    });

    it("should return 404 for unknown provider", async () => {
      const res = await request(app).get("/api/v1/providers/unknown").set("x-api-key", adminApiKey);
      expect(res.status).toBe(404);
    });
  });

  describe("Agents", () => {
    it("should create an agent", async () => {
      const res = await request(app)
        .post("/api/v1/agents")
        .set("x-api-key", adminApiKey)
        .send(mockAgent);
      expect(res.status).toBe(201);
      expect(res.body.agent.id).toBe(mockAgent.id);
    });

    it("should get an agent", async () => {
      await request(app).post("/api/v1/agents").set("x-api-key", adminApiKey).send(mockAgent);
      const res = await request(app).get(`/api/v1/agents/${mockAgent.id}`).set("x-api-key", adminApiKey);
      expect(res.status).toBe(200);
      expect(res.body.agent.name).toBe("Test Agent");
    });

    it("should return 404 for unknown agent", async () => {
      const res = await request(app)
        .get("/api/v1/agents/unknown-id")
        .set("x-api-key", adminApiKey);
      expect(res.status).toBe(404);
    });
  });

  describe("Runs", () => {
    beforeEach(async () => {
      await request(app).post("/api/v1/agents").set("x-api-key", adminApiKey).send(mockAgent);
    });

    it("should create a run", async () => {
      const res = await request(app)
        .post("/api/v1/runs")
        .set("x-api-key", adminApiKey)
        .send({ agentId: mockAgent.id });
      expect(res.status).toBe(201);
      expect(res.body.run).toBeDefined();
      expect(res.body.authToken).toBeDefined();
    });

    it("should get a run", async () => {
      const createRes = await request(app)
        .post("/api/v1/runs")
        .set("x-api-key", adminApiKey)
        .send({ agentId: mockAgent.id });
      const runId = createRes.body.run.id;

      const res = await request(app).get(`/api/v1/runs/${runId}`).set("x-api-key", adminApiKey);
      expect(res.status).toBe(200);
      expect(res.body.run.id).toBe(runId);
    });

    it("should list runs by agent", async () => {
      await request(app)
        .post("/api/v1/runs")
        .set("x-api-key", adminApiKey)
        .send({ agentId: mockAgent.id });

      const res = await request(app)
        .get(`/api/v1/agents/${mockAgent.id}/runs`)
        .set("x-api-key", adminApiKey);
      expect(res.status).toBe(200);
      expect(res.body.runs).toHaveLength(1);
    });

    it("should cancel a run", async () => {
      // Use a long-running command so we can cancel it
      const longAgent = { ...mockAgent, adapterType: "long", adapterConfig: { command: "sleep", args: ["5"] } };
      registry.register(createGenericCliAdapter("long", { command: "sleep", args: ["5"] }));
      
      await request(app).post("/api/v1/agents").set("x-api-key", adminApiKey).send(longAgent);
      
      const createRes = await request(app)
        .post("/api/v1/runs")
        .set("x-api-key", adminApiKey)
        .send({ agentId: longAgent.id });
      const runId = createRes.body.run.id;

      // Wait for run to start
      await new Promise((resolve) => setTimeout(resolve, 200));

      const res = await request(app)
        .post(`/api/v1/runs/${runId}/cancel`)
        .set("x-api-key", adminApiKey);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should get run logs", async () => {
      const createRes = await request(app)
        .post("/api/v1/runs")
        .set("x-api-key", adminApiKey)
        .send({ agentId: mockAgent.id });
      const runId = createRes.body.run.id;

      // Wait for execution
      await new Promise((resolve) => setTimeout(resolve, 500));

      const res = await request(app).get(`/api/v1/runs/${runId}/logs`).set("x-api-key", adminApiKey);
      expect(res.status).toBe(200);
      expect(res.body.logs).toBeDefined();
    });
  });

  describe("Tasks", () => {
    it("should create a task", async () => {
      const res = await request(app)
        .post("/api/v1/tasks")
        .set("x-api-key", adminApiKey)
        .send({
          agentId: mockAgent.id,
          companyId: mockAgent.companyId,
          key: "TASK-1",
          title: "Test Task",
          priority: 50,
        });
      expect(res.status).toBe(201);
      expect(res.body.task.key).toBe("TASK-1");
    });

    it("should get a task", async () => {
      const createRes = await request(app)
        .post("/api/v1/tasks")
        .set("x-api-key", adminApiKey)
        .send({
          agentId: mockAgent.id,
          companyId: mockAgent.companyId,
          key: "TASK-1",
          title: "Test Task",
          priority: 50,
        });
      const taskId = createRes.body.task.id;

      const res = await request(app).get(`/api/v1/tasks/${taskId}`).set("x-api-key", adminApiKey);
      expect(res.status).toBe(200);
      expect(res.body.task.title).toBe("Test Task");
    });

    it("should list tasks by agent", async () => {
      await request(app)
        .post("/api/v1/tasks")
        .set("x-api-key", adminApiKey)
        .send({
          agentId: mockAgent.id,
          companyId: mockAgent.companyId,
          key: "TASK-1",
          title: "Test Task",
          priority: 50,
        });

      const res = await request(app)
        .get(`/api/v1/agents/${mockAgent.id}/tasks`)
        .set("x-api-key", adminApiKey);
      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
    });
  });

  describe("Agent-facing API", () => {
    let authToken: string;
    let runId: string;

    beforeEach(async () => {
      await request(app).post("/api/v1/agents").set("x-api-key", adminApiKey).send(mockAgent);
      const createRes = await request(app)
        .post("/api/v1/runs")
        .set("x-api-key", adminApiKey)
        .send({ agentId: mockAgent.id });
      authToken = createRes.body.authToken;
      runId = createRes.body.run.id;
    });

    it("should get run context with valid agent token", async () => {
      const res = await request(app).get("/api/v1/agent/run").set("Authorization", `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.run.id).toBe(runId);
    });

    it("should reject agent requests without token", async () => {
      const res = await request(app).get("/api/v1/agent/run");
      expect(res.status).toBe(401);
    });

    it("should complete a run from agent", async () => {
      const res = await request(app)
        .post("/api/v1/agent/run/complete")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ summary: "Done" });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should get next task for agent", async () => {
      // Create a task first
      await request(app)
        .post("/api/v1/tasks")
        .set("x-api-key", adminApiKey)
        .send({
          agentId: mockAgent.id,
          companyId: mockAgent.companyId,
          key: "TASK-1",
          title: "Next Task",
          priority: 50,
        });

      const res = await request(app)
        .get("/api/v1/agent/task/next")
        .set("Authorization", `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.task.title).toBe("Next Task");
    });
  });
});
