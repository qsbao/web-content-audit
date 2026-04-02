import "dotenv/config";
import { runTestSuite } from "./runner/runner.js";
import { loadAllTestSuites, loadTestSuiteForRule } from "./runner/suite-loader.js";
import { loadAllRuleSets, getContentRules } from "./runner/rule-loader.js";
import { saveTestRun } from "./versioning/results-store.js";
import { loadRunHistory, loadTestRunById } from "./versioning/results-store.js";
import { compareRuns } from "./versioning/compare.js";
import { optimizePrompt } from "./optimizer/optimizer.js";
import type { RuleMetrics } from "./types.js";

// Filter out "--" from argv (pnpm passes it)
const argv = process.argv.slice(2).filter((a) => a !== "--");
const [command, ...args] = argv;

function printMetrics(label: string, m: RuleMetrics) {
  console.log(`\n  ${label}`);
  console.log(`  Accuracy:  ${(m.accuracy * 100).toFixed(1)}%`);
  console.log(`  Precision: ${(m.precision * 100).toFixed(1)}%`);
  console.log(`  Recall:    ${(m.recall * 100).toFixed(1)}%`);
  console.log(`  F1:        ${(m.f1 * 100).toFixed(1)}%`);
  if (m.consistency !== undefined) console.log(`  Consistency: ${(m.consistency * 100).toFixed(1)}%`);
  console.log(`  Avg Latency: ${m.avgLatencyMs.toFixed(0)}ms`);
  console.log(`  Cases: ${m.totalCases} (${m.passExpected} pass, ${m.failExpected} fail)`);
}

async function main() {
  switch (command) {
    case "run": {
      const [ruleSetId, ruleId] = args;
      if (!ruleSetId) {
        console.error("Usage: cli run <ruleSetId> [ruleId]");
        process.exit(1);
      }

      console.log(`Running test suite: ${ruleSetId}${ruleId ? `/${ruleId}` : " (all content rules)"}`);

      const runs = await runTestSuite({
        ruleSetId,
        ruleId,
        onProgress: (p) => process.stdout.write(`\r  [${p.completed}/${p.total}] ${p.currentCase}`),
      });

      for (const run of runs) {
        saveTestRun(run);
        console.log(`\n\n── ${run.ruleId} ──`);
        console.log(`  Commit: ${run.gitCommit.slice(0, 8)} | Model: ${run.model} | Prompt: ${run.promptHash} | Suite: ${run.suiteHash}`);

        printMetrics("Metrics:", run.metrics);

        console.log("\n  Results:");
        for (const r of run.results) {
          const icon = r.correct ? "✓" : "✗";
          const detail = r.correct ? "" : ` (expected ${r.expectedPass ? "pass" : "fail"}, got ${r.actualPass ? "pass" : "fail"})`;
          console.log(`    ${icon} ${r.caseId}${detail} [${r.latencyMs}ms]`);
          if (!r.correct && r.issues.length > 0) {
            for (const issue of r.issues) console.log(`      issue: ${issue}`);
          }
        }
      }
      break;
    }

    case "list": {
      const ruleSets = loadAllRuleSets();
      const suites = loadAllTestSuites();

      console.log("\nRulesets & Content Rules:\n");
      for (const rs of ruleSets) {
        console.log(`  ${rs.id} — ${rs.displayName}`);
        const contentRules = getContentRules(rs);
        for (const rule of contentRules) {
          const suite = suites.find((s) => s.ruleId === rule.id && s.ruleSetId === rs.id);
          const caseCount = suite ? `${suite.cases.length} test cases` : "no test suite";
          console.log(`    ├─ ${rule.id} (${rule.severity}) — ${caseCount}`);
        }
      }
      break;
    }

    case "history": {
      const [ruleId] = args;
      if (!ruleId) {
        console.error("Usage: cli history <ruleId>");
        process.exit(1);
      }

      const history = loadRunHistory(ruleId);
      if (history.length === 0) {
        console.log(`No run history for ${ruleId}`);
        break;
      }

      console.log(`\nRun history for ${ruleId} (${history.length} runs):\n`);
      for (const run of history) {
        const acc = (run.metrics.accuracy * 100).toFixed(1);
        console.log(`  ${run.timestamp} | ${run.gitCommit.slice(0, 8)} | Acc: ${acc}% | Hash: ${run.promptHash}`);
      }
      break;
    }

    case "compare": {
      const [runId1, runId2] = args;
      if (!runId1 || !runId2) {
        console.error("Usage: cli compare <runId1> <runId2>");
        process.exit(1);
      }

      const baseline = loadTestRunById(runId1);
      const current = loadTestRunById(runId2);
      if (!baseline || !current) {
        console.error("Run not found");
        process.exit(1);
      }

      const comparison = compareRuns(baseline, current);
      console.log(`\nComparing: ${comparison.baseline.gitCommit.slice(0, 8)} → ${comparison.current.gitCommit.slice(0, 8)}`);

      printMetrics("Baseline:", comparison.baseline.metrics);
      printMetrics("Current:", comparison.current.metrics);

      console.log("\n  Delta:");
      console.log(`    Accuracy:  ${comparison.delta.accuracy >= 0 ? "+" : ""}${(comparison.delta.accuracy * 100).toFixed(1)}%`);
      console.log(`    F1:        ${comparison.delta.f1 >= 0 ? "+" : ""}${(comparison.delta.f1 * 100).toFixed(1)}%`);

      const flips = comparison.caseFlips.filter((f) => f.baselineCorrect !== f.currentCorrect);
      if (flips.length > 0) {
        console.log("\n  Case Flips:");
        for (const flip of flips) {
          const direction = flip.currentCorrect ? "✗→✓ fixed" : "✓→✗ regressed";
          console.log(`    ${direction}: ${flip.caseId}`);
        }
      }
      break;
    }

    case "optimize": {
      const [ruleSetId, ruleId, guidanceArg] = args;
      if (!ruleSetId || !ruleId) {
        console.error("Usage: cli optimize <ruleSetId> <ruleId> [guidance]");
        process.exit(1);
      }

      console.log(`Optimizing: ${ruleSetId}/${ruleId}`);
      if (guidanceArg) console.log(`Guidance: ${guidanceArg}`);

      const job = await optimizePrompt({
        ruleSetId,
        ruleId,
        guidance: guidanceArg ?? "",
        onIteration: (iter) => {
          const acc = (iter.metrics.accuracy * 100).toFixed(1);
          console.log(`\n  [Iteration ${iter.iteration}] Accuracy: ${acc}%`);
          if (iter.failureAnalysis) console.log(`  Analysis: ${iter.failureAnalysis.slice(0, 200)}`);
        },
      });

      console.log(`\n\nOptimization ${job.status} (${job.iterations.length} iterations)`);
      const best = job.iterations[job.bestIteration];
      if (best) {
        printMetrics("Best metrics:", best.metrics);
        console.log(`\n  Best prompt (iteration ${job.bestIteration}):`);
        console.log(`  ---`);
        console.log(best.prompt);
        console.log(`  ---`);
      }
      break;
    }

    default:
      console.log(`
Prompt Lab CLI

Usage:
  cli run <ruleSetId> [ruleId]              Run test suite
  cli list                                  List rulesets and test suites
  cli history <ruleId>                      Show run history
  cli compare <runId1> <runId2>             Compare two runs
  cli optimize <ruleSetId> <ruleId> [hint]  Auto-optimize a rule's prompt
      `);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
