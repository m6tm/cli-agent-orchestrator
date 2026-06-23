import { Run, RunStatus, RunLogEntry, Task, AgentSession } from "../types/index.js";

/**
 * In-memory stores for runs, logs, tasks, and sessions
 * In production, replace with database-backed implementations
 */

export interface RunStore {
  create(run: Omit<Run, "createdAt" | "updatedAt">): Promise<Run>;
  get(id: string): Promise<Run | null>;
  update(id: string, updates: Partial<Run>): Promise<Run | null>;
  listByAgent(agentId: string): Promise<Run[]>;
  listByCompany(companyId: string): Promise<Run[]>;
  delete(id: string): Promise<boolean>;
}

export interface RunLogStore {
  append(entry: Omit<RunLogEntry, "id" | "timestamp">): Promise<RunLogEntry>;
  getByRun(runId: string): Promise<RunLogEntry[]>;
  deleteByRun(runId: string): Promise<void>;
}

export interface TaskStore {
  create(task: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task>;
  get(id: string): Promise<Task | null>;
  update(id: string, updates: Partial<Task>): Promise<Task | null>;
  listByAgent(agentId: string): Promise<Task[]>;
  nextPending(agentId: string): Promise<Task | null>;
  delete(id: string): Promise<boolean>;
}

export interface SessionStore {
  create(session: Omit<AgentSession, "id" | "createdAt" | "updatedAt">): Promise<AgentSession>;
  get(id: string): Promise<AgentSession | null>;
  getByAgent(agentId: string): Promise<AgentSession | null>;
  update(id: string, updates: Partial<AgentSession>): Promise<AgentSession | null>;
  delete(id: string): Promise<boolean>;
  deleteByAgent(agentId: string): Promise<void>;
}

// ============================================================================
// In-Memory Implementations
// ============================================================================

export class InMemoryRunStore implements RunStore {
  private runs = new Map<string, Run>();

  async create(run: Omit<Run, "createdAt" | "updatedAt">): Promise<Run> {
    const now = new Date();
    const fullRun: Run = {
      ...run,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.id, fullRun);
    return fullRun;
  }

  async get(id: string): Promise<Run | null> {
    return this.runs.get(id) ?? null;
  }

  async update(id: string, updates: Partial<Run>): Promise<Run | null> {
    const existing = this.runs.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.runs.set(id, updated);
    return updated;
  }

  async listByAgent(agentId: string): Promise<Run[]> {
    return Array.from(this.runs.values())
      .filter((r) => r.agentId === agentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listByCompany(companyId: string): Promise<Run[]> {
    return Array.from(this.runs.values())
      .filter((r) => r.companyId === companyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async delete(id: string): Promise<boolean> {
    return this.runs.delete(id);
  }
}

export class InMemoryRunLogStore implements RunLogStore {
  private logs: RunLogEntry[] = [];

  async append(entry: Omit<RunLogEntry, "id" | "timestamp">): Promise<RunLogEntry> {
    const fullEntry: RunLogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    this.logs.push(fullEntry);
    return fullEntry;
  }

  async getByRun(runId: string): Promise<RunLogEntry[]> {
    return this.logs
      .filter((l) => l.runId === runId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async deleteByRun(runId: string): Promise<void> {
    this.logs = this.logs.filter((l) => l.runId !== runId);
  }
}

export class InMemoryTaskStore implements TaskStore {
  private tasks = new Map<string, Task>();

  async create(task: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task> {
    const id = crypto.randomUUID();
    const now = new Date();
    const fullTask: Task = {
      ...task,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(id, fullTask);
    return fullTask;
  }

  async get(id: string): Promise<Task | null> {
    return this.tasks.get(id) ?? null;
  }

  async update(id: string, updates: Partial<Task>): Promise<Task | null> {
    const existing = this.tasks.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.tasks.set(id, updated);
    return updated;
  }

  async listByAgent(agentId: string): Promise<Task[]> {
    return Array.from(this.tasks.values())
      .filter((t) => t.agentId === agentId)
      .sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async nextPending(agentId: string): Promise<Task | null> {
    const pending = await this.listByAgent(agentId);
    return pending.find((t) => t.status === "pending") ?? null;
  }

  async delete(id: string): Promise<boolean> {
    return this.tasks.delete(id);
  }
}

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, AgentSession>();

  async create(session: Omit<AgentSession, "id" | "createdAt" | "updatedAt">): Promise<AgentSession> {
    const id = crypto.randomUUID();
    const now = new Date();
    const fullSession: AgentSession = {
      ...session,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(id, fullSession);
    return fullSession;
  }

  async get(id: string): Promise<AgentSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async getByAgent(agentId: string): Promise<AgentSession | null> {
    return Array.from(this.sessions.values()).find((s) => s.agentId === agentId) ?? null;
  }

  async update(id: string, updates: Partial<AgentSession>): Promise<AgentSession | null> {
    const existing = this.sessions.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.sessions.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async deleteByAgent(agentId: string): Promise<void> {
    const toDelete: string[] = [];
    this.sessions.forEach((session, id) => {
      if (session.agentId === agentId) {
        toDelete.push(id);
      }
    });
    for (const id of toDelete) {
      this.sessions.delete(id);
    }
  }
}
