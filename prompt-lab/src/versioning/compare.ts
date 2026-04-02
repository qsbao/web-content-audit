import type { TestRun, VersionComparison, CaseFlip, MultiComparison, CaseComparison, RunSummary } from "../types.js";

export function compareRuns(baseline: TestRun, current: TestRun): VersionComparison {
  const caseFlips: CaseFlip[] = [];

  for (const currentResult of current.results) {
    const baselineResult = baseline.results.find((r) => r.caseId === currentResult.caseId);
    if (baselineResult) {
      caseFlips.push({
        caseId: currentResult.caseId,
        baselineCorrect: baselineResult.correct,
        currentCorrect: currentResult.correct,
      });
    }
  }

  return {
    ruleId: current.ruleId,
    baseline: {
      runId: baseline.id,
      gitCommit: baseline.gitCommit,
      metrics: baseline.metrics,
      prompt: baseline.promptSnapshot,
    },
    current: {
      runId: current.id,
      gitCommit: current.gitCommit,
      metrics: current.metrics,
      prompt: current.promptSnapshot,
    },
    delta: {
      accuracy: current.metrics.accuracy - baseline.metrics.accuracy,
      precision: current.metrics.precision - baseline.metrics.precision,
      recall: current.metrics.recall - baseline.metrics.recall,
      f1: current.metrics.f1 - baseline.metrics.f1,
    },
    caseFlips,
  };
}

/** Compare N runs side by side with full case input/output details */
export function compareMultipleRuns(runs: TestRun[]): MultiComparison {
  if (runs.length < 2) throw new Error("Need at least 2 runs to compare");

  const ruleId = runs[0].ruleId;

  const runSummaries: RunSummary[] = runs.map((r) => ({
    runId: r.id,
    gitCommit: r.gitCommit,
    timestamp: r.timestamp,
    suiteHash: r.suiteHash ?? "",
    metrics: r.metrics,
    prompt: r.promptSnapshot,
    results: r.results,
  }));

  // Collect all unique case IDs across all runs
  const allCaseIds = new Set<string>();
  for (const run of runs) {
    for (const result of run.results) {
      allCaseIds.add(result.caseId);
    }
  }

  const caseDetails: CaseComparison[] = [];
  for (const caseId of allCaseIds) {
    // Find the input from the first run that has this case
    const firstResult = runs.map((r) => r.results.find((res) => res.caseId === caseId)).find(Boolean);
    const input = firstResult?.input ?? "";

    const perRun = runs.map((run) => {
      const result = run.results.find((r) => r.caseId === caseId);
      return {
        runId: run.id,
        expectedPass: result?.expectedPass ?? false,
        actualPass: result?.actualPass ?? false,
        correct: result?.correct ?? false,
        issues: result?.issues ?? [],
        suggestions: result?.suggestions ?? [],
        rawOutput: result?.rawOutput,
      };
    });

    caseDetails.push({ caseId, input, perRun });
  }

  return { ruleId, runs: runSummaries, caseDetails };
}
