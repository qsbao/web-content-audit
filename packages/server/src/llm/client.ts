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
export async function evaluateContent(
  sectionContent: string,
  evaluationPrompt: string
): Promise<ContentEvaluation> {
  const llm = getLLMClient();
  const model = getLLMModel();

  const response = await llm.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a document auditor. Evaluate the given section content against the rule.
Return a JSON object with exactly these fields:
- "pass": boolean (true if content meets the rule, false otherwise)
- "issues": string[] (list of specific problems found, empty if pass)
- "suggestions": string[] (actionable improvement suggestions, empty if pass)

Be concise. Respond in the same language as the content.`,
      },
      {
        role: "user",
        content: `## Rule\n${evaluationPrompt}\n\n## Section Content\n${sectionContent}`,
      },
    ],
    temperature: 0.1,
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
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
    return { pass: true, issues: [], suggestions: ["Failed to parse LLM response"] };
  }
}
