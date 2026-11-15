import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { policyAnalystAgent, brandResponderAgent } from "./agents/ecommerce-agents";
import { returnTriageWorkflow } from "./workflows/return-triage-workflow";

export const mastra = new Mastra({
  storage: new PostgresStore({
    id: "neon-storage",
    connectionString: process.env.DATABASE_URL!,
  }),
  agents: { policyAnalystAgent, brandResponderAgent },
  workflows: { returnTriageWorkflow },
});
