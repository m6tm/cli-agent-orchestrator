# CLI Agent Orchestrator

A production-ready boilerplate for orchestrating local CLI AI agents (Claude Code, Codex, Kimi, etc.). This system separates the **control plane** (task management, scheduling, governance) from the **execution plane** (local CLI processes that run the actual AI agents).

## Architecture

```
┌─────────────────────────────────────┐
│           Control Plane             │
│  - Tasks / Runs / Heartbeats        │
│  - REST API                         │
│  - Session Management               │
│  - JWT Security                     │
└──────────────┬──────────────────────┘
               │ invoke(ctx)
               ▼
┌─────────────────────────────────────┐
│           Adapter Layer             │
│  Built-in: generic, claude,       │
│  codex, kimi + Plugin system        │
└──────────────┬──────────────────────┘
               │ spawn(child_process)
               ▼
┌─────────────────────────────────────┐
│      Agent CLI (Claude, Codex,      │
│      Kimi, Custom...)               │
│  - LLM interne                      │
│  - Outils propres                   │
│  - Peut appeler l'API du control    │
│    plane pour lire/écrire le state  │
└─────────────────────────────────────┘
```

## Features

- **Adapter System**: Built-in adapters for Claude Code, Codex, Kimi, and generic CLI tools
- **Plugin Loader**: Dynamically load external adapter plugins without modifying core code
- **Session Management**: Persist and resume agent sessions across runs
- **Security**: JWT-based authentication scoped to company + agent
- **REST API**: Full CRUD for agents, runs, tasks, and logs
- **Live Logs**: Real-time stdout/stderr capture during execution
- **Task Queue**: Priority-based task scheduling per agent
- **In-Memory Stores**: Replaceable with database-backed implementations

## Quick Start

```bash
# Install dependencies
npm install

# Set required environment variables
export ORCHESTRATOR_JWT_SECRET="your-super-secret-key-min-32-chars"
export ORCHESTRATOR_ADMIN_API_KEY="your-admin-api-key"

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Start the server
npm run dev
```

## API Endpoints

### Admin Routes (require `x-api-key` header)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/adapters` | List available adapters |
| POST | `/api/v1/agents` | Create agent |
| GET | `/api/v1/agents/:id` | Get agent |
| GET | `/api/v1/companies/:id/agents` | List agents by company |
| POST | `/api/v1/runs` | Create and start a run |
| GET | `/api/v1/runs/:id` | Get run |
| GET | `/api/v1/agents/:id/runs` | List runs by agent |
| POST | `/api/v1/runs/:id/cancel` | Cancel active run |
| GET | `/api/v1/runs/:id/logs` | Get run logs |
| POST | `/api/v1/tasks` | Create task |
| GET | `/api/v1/tasks/:id` | Get task |
| GET | `/api/v1/agents/:id/tasks` | List tasks by agent |

### Agent Routes (require `Authorization: Bearer <token>`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/agent/run` | Get current run context |
| POST | `/api/v1/agent/run/complete` | Complete run from agent |
| GET | `/api/v1/agent/task/next` | Get next pending task |
| POST | `/api/v1/agent/task/:id/status` | Update task status |

## Usage Example

```typescript
import { createOrchestrator } from "cli-agent-orchestrator";

const orchestrator = await createOrchestrator({
  jwtSecret: "your-secret-key-here-must-be-32-chars-long",
  port: 3000,
});

// Create an agent
const agent = await orchestrator.createAgent({
  id: "agent-1",
  companyId: "company-1",
  name: "My Claude Agent",
  adapterType: "claude",
  adapterConfig: {
    prompt: "Fix the bug in the auth module",
    cwd: "/path/to/project",
  },
});

// Trigger a run
const run = await orchestrator.triggerRun(agent, {
  context: { taskId: "task-123" },
});

console.log(`Run started: ${run.id}`);
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ORCHESTRATOR_JWT_SECRET` | Yes | - | JWT signing secret (min 32 chars) |
| `ORCHESTRATOR_JWT_EXPIRES_IN` | No | `1h` | Token expiration |
| `ORCHESTRATOR_ADMIN_API_KEY` | Yes | - | Admin API key |
| `ORCHESTRATOR_API_URL` | No | `http://localhost:3000` | API base URL |

### Agent Configuration

```json
{
  "adapterType": "claude",
  "adapterConfig": {
    "prompt": "Your task description",
    "cwd": "/workspace/project",
    "timeoutSec": 600,
    "skillsDir": "/path/to/skills"
  }
}
```

## Plugin Development

Create a custom adapter plugin:

```typescript
// my-adapter.ts
import { ServerAdapterModule } from "cli-agent-orchestrator";

export function createServerAdapter(): ServerAdapterModule {
  return {
    type: "my_agent",
    execute: async (ctx) => {
      // Spawn your CLI, capture output, return result
      return { exitCode: 0, signal: null, timedOut: false };
    },
    sessionCodec: {
      deserialize: (raw) => raw as Record<string, unknown>,
      serialize: (params) => params,
    },
  };
}
```

Load it dynamically:

```typescript
await orchestrator.initialize({
  plugins: [
    { type: "my_agent", localPath: "./my-adapter.ts" }
  ],
});
```

## Testing

```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage report (threshold: 80% lines/statements)
npm run test:coverage
```

## Project Structure

```
src/
├── types/              # Core TypeScript interfaces
├── adapters/           # Registry & plugin loader
├── built-in-adapters/  # Generic, Claude, Codex, Kimi adapters
├── control-plane/      # Heartbeat service, REST API, stores
├── security/           # JWT authentication
└── index.ts            # Main orchestrator factory

tests/
├── unit/               # Unit tests for all modules
└── e2e/                # API integration tests
```

## License

MIT
