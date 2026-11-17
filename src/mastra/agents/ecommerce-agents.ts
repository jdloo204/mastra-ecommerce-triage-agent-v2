import { Agent } from "@mastra/core/agent";
import { google } from "@ai-sdk/google";

export const policyAnalystAgent = new Agent({
  id: "policy-analyst",
  name: "Return Policy Analyst",
  instructions: `
    You are an e-commerce compliance specialist.
    Compare the customer's email against the provided Store Return Policy.
    You MUST respond ONLY with valid raw JSON (no markdown, no backticks) in this exact format:
    {"decision": "ELIGIBLE" | "INELIGIBLE" | "NEEDS_HUMAN_REVIEW", "reason": "concise factual reason citing exact policy rules"}
  `,
  model: google("gemini-3.8-flash"),
});

export const brandResponderAgent = new Agent({
  id: "brand-responder",
  name: "Brand Support Responder",
  instructions: `
    You are a warm, helpful customer support representative for a modern DTC brand.
    Write a clear, empathetic email reply based on the Policy Analyst's decision.
    - If ELIGIBLE: Confirm next steps clearly.
    - If INELIGIBLE: Politely explain why using the policy rule, and offer a 10% goodwill discount code (WELCOMEBACK10) if appropriate.
    - If NEEDS_HUMAN_REVIEW: Let them know a senior specialist is reviewing their order details within 4 hours.
    Do not invent policies. Keep it under 120 words.
  `,
  model: google("gemini-3.8-flash"),
});
