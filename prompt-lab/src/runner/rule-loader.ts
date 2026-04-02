import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULESETS_DIR = path.resolve(__dirname, "../../../server/rulesets");

export interface RuleSet {
  id: string;
  documentType: string;
  displayName: string;
  rules: RuleDefinition[];
}

export interface RuleDefinition {
  id: string;
  category: "structure" | "content";
  severity: "error" | "warning" | "info";
  description: string;
  check: { type: "structural" | "content"; evaluationPrompt?: string; targetSection?: string };
}

export function getRuleSetsDir(): string {
  return RULESETS_DIR;
}

export function loadAllRuleSets(): RuleSet[] {
  if (!fs.existsSync(RULESETS_DIR)) return [];
  const files = fs.readdirSync(RULESETS_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  return files.map((file) => loadRuleSet(path.join(RULESETS_DIR, file)));
}

export function loadRuleSet(filePath: string): RuleSet {
  const raw = fs.readFileSync(filePath, "utf-8");
  return yaml.load(raw) as RuleSet;
}

export function findRuleSetById(ruleSetId: string): RuleSet | undefined {
  return loadAllRuleSets().find((rs) => rs.id === ruleSetId);
}

export function getContentRules(ruleSet: RuleSet): RuleDefinition[] {
  return ruleSet.rules.filter((r) => r.check.type === "content");
}

export function findRule(ruleSetId: string, ruleId: string): RuleDefinition | undefined {
  const rs = findRuleSetById(ruleSetId);
  return rs?.rules.find((r) => r.id === ruleId);
}

/**
 * Get the file path for a ruleset YAML (for applying optimized prompts).
 */
export function getRuleSetFilePath(ruleSetId: string): string | undefined {
  if (!fs.existsSync(RULESETS_DIR)) return undefined;
  const files = fs.readdirSync(RULESETS_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  for (const file of files) {
    const filePath = path.join(RULESETS_DIR, file);
    const rs = loadRuleSet(filePath);
    if (rs.id === ruleSetId) return filePath;
  }
  return undefined;
}
