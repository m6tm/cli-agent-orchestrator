/**
 * Core types for the CLI Agent Orchestrator
 * Defines contracts between control plane, adapters, and agent CLI processes
 */

// ============================================================================
// Agent & Runtime Types
// ============================================================================

export interface Agent {
  id: string;
  companyId: string;
  name: string;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
}

export interface AgentSession {
  id: string;
  agentId: string;
  taskId?: string;
  adapterType: string;
  params: Record<string, unknown>;
  displayId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Execution Context & Results
// ============================================================================

export interface AdapterExecutionContext {
  runId: string;
  agent: Agent;
  runtime: {
    sessionId: string | null;
    sessionParams: Record<string, unknown> | null;
    sessionDisplayId: string | null;
    taskKey: string | null;
  };
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
  onMeta?: (meta: Record<string, unknown>) => Promise<void>;
  authToken?: string;
}

export interface AdapterExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  errorMessage?: string | null;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
  };
  sessionParams?: Record<string, unknown> | null;
  model?: string | null;
  provider?: string | null;
  biller?: string | null;
  costUsd?: number | null;
  summary?: string | null;
  clearSession?: boolean;
  resultJson?: Record<string, unknown> | null;
}

// ============================================================================
// Adapter Contract
// ============================================================================

export interface AdapterSessionCodec {
  deserialize(raw: unknown): Record<string, unknown> | null;
  serialize(params: Record<string, unknown> | null): Record<string, unknown> | null;
  getDisplayId?(params: Record<string, unknown> | null): string | null;
}

export interface ServerAdapterModule {
  type: string;
  execute: (ctx: AdapterExecutionContext) => Promise<AdapterExecutionResult>;
  testEnvironment?: (ctx: AdapterExecutionContext) => Promise<boolean>;
  sessionCodec?: AdapterSessionCodec;
  models?: string[];
  agentConfigurationDoc?: string;
}

// ============================================================================
// Run & Task Types
// ============================================================================

export type RunStatus = 
  | "queued" 
  | "running" 
  | "completed" 
  | "failed" 
  | "cancelled" 
  | "timed_out";

export interface Run {
  id: string;
  agentId: string;
  companyId: string;
  status: RunStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  errorMessage: string | null;
  summary: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens?: number;
  } | null;
  costUsd: number | null;
  model: string | null;
  sessionParams: Record<string, unknown> | null;
  clearSession: boolean;
  resultJson: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunLogEntry {
  id: string;
  runId: string;
  stream: "stdout" | "stderr";
  chunk: string;
  timestamp: Date;
}

export interface Task {
  id: string;
  agentId: string;
  companyId: string;
  key: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Environment Variables
// ============================================================================

export interface AgentEnvironment {
  ORCHESTRATOR_API_URL: string;
  ORCHESTRATOR_API_KEY: string;
  ORCHESTRATOR_RUN_ID: string;
  ORCHESTRATOR_AGENT_ID: string;
  ORCHESTRATOR_COMPANY_ID: string;
  ORCHESTRATOR_TASK_ID?: string;
  ORCHESTRATOR_WAKE_REASON?: string;
  ORCHESTRATOR_WAKE_COMMENT_ID?: string;
  ORCHESTRATOR_APPROVAL_ID?: string;
  ORCHESTRATOR_APPROVAL_STATUS?: string;
  ORCHESTRATOR_LINKED_ISSUE_IDS?: string;
  ORCHESTRATOR_WORKSPACES_JSON?: string;
}

// ============================================================================
// API Types
// ============================================================================

export interface CreateRunRequest {
  agentId: string;
  taskId?: string;
  context?: Record<string, unknown>;
}

export interface CreateRunResponse {
  run: Run;
  authToken: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
