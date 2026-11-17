import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import * as cheerio from "cheerio";
import { policyAnalystAgent, brandResponderAgent } from "../agents/ecommerce-agents";

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
  execute: async ({ inputData }) => {
    const response = await fetch(inputData.policyUrl, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch policy (${response.status}): ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $("script, style, nav, footer, header, noscript, iframe").remove();

    const mainText = $("main").text().trim();
    const bodyText = $("body").text().trim();
    const rawText = mainText.length > 200 ? mainText : bodyText;
    const cleanText = rawText.replace(/\s+/g, " ").trim().slice(0, 6000);

    if (!cleanText) {
      throw new Error("Policy page returned empty text.");
    }

    return {
      storeName: inputData.storeName,
      customerEmail: inputData.customerEmail,
      policyText: cleanText,
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
      abortSignal: AbortSignal.timeout(25000),
    });

    const cleanedJson = response.text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let parsed: { decision?: string; reason?: string } = {};
    try {
      parsed = JSON.parse(cleanedJson);
    } catch {
      parsed = {
        decision: "NEEDS_HUMAN_REVIEW",
        reason: cleanedJson.slice(0, 300),
      };
    }

    const validDecisions = ["ELIGIBLE", "INELIGIBLE", "NEEDS_HUMAN_REVIEW"] as const;
    const decision = validDecisions.includes(parsed.decision as any)
      ? (parsed.decision as (typeof validDecisions)[number])
      : "NEEDS_HUMAN_REVIEW";

    return {
      decision,
      reason: parsed.reason || "Evaluated against store return policy.",
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

    const response = await brandResponderAgent.generate(prompt, {
      abortSignal: AbortSignal.timeout(25000),
    });

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
