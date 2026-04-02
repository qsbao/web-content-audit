import OpenAI from "openai";
import "dotenv/config";

let client: OpenAI | null = null;

export function getLLMClient(): OpenAI {
  if (!client) {
    const baseURL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) {
      throw new Error("LLM_API_KEY is not set. Copy server/.env.example to prompt-lab/.env and configure it.");
    }
    client = new OpenAI({ baseURL, apiKey });
  }
  return client;
}

export function getLLMModel(): string {
  return process.env.LLM_MODEL || "gpt-4o-mini";
}

export interface ContentEvaluation {
  pass: boolean;
  issues: string[];
  suggestions: string[];
}

export interface EvaluationResult extends ContentEvaluation {
  rawOutput: string; // full LLM response text
  latencyMs: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
}

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 60_000;

export async function evaluateContent(
  sectionContent: string,
  evaluationPrompt: string
): Promise<EvaluationResult> {
  const llm = getLLMClient();
  const model = getLLMModel();
  const startTime = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const response = await llm.chat.completions.create(
      {
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a document auditor. Evaluate the given section content against the rule.

Respond with ONLY a raw JSON object. Do NOT wrap it in markdown code fences or any other formatting.

The JSON must have exactly three fields:
- "pass": a boolean, true if the content meets the rule
- "issues": an array of strings listing specific problems, empty if pass is true
- "suggestions": an array of strings with actionable improvements, empty if pass is true

Be concise. Respond in the same language as the content.`,
          },
          {
            role: "user",
            content: `## Rule\n${evaluationPrompt}\n\n## Section Content\n${sectionContent}`,
          },
        ],
        temperature: 0.1,
      },
      { signal: controller.signal }
    );

    const latencyMs = Date.now() - startTime;
    const usage = response.usage;
    const tokenUsage = usage
      ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens }
      : undefined;

    const text = response.choices[0]?.message?.content ?? "";
    if (!text) {
      return { pass: true, issues: [], suggestions: ["LLM returned empty response"], rawOutput: "", latencyMs, tokenUsage };
    }

    try {
      const parsed = JSON.parse(text) as ContentEvaluation;
      return {
        pass: Boolean(parsed.pass),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        rawOutput: text,
        latencyMs,
        tokenUsage,
      };
    } catch {
      return { pass: true, issues: [], suggestions: ["Failed to parse LLM response"], rawOutput: text, latencyMs, tokenUsage };
    }
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    if (controller.signal.aborted) {
      throw new Error(`LLM call timed out after ${LLM_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
