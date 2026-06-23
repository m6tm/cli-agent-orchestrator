import { createOrchestrator } from "./index.js";

async function main() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const jwtSecret = process.env.ORCHESTRATOR_JWT_SECRET || "dev-secret-min-32-chars-long-for-local";
  const orchestrator = await createOrchestrator({ port, jwtSecret });
  orchestrator.start(port);
  console.log(`[Orchestrator] Server started on port ${port}`);
}

main().catch(console.error);
