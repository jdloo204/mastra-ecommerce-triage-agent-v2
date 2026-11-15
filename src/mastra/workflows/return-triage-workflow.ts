import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { policyAnalystAgent, brandResponderAgent } from "../agents/ecommerce-agents";
import { scrapePolicyTool } from "../tools/scrape-policy-tool";

const triageInputSchema = z.object({
  storeName: z.string(),
  policyUrl: z.string().url(),
  customerEmail: z.string(),
});

const fetchPolicyStep = createStep({
  id: "fetch-policy",
  inputSchema: triageInputSchema,
  outputSchema: z.object({
    storeName: z.string(),
    customerEmail: z.string(),
    policyText: z.string(),
  }),
  execute: async ({ inputData, runtimeContext }) => {
    const scraped = await scrapePolicyTool.execute({
      context: { url: inputData.policyUrl },
      runtimeContext,
    });

    return {
      storeName: inputData.storeName,
      customerEmail: inputData.customerEmail,
      policyText: scraped.policyText,
    };
  },
});

const analyzePolicyStep = createStep({
  id: "analyze-policy",
  inputSchema: z.object({
    storeName: z.string(),
    customerEmail: z.string(),
    policyText: z.string(),
  }),
  outputSchema: z.object({
    decision: z.enum(["ELIGIBLE", "INELIGIBLE", "NEEDS_HUMAN_REVIEW"]),
    reason: z.string(),
    customerEmail: z.string(),
    storeName: z.string(),
  }),
  execute: async ({ inputData }) => {
    const prompt = `
      Store: ${inputData.storeName}
      Scraped Return Policy: ${inputData.policyText}
      Customer Email: ${inputData.customerEmail}
    `;

    const response = await policyAnalystAgent.generate(prompt, {
      structuredOutput: {
        schema: z.object({
          decision: z.enum(["ELIGIBLE", "INELIGIBLE", "NEEDS_HUMAN_REVIEW"]),
          reason: z.string(),
        }),
      },
    });

    return {
      ...response.object,
      customerEmail: inputData.customerEmail,
      storeName: inputData.storeName,
    };
  },
});

const draftReplyStep = createStep({
  id: "draft-reply",
  inputSchema: z.object({
    decision: z.enum(["ELIGIBLE", "INELIGIBLE", "NEEDS_HUMAN_REVIEW"]),
    reason: z.string(),
    customerEmail: z.string(),
    storeName: z.string(),
  }),
  outputSchema: z.object({
    decision: z.string(),
    reason: z.string(),
    draftedReply: z.string(),
  }),
  execute: async ({ inputData }) => {
    const prompt = `
      Store Name: ${inputData.storeName}
      Decision: ${inputData.decision}
      Policy Reason: ${inputData.reason}
      Original Customer Email: ${inputData.customerEmail}
    `;

    const response = await brandResponderAgent.generate(prompt);

    return {
      decision: inputData.decision,
      reason: inputData.reason,
      draftedReply: response.text,
    };
  },
});

export const returnTriageWorkflow = createWorkflow({
  id: "return-triage-workflow",
  inputSchema: triageInputSchema,
  outputSchema: z.object({
    decision: z.string(),
    reason: z.string(),
    draftedReply: z.string(),
  }),
})
  .then(fetchPolicyStep)
  .then(analyzePolicyStep)
  .then(draftReplyStep)
  .commit();
