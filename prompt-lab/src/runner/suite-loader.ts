import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import type { TestSuite } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUITES_DIR = path.resolve(__dirname, "../../test-suites");

export function getSuitesDir(): string {
  return SUITES_DIR;
}

export function loadAllTestSuites(): TestSuite[] {
  if (!fs.existsSync(SUITES_DIR)) return [];

  const suites: TestSuite[] = [];
  const ruleSetDirs = fs.readdirSync(SUITES_DIR, { withFileTypes: true });

  for (const dir of ruleSetDirs) {
    if (!dir.isDirectory()) continue;
    const dirPath = path.join(SUITES_DIR, dir.name);
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    for (const file of files) {
      suites.push(loadTestSuite(path.join(dirPath, file)));
    }
  }

  return suites;
}

export function loadTestSuitesForRuleSet(ruleSetId: string): TestSuite[] {
  const dirPath = path.join(SUITES_DIR, ruleSetId);
  if (!fs.existsSync(dirPath)) return [];

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  return files.map((file) => loadTestSuite(path.join(dirPath, file)));
}

export function loadTestSuiteForRule(ruleSetId: string, ruleId: string): TestSuite | undefined {
  const filePath = path.join(SUITES_DIR, ruleSetId, `${ruleId}.yaml`);
  if (!fs.existsSync(filePath)) {
    const ymlPath = path.join(SUITES_DIR, ruleSetId, `${ruleId}.yml`);
    if (!fs.existsSync(ymlPath)) return undefined;
    return loadTestSuite(ymlPath);
  }
  return loadTestSuite(filePath);
}

export function loadTestSuite(filePath: string): TestSuite {
  const raw = fs.readFileSync(filePath, "utf-8");
  return yaml.load(raw) as TestSuite;
}

export function saveTestSuite(suite: TestSuite): void {
  const dirPath = path.join(SUITES_DIR, suite.ruleSetId);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  const filePath = path.join(dirPath, `${suite.ruleId}.yaml`);
  fs.writeFileSync(filePath, yaml.dump(suite, { lineWidth: -1, noRefs: true }), "utf-8");
}

export function deleteTestSuite(ruleSetId: string, ruleId: string): boolean {
  const filePath = path.join(SUITES_DIR, ruleSetId, `${ruleId}.yaml`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}
