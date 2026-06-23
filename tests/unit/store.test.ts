import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryRunStore,
  InMemoryRunLogStore,
  InMemoryTaskStore,
  InMemorySessionStore,
} from "../../src/control-plane/store.js";
import { Run, RunLogEntry, Task, AgentSession } from "../../src/types/index.js";

describe("InMemoryRunStore", () => {
  let store: InMemoryRunStore;

  beforeEach(() => {
    store = new InMemoryRunStore();
  });

  it("should create a run", async () => {
    const run = await store.create({
      id: "run-1",
      agentId: "agent-1",
      companyId: "company-1",
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
    expect(run.id).toBe("run-1");
    expect(run.status).toBe("queued");
    expect(run.createdAt).toBeInstanceOf(Date);
  });

  it("should get a run by id", async () => {
    await store.create({
      id: "run-1",
      agentId: "agent-1",
      companyId: "company-1",
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
    const run = await store.get("run-1");
    expect(run).not.toBeNull();
    expect(run?.id).toBe("run-1");
  });

  it("should return null for unknown run", async () => {
    const run = await store.get("unknown");
    expect(run).toBeNull();
  });

  it("should update a run", async () => {
    await store.create({
      id: "run-1",
      agentId: "agent-1",
      companyId: "company-1",
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
    const updated = await store.update("run-1", { status: "running" });
    expect(updated?.status).toBe("running");
  });

  it("should return null when updating unknown run", async () => {
    const updated = await store.update("unknown", { status: "running" });
    expect(updated).toBeNull();
  });

  it("should list runs by agent", async () => {
    await store.create({
      id: "run-1",
      agentId: "agent-1",
      companyId: "company-1",
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
    await store.create({
      id: "run-2",
      agentId: "agent-1",
      companyId: "company-1",
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
    await store.create({
      id: "run-3",
      agentId: "agent-2",
      companyId: "company-1",
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
    const runs = await store.listByAgent("agent-1");
    expect(runs).toHaveLength(2);
  });

  it("should delete a run", async () => {
    await store.create({
      id: "run-1",
      agentId: "agent-1",
      companyId: "company-1",
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
    expect(await store.delete("run-1")).toBe(true);
    expect(await store.get("run-1")).toBeNull();
  });
});

describe("InMemoryRunLogStore", () => {
  let store: InMemoryRunLogStore;

  beforeEach(() => {
    store = new InMemoryRunLogStore();
  });

  it("should append logs", async () => {
    const entry = await store.append({
      runId: "run-1",
      stream: "stdout",
      chunk: "Hello world",
    });
    expect(entry.chunk).toBe("Hello world");
    expect(entry.id).toBeDefined();
    expect(entry.timestamp).toBeInstanceOf(Date);
  });

  it("should get logs by run", async () => {
    await store.append({ runId: "run-1", stream: "stdout", chunk: "line1" });
    await store.append({ runId: "run-1", stream: "stderr", chunk: "error1" });
    await store.append({ runId: "run-2", stream: "stdout", chunk: "other" });
    const logs = await store.getByRun("run-1");
    expect(logs).toHaveLength(2);
  });

  it("should delete logs by run", async () => {
    await store.append({ runId: "run-1", stream: "stdout", chunk: "line1" });
    await store.deleteByRun("run-1");
    const logs = await store.getByRun("run-1");
    expect(logs).toHaveLength(0);
  });
});

describe("InMemoryTaskStore", () => {
  let store: InMemoryTaskStore;

  beforeEach(() => {
    store = new InMemoryTaskStore();
  });

  it("should create a task", async () => {
    const task = await store.create({
      agentId: "agent-1",
      companyId: "company-1",
      key: "TASK-1",
      title: "Test Task",
      description: "A test task",
      status: "pending",
      priority: 50,
    });
    expect(task.key).toBe("TASK-1");
    expect(task.status).toBe("pending");
  });

  it("should get next pending task", async () => {
    await store.create({
      agentId: "agent-1",
      companyId: "company-1",
      key: "TASK-1",
      title: "First",
      description: "",
      status: "pending",
      priority: 50,
    });
    await store.create({
      agentId: "agent-1",
      companyId: "company-1",
      key: "TASK-2",
      title: "Second",
      description: "",
      status: "completed",
      priority: 50,
    });
    const next = await store.nextPending("agent-1");
    expect(next?.key).toBe("TASK-1");
  });

  it("should return null when no pending tasks", async () => {
    const next = await store.nextPending("agent-1");
    expect(next).toBeNull();
  });

  it("should list tasks by priority", async () => {
    await store.create({
      agentId: "agent-1",
      companyId: "company-1",
      key: "LOW",
      title: "Low",
      description: "",
      status: "pending",
      priority: 10,
    });
    await store.create({
      agentId: "agent-1",
      companyId: "company-1",
      key: "HIGH",
      title: "High",
      description: "",
      status: "pending",
      priority: 90,
    });
    const tasks = await store.listByAgent("agent-1");
    expect(tasks[0].key).toBe("HIGH");
    expect(tasks[1].key).toBe("LOW");
  });
});

describe("InMemorySessionStore", () => {
  let store: InMemorySessionStore;

  beforeEach(() => {
    store = new InMemorySessionStore();
  });

  it("should create a session", async () => {
    const session = await store.create({
      agentId: "agent-1",
      adapterType: "generic",
      params: { sessionId: "sess-1" },
    });
    expect(session.params.sessionId).toBe("sess-1");
  });

  it("should get session by agent", async () => {
    await store.create({ agentId: "agent-1", adapterType: "generic", params: {} });
    const session = await store.getByAgent("agent-1");
    expect(session).not.toBeNull();
  });

  it("should delete sessions by agent", async () => {
    await store.create({ agentId: "agent-1", adapterType: "generic", params: {} });
    await store.deleteByAgent("agent-1");
    const session = await store.getByAgent("agent-1");
    expect(session).toBeNull();
  });
});
