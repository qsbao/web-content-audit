import crypto from "crypto";
import type { OptimizationJob, OptimizationIteration, TestCaseResult } from "../types.js";
import { runTestSuite } from "../runner/runner.js";
import { loadTestSuiteForRule } from "../runner/suite-loader.js";
import { findRule } from "../runner/rule-loader.js";
import { getLLMClient, getLLMModel } from "../runner/llm.js";
import { buildMetaPrompt, parseMetaPromptResponse, type FailureCase } from "./meta-prompt.js";

export interface OptimizeOptions {
  ruleSetId: string;
  ruleId: string;
  targetAccuracy?: number;
  maxIterations?: number;
  guidance?: string;
  onIteration?: (iteration: OptimizationIteration) => void;
  shouldStop?: () => boolean; // for external stop signal
  getGuidance?: () => string; // for live guidance injection
}

export async function optimizePrompt(options: OptimizeOptions): Promise<OptimizationJob> {
  const {
    ruleSetId,
    ruleId,
    targetAccuracy = 0.95,
    maxIterations = 10,
    guidance = "",
    onIteration,
    shouldStop,
    getGuidance,
  } = options;

  const rule = findRule(ruleSetId, ruleId);
  if (!rule) throw new Error(`Rule not found: ${ruleSetId}/${ruleId}`);

  const suite = loadTestSuiteForRule(ruleSetId, ruleId);
  if (!suite || suite.cases.length === 0) throw new Error(`No test suite for ${ruleId}`);

  const job: OptimizationJob = {
    id: crypto.randomUUID(),
    ruleSetId,
    ruleId,
    status: "running",
    targetAccuracy,
    maxIterations,
    guidance,
    liveGuidance: [],
    iterations: [],
    bestIteration: 0,
    startedAt: new Date().toISOString(),
  };

  let currentPrompt = rule.check.evaluationPrompt ?? "";
  let noImprovementCount = 0;

  try {
    for (let i = 0; i < maxIterations; i++) {
      if (shouldStop?.()) {
        job.status = "stopped";
        break;
      }

      // Check for live guidance
      const liveGuide = getGuidance?.();
      if (liveGuide && !job.liveGuidance.includes(liveGuide)) {
        job.liveGuidance.push(liveGuide);
      }

      // Run test suite with current prompt
      const [run] = await runTestSuite({
        ruleSetId,
        ruleId,
        promptOverride: currentPrompt,
        concurrency: 3,
      });

      const metrics = run.metrics;
      const allGuidance = [guidance, ...job.liveGuidance].filter(Boolean).join("\n");

      const iteration: OptimizationIteration = {
        iteration: i,
        prompt: currentPrompt,
        metrics,
        failureAnalysis: "",
        improvementRationale: "",
        guidanceUsed: allGuidance,
      };

      // Check if target reached
      if (metrics.accuracy >= targetAccuracy) {
        iteration.failureAnalysis = "Target accuracy reached.";
        job.iterations.push(iteration);
        onIteration?.(iteration);
        job.status = "completed";
        break;
      }

      // Collect failures for meta-prompt
      const failures: FailureCase[] = run.results
        .filter((r) => !r.correct)
        .map((r) => {
          const testCase = suite.cases.find((c) => c.id === r.caseId);
          return {
            caseId: r.caseId,
            input: testCase?.input ?? "",
            expectedPass: r.expectedPass,
            actualPass: r.actualPass,
            issues: r.issues,
          };
        });

      // Generate improved prompt via meta-LLM call
      const metaPrompt = buildMetaPrompt(currentPrompt, rule.description, failures, allGuidance);
      const llm = getLLMClient();
      const metaResponse = await llm.chat.completions.create({
        model: getLLMModel(),
        messages: [{ role: "user", content: metaPrompt }],
        temperature: 0.3,
      });

      const responseText = metaResponse.choices[0]?.message?.content ?? "";
      const parsed = parseMetaPromptResponse(responseText);

      iteration.failureAnalysis = parsed.analysis;
      iteration.improvementRationale = `Adjusted prompt based on ${failures.length} failure(s).`;
      iteration.tokenUsage = metaResponse.usage
        ? {
            prompt: metaResponse.usage.prompt_tokens,
            completion: metaResponse.usage.completion_tokens,
            total: metaResponse.usage.total_tokens,
          }
        : undefined;

      job.iterations.push(iteration);
      onIteration?.(iteration);

      // Track best iteration
      const bestMetrics = job.iterations[job.bestIteration].metrics;
      if (metrics.accuracy > bestMetrics.accuracy) {
        job.bestIteration = i;
        noImprovementCount = 0;
      } else {
        noImprovementCount++;
      }

      // Early stop if no improvement for 3 consecutive iterations
      if (noImprovementCount >= 3) {
        job.status = "completed";
        break;
      }

      // Use improved prompt for next iteration
      currentPrompt = parsed.improvedPrompt;

      // Mark completed if last iteration
      if (i === maxIterations - 1) {
        job.status = "completed";
      }
    }
  } catch (err) {
    job.status = "failed";
  }

  job.finishedAt = new Date().toISOString();
  return job;
}
