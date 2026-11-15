import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import * as cheerio from "cheerio";

export const scrapePolicyTool = createTool({
  id: "scrape-policy-url",
  description: "Fetches a live store return policy webpage and extracts clean readable text.",
  inputSchema: z.object({
    url: z.string().url().describe("The full URL of the store's return or refund policy page"),
  }),
  outputSchema: z.object({
    policyText: z.string(),
    charCount: z.number(),
  }),
  execute: async ({ context }) => {
    const response = await fetch(context.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SupportPolicyBot/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch policy page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $("script, style, nav, footer, header, noscript, iframe").remove();

    const rawText = $("main").text() || $("body").text();
    const cleanText = rawText.replace(/\s+/g, " ").trim().slice(0, 8000);

    return {
      policyText: cleanText,
      charCount: cleanText.length,
    };
  },
});
