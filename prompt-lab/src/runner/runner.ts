import crypto from "crypto";
import pLimit from "p-limit";
import type { RunnerOptions, TestRun, TestCaseResult, TestSuite } from "../types.js";
import { loadTestSuiteForRule, loadTestSuitesForRuleSet } from "./suite-loader.js";
import { findRuleSetById, getContentRules, findRule } from "./rule-loader.js";
import { evaluateContent } from "./llm.js";
import { getLLMModel } from "./llm.js";
import { withRetry } from "./rate-limiter.js";
import { computeMetrics, computeConsistency } from "../metrics/compute.js";
import { captureSnapshot } from "../versioning/snapshot.js";

export async function runTestSuite(options: RunnerOptions): Promise<TestRun[]> {
  const { ruleSetId, ruleId, concurrency = 3, repeatCount = 1, promptOverride, onProgress } = options;

  const ruleSet = findRuleSetById(ruleSetId);
  if (!ruleSet) throw new Error(`RuleSet not found: ${ruleSetId}`);

  // Determine which rules to test
  const contentRules = ruleId
    ? [findRule(ruleSetId, ruleId)].filter(Boolean)
    : getContentRules(ruleSet);

  if (contentRules.length === 0) throw new Error(`No content rules found for ${ruleSetId}${ruleId ? `/${ruleId}` : ""}`);

  const runs: TestRun[] = [];

  for (const rule of contentRules) {
    if (!rule || rule.check.type !== "content") continue;

    const suite = loadTestSuiteForRule(ruleSetId, rule.id);
    if (!suite || suite.cases.length === 0) {
      console.log(`[runner] No test suite for ${rule.id}, skipping`);
      continue;
    }

    const prompt = promptOverride ?? rule.check.evaluationPrompt!;
    const snapshot = await captureSnapshot(ruleSetId, rule.id);
    const allRepeatResults: TestCaseResult[][] = [];

    for (let rep = 0; rep < repeatCount; rep++) {
      const results = await runSingleSuite(suite, prompt, concurrency, onProgress);
      allRepeatResults.push(results);
    }

    // Use first run for primary results, compute consistency if repeated
    const primaryResults = allRepeatResults[0];
    const metrics = computeMetrics(primaryResults);
    if (repeatCount > 1) {
      metrics.consistency = computeConsistency(allRepeatResults);
    }

    const promptHash = crypto.createHash("sha256").update(prompt).digest("hex").slice(0, 16);
    const suiteContent = JSON.stringify(suite.cases.map((c) => ({ id: c.id, input: c.input, expected: c.expected })));
    const suiteHash = crypto.createHash("sha256").update(suiteContent).digest("hex").slice(0, 16);

    runs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      gitCommit: snapshot.gitCommit,
      gitBranch: snapshot.gitBranch,
      ruleSetId,
      ruleId: rule.id,
      promptSnapshot: prompt,
      promptHash,
      suiteHash,
      model: getLLMModel(),
      results: primaryResults,
      metrics,
    });
  }

  return runs;
}

async function runSingleSuite(
  suite: TestSuite,
  prompt: string,
  concurrency: number,
  onProgress?: (progress: { completed: number; total: number; currentCase: string }) => void
): Promise<TestCaseResult[]> {
  const limit = pLimit(concurrency);
  let completed = 0;
  const total = suite.cases.length;

  const tasks = suite.cases.map((testCase) =>
    limit(async (): Promise<TestCaseResult> => {
      onProgress?.({ completed, total, currentCase: testCase.id });

      const result = await withRetry(() => evaluateContent(testCase.input, prompt));

      const issuesMentionCheck = testCase.expected.issuesMustMention?.map((keyword) => ({
        keyword,
        found: result.issues.some((issue) => issue.toLowerCase().includes(keyword.toLowerCase())),
      }));

      completed++;
      onProgress?.({ completed, total, currentCase: testCase.id });

      return {
        caseId: testCase.id,
        input: testCase.input,
        expectedPass: testCase.expected.pass,
        actualPass: result.pass,
        correct: testCase.expected.pass === result.pass,
        issues: result.issues,
        suggestions: result.suggestions,
        rawOutput: result.rawOutput,
        issuesMentionCheck,
        latencyMs: result.latencyMs,
        tokenUsage: result.tokenUsage,
      };
    })
  );

  return Promise.all(tasks);
}
