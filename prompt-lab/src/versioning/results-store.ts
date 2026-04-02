import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { TestRun } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, "../../results");

function ensureDir() {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

export function saveTestRun(run: TestRun): void {
  ensureDir();
  const fileName = `${run.ruleId}-${run.timestamp.replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(path.join(RESULTS_DIR, fileName), JSON.stringify(run, null, 2), "utf-8");
}

export function loadAllTestRuns(): TestRun[] {
  ensureDir();
  const files = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), "utf-8")) as TestRun)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function loadRunHistory(ruleId: string): TestRun[] {
  return loadAllTestRuns().filter((r) => r.ruleId === ruleId);
}

export function loadTestRunById(runId: string): TestRun | undefined {
  return loadAllTestRuns().find((r) => r.id === runId);
}
