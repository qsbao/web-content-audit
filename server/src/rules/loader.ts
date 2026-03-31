import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import type { RuleSet } from "@web-content-audit/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULESETS_DIR = path.resolve(__dirname, "../../rulesets");

export function loadAllRuleSets(): RuleSet[] {
  if (!fs.existsSync(RULESETS_DIR)) return [];

  const files = fs.readdirSync(RULESETS_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  return files.map((file) => loadRuleSet(path.join(RULESETS_DIR, file)));
}

export function loadRuleSet(filePath: string): RuleSet {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw) as RuleSet;
  return parsed;
}

export function findRuleSet(
  ruleSets: RuleSet[],
  opts: { ruleSetId?: string; documentType?: string; title?: string; url?: string }
): RuleSet | undefined {
  if (opts.ruleSetId) {
    return ruleSets.find((rs) => rs.id === opts.ruleSetId);
  }

  if (opts.documentType) {
    return ruleSets.find((rs) => rs.documentType === opts.documentType);
  }

  // Auto-match by title or URL patterns
  for (const rs of ruleSets) {
    const { titlePattern, urlPattern } = rs.matchPattern;
    if (titlePattern && opts.title && new RegExp(titlePattern, "i").test(opts.title)) {
      return rs;
    }
    if (urlPattern && opts.url && new RegExp(urlPattern, "i").test(opts.url)) {
      return rs;
    }
  }

  return undefined;
}
