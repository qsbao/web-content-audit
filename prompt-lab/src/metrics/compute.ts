import type { RuleMetrics, TestCaseResult } from "../types.js";

export function computeMetrics(results: TestCaseResult[]): RuleMetrics {
  const total = results.length;
  if (total === 0) {
    return { accuracy: 0, precision: 0, recall: 0, f1: 0, totalCases: 0, passExpected: 0, failExpected: 0, avgLatencyMs: 0 };
  }

  // "pass" is the positive class
  let tp = 0, fp = 0, fn = 0, tn = 0;
  let totalLatency = 0;

  for (const r of results) {
    totalLatency += r.latencyMs;
    if (r.expectedPass && r.actualPass) tp++;
    else if (!r.expectedPass && r.actualPass) fp++;
    else if (r.expectedPass && !r.actualPass) fn++;
    else tn++;
  }

  const accuracy = (tp + tn) / total;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    accuracy,
    precision,
    recall,
    f1,
    totalCases: total,
    passExpected: tp + fn,
    failExpected: fp + tn,
    avgLatencyMs: totalLatency / total,
  };
}

/**
 * Compute consistency across repeated runs.
 * For each case, check what fraction of runs agree on the same verdict.
 * Returns average agreement rate (0-1).
 */
export function computeConsistency(runs: TestCaseResult[][]): number {
  if (runs.length <= 1) return 1;

  const caseIds = runs[0].map((r) => r.caseId);
  let totalAgreement = 0;

  for (const caseId of caseIds) {
    const verdicts = runs.map((run) => {
      const result = run.find((r) => r.caseId === caseId);
      return result?.actualPass;
    });
    const passCount = verdicts.filter((v) => v === true).length;
    const failCount = verdicts.filter((v) => v === false).length;
    const majority = Math.max(passCount, failCount);
    totalAgreement += majority / runs.length;
  }

  return totalAgreement / caseIds.length;
}
