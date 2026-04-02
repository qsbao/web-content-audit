import type { TestCaseResult } from "../types.js";

export interface FailureCase {
  caseId: string;
  input: string;
  expectedPass: boolean;
  actualPass: boolean;
  issues: string[];
}

export function buildMetaPrompt(
  currentPrompt: string,
  ruleDescription: string,
  failures: FailureCase[],
  guidance: string
): string {
  const failureBlocks = failures
    .map(
      (f) => `### Case: ${f.caseId}
Input content:
\`\`\`
${f.input}
\`\`\`
Expected: ${f.expectedPass ? "PASS" : "FAIL"}
Actual: ${f.actualPass ? "PASS" : "FAIL"}
LLM issues returned: ${JSON.stringify(f.issues)}`
    )
    .join("\n\n---\n\n");

  let prompt = `You are an expert at writing LLM evaluation prompts for document auditing.

## Context
A document audit system uses an "evaluation prompt" to check whether a section of a document meets a quality rule. The LLM receives the prompt + section content and returns { pass: boolean, issues: string[], suggestions: string[] }.

## Current Evaluation Prompt
${currentPrompt}

## Rule Description
${ruleDescription}

## Test Failures
The following test cases produced INCORRECT results with the current prompt:

${failureBlocks}

## Task
Analyze why the current prompt leads to these incorrect evaluations, then write an improved version.

Requirements:
1. The prompt must work for BOTH passing and failing content
2. Be specific about what constitutes a pass vs fail
3. Include concrete criteria, not vague instructions
4. Keep the prompt concise (under 500 words)
5. Respond in the same language style as the original prompt`;

  if (guidance) {
    prompt += `

## User Guidance
The user has provided the following advice for improving this prompt:
${guidance}`;
  }

  prompt += `

Return your response in this exact format:

ANALYSIS:
<brief analysis of why the current prompt fails>

IMPROVED PROMPT:
<the improved evaluation prompt text, nothing else>`;

  return prompt;
}

export function parseMetaPromptResponse(response: string): {
  analysis: string;
  improvedPrompt: string;
} {
  const analysisMatch = response.match(/ANALYSIS:\s*([\s\S]*?)(?=IMPROVED PROMPT:)/i);
  const promptMatch = response.match(/IMPROVED PROMPT:\s*([\s\S]*?)$/i);

  return {
    analysis: analysisMatch?.[1]?.trim() ?? "",
    improvedPrompt: promptMatch?.[1]?.trim() ?? response.trim(),
  };
}
