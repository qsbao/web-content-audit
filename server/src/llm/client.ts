import OpenAI from "openai";

let client: OpenAI | null = null;

export function getLLMClient(): OpenAI {
  if (!client) {
    const baseURL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
    const apiKey = process.env.LLM_API_KEY;

    if (!apiKey) {
      throw new Error(
        "LLM_API_KEY is not set. Copy .env.example to .env and configure it."
      );
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

/**
 * Evaluate a section's content against a rule using LLM.
 * Uses JSON mode for structured output.
 */
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 60_000;

export async function evaluateContent(
  sectionContent: string,
  evaluationPrompt: string
): Promise<ContentEvaluation> {
  const llm = getLLMClient();
  const model = getLLMModel();

  const contentPreview = sectionContent.slice(0, 80).replace(/\n/g, " ");
  const promptPreview = evaluationPrompt.slice(0, 80).replace(/\n/g, " ");
  console.log(
    `[LLM] Starting call — model=${model}, content="${contentPreview}…", prompt="${promptPreview}…"`
  );
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

    const elapsed = Date.now() - startTime;
    console.log(
      `[LLM] Completed in ${elapsed}ms — usage: ${JSON.stringify(response.usage ?? {})}`
    );

    const text = response.choices[0]?.message?.content;
    if (!text) {
      console.warn("[LLM] Empty response from model");
      return { pass: true, issues: [], suggestions: ["LLM returned empty response"] };
    }

    try {
      const parsed = JSON.parse(text) as ContentEvaluation;
      return {
        pass: Boolean(parsed.pass),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    } catch {
      console.warn(`[LLM] Failed to parse response: ${text.slice(0, 200)}`);
      return { pass: true, issues: [], suggestions: ["Failed to parse LLM response"] };
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    if (controller.signal.aborted) {
      console.error(`[LLM] Timed out after ${elapsed}ms (limit: ${LLM_TIMEOUT_MS}ms)`);
      throw new Error(`LLM call timed out after ${LLM_TIMEOUT_MS}ms`);
    }
    console.error(`[LLM] Failed after ${elapsed}ms:`, err);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
