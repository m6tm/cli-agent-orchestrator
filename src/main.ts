import { createOrchestrator } from "./index.js";

async function main() {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const orchestrator = await createOrchestrator({ port });
  orchestrator.start(port);
  console.log(`[Orchestrator] Server started on port ${port}`);
}

main().catch(console.error);
